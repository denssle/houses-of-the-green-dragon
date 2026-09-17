import * as chronicleService from '$lib/server/service/chronicleService';
import * as productionService from '$lib/server/service/productionService';
import { Op, type Transaction } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { ShopOffer } from '$lib/db/model/shop';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { Plot } from '$lib/db/model/plot';
import * as treasuryService from '$lib/server/service/treasuryService';
import { chooseHeir, type Child, splitEstate } from '$lib/game/inheritance.logic';
import {
	type DeathCause,
	diesThisTick,
	dominantRisk,
	MORTALITY_ONSET_AGE
} from '$lib/game/mortality.logic';
import {
	currentSatiety,
	starvationRiskPerYear,
	TICKS_BEFORE_STARVATION_POSSIBLE
} from '$lib/game/need.logic';
import { checkName, type NameCheck, stillNameable } from '$lib/game/naming.logic';
import { personalityLabel } from '$lib/game/personality.logic';
import { ageInYears, yearsToTicks } from '$lib/game/time';

/**
 * Sterben und Erben.
 *
 * Das Gegenstück zum Takt aus 4.1: Der Tod muss auch dann eintreten, wenn niemand
 * hinsieht — sonst stürben nur die Charaktere aktiver Spieler, und die Stadt füllte sich
 * mit unsterblichen NPCs. Deshalb ein Durchlauf je Tick statt fauler Auswertung beim
 * Lesen, anders als beim Aktionsbudget: Ein Todesfall betrifft nicht nur den Toten,
 * sondern seine Kinder, seinen Besitz und die Stadtkasse.
 *
 * Teuer ist der Durchlauf trotzdem nicht: Vor `MORTALITY_ONSET_AGE` ist das Risiko null,
 * also fragt die Abfrage nur die Alten ab. Und weil verpasste Ticks übersprungen werden
 * (4.1), gibt es je Herzschlag genau **einen** Wurf je Charakter — ein Serverausfall
 * lässt niemanden nachträglich sterben.
 */

/** Was bei einem Todesfall geschehen ist — für das Log und die Tests. */
export interface Death {
	characterId: string;
	name: string;
	age: number;
	heirId: string | null;
	/** Gesetzt, wenn mit ihm ein Haus erloschen ist. */
	extinctDynastyId: string | null;
	/**
	 * Das Risiko, das überwog — `dominantRisk`. Eine Zuschreibung und kein Befund: Der
	 * Wurf kennt nur die Summe aus Alter und Not.
	 */
	cause: DeathCause;
}

/**
 * Ein Herzschlag lang sterben lassen.
 *
 * Der Zufall kommt als Parameter herein, damit Tests einen Todesfall erzwingen können,
 * ohne auf einen glücklichen Wurf zu warten.
 */
export async function reapTheDead(
	tick: number,
	roll: () => number = Math.random
): Promise<Death[]> {
	const alt = await Character.findAll({
		where: {
			deathTick: null,
			// Zwei Wege ins Grab, und die Abfrage muss beide kennen: das Alter und die Not.
			// Wer jung und satt ist, hat ein Risiko von null — das spart den Wurf fuer die
			// Mehrheit der Bevoelkerung. Die zweite Zeile ist bewusst grosszuegig: Sie holt,
			// wer laenger nicht gegessen hat, die genaue Rechnung folgt in JavaScript.
			[Op.or]: [
				{ birthTick: { [Op.lte]: tick - yearsToTicks(MORTALITY_ONSET_AGE) } },
				{ lastNeedTick: { [Op.lte]: tick - TICKS_BEFORE_STARVATION_POSSIBLE } }
			]
		},
		attributes: ['id', 'birthTick', 'satiety', 'lastNeedTick']
	});

	const gestorben: Death[] = [];
	for (const kandidat of alt) {
		const alter: number = ageInYears(kandidat.dataValues.birthTick, tick);
		// Die Not addiert sich zum Alter, sie vervielfacht es nicht: Vor vierzig ist das
		// Altersrisiko null, und jedes Vielfache von null bliebe null. Wer verhungert,
		// stirbt auch mit zwanzig.
		const not: number = starvationRiskPerYear(
			currentSatiety(kandidat.dataValues.satiety, kandidat.dataValues.lastNeedTick, tick)
		);
		if (!diesThisTick(alter, roll(), not)) continue;

		// Jeder Todesfall in eigener Transaktion: Ein Fehler beim Nachlass des einen darf
		// die übrigen nicht mitreißen.
		const fall = await die(kandidat.dataValues.id, tick, dominantRisk(alter, not));
		if (fall) gestorben.push(fall);
	}
	return gestorben;
}

/**
 * Lässt einen Charakter sterben und wickelt den Nachlass ab.
 *
 * Alles in einer Transaktion: Ein halb vollzogener Erbfall — Tote ohne Erben, Häuser
 * ohne Eigentümer — wäre nicht reparierbar, weil niemand mehr wüsste, wem was gehörte.
 *
 * Gibt `null` zurück, wenn der Charakter schon tot war. Das ist kein Fehler, sondern der
 * Normalfall bei zwei Durchläufen, die sich überholen.
 */
export async function die(
	characterId: string,
	tick: number,
	cause: DeathCause = 'AGE'
): Promise<Death | null> {
	return sequelize.transaction(async (t: Transaction) => {
		const tot = await Character.findByPk(characterId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!tot || tot.dataValues.deathTick !== null) return null;

		const kinder = await erbfaehigeKinder(characterId, tot.dataValues.DynastyId, t);
		const erbeId: string | null = chooseHeir(tot.dataValues.heirId, kinder, tick);
		const geschwister: string[] = kinder.map((kind) => kind.id).filter((id) => id !== erbeId);

		// Der überlebende Ehepartner — nur, wenn er den Tod tatsächlich überlebt hat.
		// Sterben beide im selben Durchlauf, ist der Zweite kein Hinterbliebener mehr.
		const witwe = tot.dataValues.spouseId
			? await Character.findByPk(tot.dataValues.spouseId, { transaction: t, lock: t.LOCK.UPDATE })
			: null;
		const hinterbliebener = witwe && witwe.dataValues.deathTick === null ? witwe : null;

		const geteilt = splitEstate(
			tot.dataValues.money,
			erbeId !== null,
			geschwister.length,
			undefined,
			hinterbliebener !== null
		);

		// Erst der Tote: Sein Vermögen ist ab hier verteilt, nicht mehr seines.
		await tot.update({ deathTick: tick, money: 0 }, { transaction: t });

		// **Die Pacht fällt an die Stadt zurück, und der Hof fällt mit ihr** (Punkt 8).
		// Genau das unterscheidet Pacht von Eigentum — sonst sicherte sich die erste
		// Generation die guten Flächen auf Dauer.
		//
		// **Vor dem Erbfall, nicht danach** (Punkt 99): Was mit der Pacht fällt, darf
		// vorher weder vererbt noch der Stadt zugeschlagen werden. Stünde es weiter unten,
		// ginge der Hof erst an den Erben und verschwände ihm dann unter den Händen.
		await productionService.releaseLeases(characterId, t);

		if (hinterbliebener) {
			// **Die Ehe endet mit dem Tod.** Bis hierher blieb `spouseId` auf einen Toten
			// stehen — mit zwei Folgen, die beide falsch waren: Die Witwe konnte nicht wieder
			// heiraten (`canMarry` sieht eine bestehende Ehe), und sie konnte weiterhin
			// empfangen, weil die Empfängnis nur prüft, **ob** ein Partner eingetragen ist.
			await hinterbliebener.update(
				{ spouseId: null, money: hinterbliebener.dataValues.money + geteilt.spouse },
				{ transaction: t }
			);
		}

		if (erbeId) {
			await Character.increment('money', {
				by: geteilt.heir,
				where: { id: erbeId },
				transaction: t
			});
			if (geteilt.perSibling > 0) {
				await Character.increment('money', {
					by: geteilt.perSibling,
					where: { id: { [Op.in]: geschwister } },
					transaction: t
				});
			}
			await besitzUebertragen(characterId, erbeId, t);
		} else {
			await anDieStadt(tot.dataValues.RegionId, geteilt.toCity, characterId, t, tick);
		}

		const erloschen: string | null = await hausFortfuehren(
			tot.dataValues.DynastyId,
			tot.dataValues.role === 'PLAYER',
			erbeId,
			tick,
			t
		);

		const alter: number = ageInYears(tot.dataValues.birthTick, tick);
		await chronicleService.record(
			'DEATH',
			tot.dataValues.RegionId,
			tick,
			{ subjectId: characterId, dynastyId: tot.dataValues.DynastyId, value: alter },
			t
		);
		if (erbeId) {
			await chronicleService.record(
				'INHERITANCE',
				tot.dataValues.RegionId,
				tick,
				{ subjectId: characterId, objectId: erbeId, value: geteilt.heir },
				t
			);
		}
		if (erloschen) {
			await chronicleService.record(
				'DYNASTY_EXTINCT',
				tot.dataValues.RegionId,
				tick,
				{ dynastyId: erloschen },
				t
			);
		}

		return {
			characterId,
			name: tot.dataValues.firstName,
			age: alter,
			heirId: erbeId,
			extinctDynastyId: erloschen,
			cause
		};
	});
}

/**
 * Benennt einen Erben.
 *
 * Geprüft wird gegen die erbfähigen Kinder, nicht gegen die Datenbankbeziehung: Ein
 * Fremder, ein Toter, ein Geschwisterkind oder ein Kind aus dem anderen Haus soll hier
 * nicht hineinrutschen. `null` nimmt die Benennung zurück — dann greift wieder die
 * gesetzliche Reihenfolge.
 */
export async function designateHeir(characterId: string, heirId: string | null): Promise<boolean> {
	if (heirId === null) {
		await Character.update({ heirId: null }, { where: { id: characterId } });
		return true;
	}

	// **Dieselbe Menge wie bei der Erbfolge** — sonst benennt jemand ein Kind aus dem
	// anderen Haus, und `chooseHeir()` übergeht die Benennung beim Erbfall stillschweigend.
	const benennbar = await Character.findByPk(characterId, { attributes: ['DynastyId'] });
	if (!benennbar) return false;

	const kinder = await erbfaehigeKinder(characterId, benennbar.dataValues.DynastyId);
	if (!kinder.some((kind) => kind.id === heirId)) return false;

	await Character.update({ heirId }, { where: { id: characterId } });
	return true;
}

/**
 * Ein Kind benennen.
 *
 * Die Welt vergibt bei der Geburt einen Namen, weil sie nicht auf den Spieler wartet —
 * ein namenloses Kind wäre ein Loch in der Chronik. Bis zur Volljährigkeit darf er ihn
 * ändern; danach steht der Name fest, denn die Chronik hält Ereignisse fest, deren
 * Handelnder nicht später anders heißen soll.
 *
 * Geprüft wird gegen die eigenen lebenden Kinder, damit ein fremdes Kind hier nicht
 * hineinrutscht — **bewusst weiter gefasst als die Erbenwahl**: Wer ein Kind gezeugt oder
 * geboren hat, darf es benennen, auch wenn es im Haus des anderen Elternteils steht und
 * dort nicht erbt. Der Name ist eine Sache zwischen Eltern und Kind, das Erbe eine des
 * Hauses.
 */
export async function renameChild(
	parentId: string,
	childId: string,
	wunsch: string,
	tick: number
): Promise<NameCheck> {
	const kinder = await lebendeKinder(parentId);
	if (!kinder.some((kind) => kind.id === childId)) return { ok: false, reason: 'NOT_YOURS' };

	const kind = await Character.findByPk(childId);
	if (!kind) return { ok: false, reason: 'NOT_YOURS' };
	if (!stillNameable(kind.dataValues.birthTick, tick)) return { ok: false, reason: 'TOO_OLD' };

	// Die Geschwister, gegen die geprüft wird — das Kind selbst nicht, sonst ließe sich
	// sein eigener Name nie bestätigen.
	const geschwister = await Character.findAll({
		where: {
			deathTick: null,
			id: { [Op.ne]: childId },
			[Op.or]: [{ motherId: parentId }, { fatherId: parentId }]
		},
		attributes: ['firstName']
	});

	const geprueft = checkName(
		wunsch,
		geschwister.map((person) => person.dataValues.firstName)
	);
	if (!geprueft.ok) return geprueft;

	await Character.update({ firstName: geprueft.name }, { where: { id: childId } });
	return geprueft;
}

/** Ein Kind, wie es auf der Charakterseite steht. */
export interface ChildOnList {
	id: string;
	firstName: string;
	age: number;
	isHeir: boolean;
	/** Ob es noch umbenannt werden darf — mit der Volljährigkeit steht der Name fest. */
	nameable: boolean;
	/**
	 * Das Etikett der Anlagen — „die Gierige", „der Fleißige".
	 *
	 * Steht hier, weil es die Erbenwahl von einer Frage des Geburtsdatums zu einer
	 * Entscheidung macht: der gierige Älteste oder die fleißige Zweite?
	 */
	nature: string;
}

/** Die lebenden Kinder mit Namen und Alter, für die Erbenwahl. */
export async function getChildren(characterId: string, tick: number): Promise<ChildOnList[]> {
	const eltern = await Character.findByPk(characterId);
	if (!eltern) return [];

	const gefunden = await Character.findAll({
		where: {
			deathTick: null,
			[Op.or]: [{ motherId: characterId }, { fatherId: characterId }]
		},
		order: [['birthTick', 'ASC']]
	});

	return gefunden.map((kind) => ({
		id: kind.dataValues.id,
		firstName: kind.dataValues.firstName,
		age: ageInYears(kind.dataValues.birthTick, tick),
		isHeir: kind.dataValues.id === eltern.dataValues.heirId,
		nameable: stillNameable(kind.dataValues.birthTick, tick),
		nature: personalityLabel(
			{
				courage: kind.dataValues.courage,
				diligence: kind.dataValues.diligence,
				greed: kind.dataValues.greed,
				sociability: kind.dataValues.sociability,
				ambition: kind.dataValues.ambition,
				agreeableness: kind.dataValues.agreeableness
			},
			kind.dataValues.gender
		)
	}));
}

/**
 * Die lebenden Kinder, **die zum selben Haus gehören** — die Menge, aus der geerbt wird.
 *
 * Nicht jedes Kind steht im Haus seiner Mutter: `assignDynasty()` steckt es bei zwei
 * verschiedenen Elternhäusern in genau eines, bei zwei NPCs per Wurf. Ein Kind im anderen
 * Haus trägt einen anderen Namen — und erbt deshalb nicht.
 *
 * Ohne diese Einschränkung nahm `chooseHeir()` auch ein Kind aus einem fremden Haus, und
 * `hausFortfuehren()` sah daraufhin einen Erben, wo keiner war: Das Haus blieb bestehen,
 * obwohl niemand mehr darin lebte (Haus Weber in Produktion, Tick 5362). Bei einem
 * gespielten Haus wäre es schlimmer ausgegangen — der Spieler hätte eine Figur im
 * **fremden** Haus übernommen, während `dynastyService` ihm weiter die leere Hülle als
 * sein Haus gezeigt hätte.
 *
 * Ein Charakter ohne Haus hat nichts weiterzugeben, an dem ein Name hinge; für ihn bleibt
 * es bei allen leiblichen Kindern.
 */
export async function erbfaehigeKinder(
	characterId: string,
	dynastyId: string | null,
	transaction?: Transaction
): Promise<Child[]> {
	return lebendeKinder(characterId, transaction, dynastyId);
}

/**
 * Die lebenden Kinder eines Charakters — Mutter oder Vater, das ist hier gleich.
 *
 * `nurHaus` schränkt auf ein Haus ein; ohne die Angabe kommen alle leiblichen Kinder,
 * auch die aus einem anderen Haus. Für die Erbfolge ist `erbfaehigeKinder()` der richtige
 * Einstieg, für alles Leibliche — Benennen etwa — dieser hier.
 */
export async function lebendeKinder(
	characterId: string,
	transaction?: Transaction,
	nurHaus?: string | null
): Promise<Child[]> {
	const gefunden = await Character.findAll({
		where: {
			deathTick: null,
			[Op.or]: [{ motherId: characterId }, { fatherId: characterId }],
			// `undefined` liesse Sequelize die Bedingung weglassen, `null` suchte nach
			// hauslosen Kindern — beides nicht gemeint, deshalb die Fallunterscheidung.
			...(nurHaus ? { DynastyId: nurHaus } : {})
		},
		attributes: ['id', 'birthTick'],
		transaction
	});
	return gefunden.map((kind) => ({
		id: kind.dataValues.id,
		birthTick: kind.dataValues.birthTick
	}));
}

/**
 * Grundstücke und Gebäude gehen ungeteilt an den Erben.
 *
 * `ownerType` bleibt `CHARACTER` — es wechselt nur die Person. Wichtig für den Fall,
 * dass der Erbe später selbst stirbt: Der Besitz wandert weiter, statt sich zu häufen.
 */
async function besitzUebertragen(vonId: string, anId: string, t: Transaction): Promise<void> {
	await Plot.update(
		{ OwnerCharacterId: anId },
		{ where: { OwnerCharacterId: vonId }, transaction: t }
	);
	await Building.update(
		{ OwnerCharacterId: anId },
		{ where: { OwnerCharacterId: vonId }, transaction: t }
	);
	// **Und die Preisschilder wechseln mit** (5.83, Punkt 108). Bis hierher blieben sie am
	// Toten hängen: Ein Käufer zahlte weiter an ihn, `buyFromOffer` schrieb den Erlös per
	// `increment` einer Leiche gut, und weil die Geldmenge nur Lebende zählt, war das Geld
	// aus der Welt. Ein stiller Verlust, den keine Buchung zeigte — die Ware lag ja
	// weiterhin im Haus des Erben und wurde ordentlich geliefert.
	await ShopOffer.update(
		{ SellerCharacterId: anId },
		{ where: { SellerCharacterId: vonId }, transaction: t }
	);
}

/**
 * Wer ohne Erben stirbt, dessen Besitz fällt an die öffentliche Hand.
 *
 * Nicht ins Nichts und nicht an einen zufälligen Nachbarn: Die Stadt kann Boden und
 * Häuser neu vergeben, und knappes Bauland bekommt damit einen Rückweg. `ownerType`
 * wechselt auf `CITY` — nicht auf `NONE`: `NONE` heißt „nie vergeben" und würde ein
 * bebautes Grundstück wieder zum Erstverkauf freigeben.
 *
 * **Der Tick des Heimfalls wird festgehalten** (5.42, Punkt 79). Ohne ihn wäre die Kate
 * vom Rathaus nicht zu unterscheiden, und der „Rückweg" endete im Stadtbesitz: Die Stadt
 * hielt instand, was sie weitergeben sollte, und das Grundstück blieb für immer bebaut.
 * Mit ihm kommt das Anwesen in die Versteigerung (`auctionEscheatedEstates`).
 */
async function anDieStadt(
	regionId: string,
	geld: number,
	verstorbenId: string,
	t: Transaction,
	tick: number
): Promise<void> {
	await treasuryService.einnehmen(regionId, geld, 'ESCHEAT', t);
	await Plot.update(
		{ ownerType: 'CITY', OwnerCharacterId: null, forSalePrice: null },
		{ where: { OwnerCharacterId: verstorbenId }, transaction: t }
	);
	await Building.update(
		{ ownerType: 'CITY', OwnerCharacterId: null, forSalePrice: null, escheatedTick: tick },
		{ where: { OwnerCharacterId: verstorbenId }, transaction: t }
	);
	// **Und die Preisschilder kommen herunter** (5.83, Punkt 108). Es gibt niemanden mehr,
	// dem der Erlös zustünde — bliebe das Angebot hängen, zahlte der nächste Käufer an
	// einen Toten, und das Geld wäre aus der Welt. Die **Ware** bleibt, wo sie liegt: Sie
	// gehört zum Haus und fällt mit ihm an die Stadt.
	await ShopOffer.destroy({ where: { SellerCharacterId: verstorbenId }, transaction: t });
}

/**
 * Das Haus geht weiter — oder es ist am Ende.
 *
 * Der Erbe wird zum gespielten Charakter; die Dynastie bleibt, der Benutzer bleibt, nur
 * die Figur ist eine andere. Ohne Erben erlischt das Haus, und der Benutzer beginnt mit
 * einem neuen bei null.
 *
 * Gibt die ID der erloschenen Dynastie zurück, sonst `null`.
 */
async function hausFortfuehren(
	dynastyId: string | null,
	warGespielt: boolean,
	erbeId: string | null,
	tick: number,
	t: Transaction
): Promise<string | null> {
	if (!dynastyId) return null;

	// Der Erbe rückt nach — aber gespielt wird er nur, wenn auch der Verstorbene gespielt
	// wurde. In einem NPC-Haus (5.10) erbt ein NPC von einem NPC.
	if (erbeId) {
		if (warGespielt) {
			await Character.update({ role: 'PLAYER' }, { where: { id: erbeId }, transaction: t });
		}
		return null;
	}

	// **Auch ein Haus ohne Spieler erlischt** (5.10). Dieselbe Regel für alle: Wer ohne
	// Erben stirbt, dessen Linie endet. Vorher galt sie nur für gespielte Häuser, weil
	// NPCs zu keinem gehörten — jetzt gehören sie zu einem, und ein Nachname, den niemand
	// mehr trägt, gehört zu einer Familie, die es nicht mehr gibt.
	//
	// Geprüft wird gegen die **lebenden** Angehörigen: Ein Haus endet erst mit dem
	// letzten. Der Verstorbene ist zu diesem Zeitpunkt bereits als tot eingetragen.
	const nochLebende: number = await Character.count({
		where: { DynastyId: dynastyId, deathTick: null },
		transaction: t
	});
	if (nochLebende > 0) return null;

	await Dynasty.update(
		{ isExtinct: true, extinctAtTick: tick },
		{ where: { id: dynastyId }, transaction: t }
	);
	return dynastyId;
}
