import { affectionBonus, garmentIntact } from '$lib/game/attire.logic';
import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Character } from '$lib/db/model/character';
import type {
	CharacterAttributes,
	CharacterCreationAttributes
} from '$lib/db/attributes/character.attributes';
import type { Model } from 'sequelize';
import {
	assignDynasty,
	canMarry,
	type Candidate,
	conceives,
	court,
	isDue
} from '$lib/game/family.logic';
import { SATIETY_MAX } from '$lib/game/need.logic';
import { inheritPersonality, type Personality } from '$lib/game/personality.logic';
import { AGE_OF_MAJORITY, ageInYears, yearsToTicks } from '$lib/game/time';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as needService from '$lib/server/service/needService';
import * as relationshipService from '$lib/server/service/relationshipService';
import * as worldService from '$lib/server/service/worldService';
import { NEUGEBORENE } from '$lib/db/names';

/**
 * Familie: werben, heiraten, Kinder bekommen — und die Bevölkerung, die daraus entsteht.
 *
 * Zwei Dinge laufen hier zusammen, die man leicht trennen würde:
 *
 * - **Die Handlungen des Spielers** (werben, Antrag, Annahme) kosten Aktionspunkte und
 *   laufen über `loadForAction` wie jede andere Handlung.
 * - **Der Lauf der Dinge** (Empfängnis, Geburt) hängt am Welt-Takt, nicht an
 *   Seitenaufrufen. Sonst bekämen nur die Charaktere aktiver Spieler Kinder, und die
 *   Stadt stürbe aus, während niemand hinsieht.
 *
 * Beides benutzt **dieselben** Regeln aus `family.logic.ts`. Ein eigener Satz für NPCs
 * würde abdriften, und dann wüsste niemand mehr, ob eine Beobachtung an der Welt liegt
 * oder an zwei verschiedenen Rechnungen.
 */

export type FamilyResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/**
 * Ein Antrag endet auf zwei Arten: Bei einem NPC steht die Ehe sofort, bei einem
 * Spielercharakter liegt der Antrag und wartet. Die Oberfläche muss das unterscheiden
 * können — „Der Antrag ist gestellt" wäre gelogen, wenn schon geheiratet wurde.
 */
export type ProposalResult =
	| { ok: true; married: boolean }
	| { ok: false; reason: ActionFailureReason };

// --- Werben und heiraten -------------------------------------------------------------

/**
 * Werben — wie „Zeit verbringen", nur ernster gemeint.
 *
 * Technisch derselbe Ablauf: sperren, nachwachsen lassen, Punkte abziehen, Zuneigung
 * beim **anderen** erhöhen. Man macht sich beliebt, nicht sich selbst etwas vor.
 */
/**
 * Werben.
 *
 * `withPerfume` verbraucht ein Fläschchen aus der eigenen Kammer und schlägt kräftig auf
 * die Zuneigung — der Aufwand für einen Anlass, nicht für den Alltag. Wer eine Ehe will,
 * für die die Zuneigung noch nicht reicht, kann sie damit erkaufen: teurer als Geduld,
 * aber schneller.
 */
export async function courtSomeone(
	characterId: string,
	otherId: string,
	withPerfume = false
): Promise<FamilyResult> {
	if (characterId === otherId) return { ok: false, reason: 'SAME_PERSON' };

	const umworben = await Character.findByPk(otherId);
	if (!umworben || umworben.dataValues.deathTick !== null) {
		return { ok: false, reason: 'NO_SUCH_PERSON' };
	}

	const tick: number = await worldService.currentTick();

	const ergebnis = await sequelize.transaction(async (t: Transaction) => {
		const werbender = await characterService.loadForAction(characterId, tick, t);
		if (!werbender) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const geplant = court(
			{
				actionPoints: werbender.dataValues.actionPoints,
				regionId: werbender.dataValues.RegionId
			},
			{ regionId: umworben.dataValues.RegionId }
		);
		if (!geplant.ok) return geplant;

		// Das Duftwasser wird **vor** dem Zuschlag verbraucht: Wer keines mehr hat, wirbt
		// trotzdem — nur eben ohne. Andersherum bekäme er die Wirkung ohne die Ware.
		const duft: boolean =
			withPerfume && (await needService.changeStock(characterId, 'PERFUME', -1, t));

		await werbender.update({ actionPoints: geplant.actionPoints }, { transaction: t });
		const zuschlag: number = affectionBonus({
			garmentIntact: garmentIntact(werbender.dataValues.wornSinceTick, tick),
			perfumeUsed: duft
		});
		return { ok: true, delta: geplant.delta + zuschlag } as const;
	});

	if (!ergebnis.ok) return ergebnis;

	await relationshipService.changeAffection(otherId, characterId, ergebnis.delta, tick);
	return { ok: true };
}

/**
 * Um die Hand anhalten.
 *
 * Bei einem NPC entscheidet sich alles sofort: Er nimmt an, wenn die Zuneigung reicht —
 * ein NPC, der auf eine Antwort warten ließe, wäre nur eine Verzögerung ohne Spielwert.
 * Bei einem Spielercharakter bleibt der Antrag stehen, bis der andere ihn annimmt; zwei
 * Spieler sind selten zugleich online.
 */
export async function propose(characterId: string, otherId: string): Promise<ProposalResult> {
	const tick: number = await worldService.currentTick();
	const pruefung = await pruefeEhe(characterId, otherId, tick);
	if (!pruefung.ok) return pruefung;

	const anderer = await Character.findByPk(otherId);
	if (!anderer) return { ok: false, reason: 'NO_SUCH_PERSON' };

	if (anderer.dataValues.role === 'NPC') {
		await trauen(characterId, otherId, tick);
		return { ok: true, married: true };
	}

	await Character.update({ proposedToId: otherId }, { where: { id: characterId } });
	return { ok: true, married: false };
}

/**
 * Einen Antrag annehmen.
 *
 * Geprüft wird ein zweites Mal, und zwar vollständig: Zwischen Antrag und Annahme können
 * Jahre liegen — der eine kann inzwischen anderweitig geheiratet haben, die Zuneigung
 * kann verfallen sein, einer kann tot sein.
 */
export async function acceptProposal(characterId: string, suitorId: string): Promise<FamilyResult> {
	const werbender = await Character.findByPk(suitorId);
	if (!werbender || werbender.dataValues.proposedToId !== characterId) {
		return { ok: false, reason: 'NO_PROPOSAL' };
	}

	const tick: number = await worldService.currentTick();
	const pruefung = await pruefeEhe(suitorId, characterId, tick);
	if (!pruefung.ok) return pruefung;

	await trauen(suitorId, characterId, tick);
	return { ok: true };
}

/** Die Eheprüfung gegen die Datenbank — beide Seiten, Verwandtschaft, Zuneigung. */
async function pruefeEhe(oneId: string, otherId: string, tick: number): Promise<FamilyResult> {
	const [einer, anderer] = await Promise.all([
		Character.findByPk(oneId),
		Character.findByPk(otherId)
	]);
	if (!einer || !anderer) return { ok: false, reason: 'NO_SUCH_PERSON' };
	if (einer.dataValues.deathTick !== null || anderer.dataValues.deathTick !== null) {
		return { ok: false, reason: 'NO_SUCH_PERSON' };
	}

	// Gefragt ist, wie der **Umworbene** zum Werbenden steht — nicht umgekehrt. Wer
	// heiratet, muss gewollt sein, nicht wollen.
	const stand = await relationshipService.getAffection(otherId, oneId, tick);

	const ergebnis = canMarry(
		alsKandidat(einer),
		alsKandidat(anderer),
		stand.kinship,
		stand.affection,
		tick
	);
	return ergebnis.ok ? { ok: true } : ergebnis;
}

function alsKandidat(instanz: Model<CharacterAttributes, CharacterCreationAttributes>): Candidate {
	return {
		id: instanz.dataValues.id,
		gender: instanz.dataValues.gender,
		birthTick: instanz.dataValues.birthTick,
		spouseId: instanz.dataValues.spouseId
	};
}

/**
 * Die Trauung: beide Seiten verheiraten, offene Anträge aufräumen.
 *
 * In einer Transaktion, weil eine halbe Ehe — einer verheiratet, der andere nicht — den
 * ganzen Rest durcheinanderbrächte: Die Empfängnis prüft `spouseId` der Mutter, die
 * Eheprüfung die beider Seiten.
 */
async function trauen(oneId: string, otherId: string, tick: number): Promise<void> {
	await sequelize.transaction(async (t: Transaction) => {
		await Character.update(
			{ spouseId: otherId, proposedToId: null },
			{ where: { id: oneId }, transaction: t }
		);
		await Character.update(
			{ spouseId: oneId, proposedToId: null },
			{ where: { id: otherId }, transaction: t }
		);
		await zusammenziehen(oneId, otherId, tick, t);
	});
	const paar = await Character.findByPk(oneId, { attributes: ['id', 'RegionId'] });
	await chronicleService.record('MARRIAGE', paar?.dataValues.RegionId ?? null, tick, {
		subjectId: oneId,
		objectId: otherId
	});
	// Eine Ehe ist ein Ereignis zwischen den Häusern, nicht nur zwischen zwei Menschen.
	await relationshipService.changeAffection(oneId, otherId, 20, tick);
	await relationshipService.changeAffection(otherId, oneId, 20, tick);
}

// --- Der Lauf der Dinge --------------------------------------------------------------

/** Was ein Herzschlag an Familienleben gebracht hat. */
export interface FamilyTick {
	births: { childId: string; name: string; motherId: string }[];
	conceptions: number;
}

/**
 * Ein Herzschlag: erst gebären, dann empfangen.
 *
 * Die Reihenfolge ist nicht beliebig. Eine Geburt macht die Mutter wieder empfänglich —
 * andersherum belegte das neugeborene Kind sofort den Platz, der über die nächste
 * Empfängnis entscheidet, und die Geburtenrate hinge daran, in welcher Reihenfolge
 * zwei Schleifen laufen.
 */
export async function advanceFamilies(
	tick: number,
	roll: () => number = Math.random
): Promise<FamilyTick> {
	const geboren = await gebaeren(tick, roll);
	const empfangen = await empfangen_lassen(tick, roll);
	return { births: geboren, conceptions: empfangen };
}

/** Alle ausgetragenen Schwangerschaften zu Ende bringen. */
async function gebaeren(tick: number, roll: () => number): Promise<FamilyTick['births']> {
	const schwangere = await Character.findAll({
		where: { deathTick: null, pregnantSinceTick: { [Op.ne]: null } }
	});

	const geboren: FamilyTick['births'] = [];
	for (const mutter of schwangere) {
		if (!isDue(mutter.dataValues.pregnantSinceTick!, tick)) continue;

		const kind = await zurWeltBringen(mutter, tick, roll);
		if (kind) geboren.push(kind);
	}
	return geboren;
}

/** Ein Kind anlegen und die Mutter entbinden. */
async function zurWeltBringen(
	mutter: Model<CharacterAttributes, CharacterCreationAttributes>,
	tick: number,
	roll: () => number
): Promise<FamilyTick['births'][number] | null> {
	const vaterId: string | null = mutter.dataValues.pregnantByFatherId;
	const vater = vaterId ? await Character.findByPk(vaterId) : null;

	const geschlecht = roll() < 0.5 ? 'FEMALE' : 'MALE';
	const name: string = NEUGEBORENE[geschlecht][Math.floor(roll() * NEUGEBORENE[geschlecht].length)];

	const kindId: string = randomUUID();
	await sequelize.transaction(async (t: Transaction) => {
		await Character.create(
			{
				id: kindId,
				firstName: name,
				role: 'NPC',
				gender: geschlecht,
				birthTick: tick,
				lastTickProcessed: tick,
				// Ein Saeugling wird gestillt: satt zur Welt, Stichtag jetzt.
				satiety: SATIETY_MAX,
				lastNeedTick: tick,
				actionPoints: 0,
				money: 0,
				RegionId: mutter.dataValues.RegionId,
				DynastyId: assignDynasty(
					mutter.dataValues.DynastyId,
					vater?.dataValues.DynastyId ?? null,
					roll()
				),
				motherId: mutter.dataValues.id,
				fatherId: vaterId,
				// Die Anlagen: Mittelwert der Eltern plus Streuung. Deshalb steht dieser
				// Schritt vor 4.5 — jedes Kind, das ohne sie zur Welt käme, müsste sie
				// später erfunden bekommen statt vererbt.
				...inheritPersonality(
					anlagenVon(mutter.dataValues),
					vater ? anlagenVon(vater.dataValues) : null,
					roll
				),
				// Das Kind wohnt, wo die Mutter wohnt. Der Platz dafür war die
				// Voraussetzung der Empfängnis — er ist also da.
				HomeBuildingId: mutter.dataValues.HomeBuildingId
			},
			{ transaction: t }
		);
		await mutter.update({ pregnantSinceTick: null, pregnantByFatherId: null }, { transaction: t });
		await chronicleService.record(
			'BIRTH',
			mutter.dataValues.RegionId,
			tick,
			{ subjectId: kindId, objectId: mutter.dataValues.id, dynastyId: mutter.dataValues.DynastyId },
			t
		);
	});

	return { childId: kindId, name, motherId: mutter.dataValues.id };
}

/** Die sechs Achsen aus einer Datenbankzeile herausgeschält. */
function anlagenVon(werte: CharacterAttributes): Personality {
	return {
		courage: werte.courage,
		diligence: werte.diligence,
		greed: werte.greed,
		sociability: werte.sociability,
		ambition: werte.ambition,
		agreeableness: werte.agreeableness
	};
}

/**
 * Über alle Frauen im fruchtbaren Alter würfeln.
 *
 * Abgefragt werden nur Verheiratete, die nicht schon schwanger sind — der Rest hat eine
 * Chance von null, und die Bevölkerung besteht überwiegend daraus.
 */
async function empfangen_lassen(tick: number, roll: () => number): Promise<number> {
	const frauen = await Character.findAll({
		where: {
			deathTick: null,
			gender: 'FEMALE',
			spouseId: { [Op.ne]: null },
			pregnantSinceTick: null
		}
	});

	let empfangen = 0;
	for (const frau of frauen) {
		const platz: number | null = await buildingService.freierWohnraum(
			frau.dataValues.HomeBuildingId
		);

		const empfaengt: boolean = conceives(
			{
				birthTick: frau.dataValues.birthTick,
				spouseId: frau.dataValues.spouseId,
				pregnantSinceTick: frau.dataValues.pregnantSinceTick,
				freeHomeSpace: platz
			},
			tick,
			roll()
		);
		if (!empfaengt) continue;

		await frau.update({
			pregnantSinceTick: tick,
			pregnantByFatherId: frau.dataValues.spouseId
		});
		empfangen++;
	}
	return empfangen;
}

/**
 * Wie viele Plätze im Wohnhaus noch frei sind — `null`, wenn es keines gibt.
 *
 * Gezählt werden die Lebenden: Ein Haus, dessen Bewohner gestorben sind, hat wieder
 * Platz.
 */
/**
 * Wer heiratet, führt einen Haushalt.
 *
 * **Bis hierher geschah beim Trauen mit dem Wohnen gar nichts.** Zwei Verheiratete konnten
 * in verschiedenen Häusern leben oder beide auf der Straße — und weil die Empfängnis am
 * freien Platz im Haus der Mutter hängt, entschied allein ihr Dach über Kinder. Ein Mann
 * mit einem Großhaus half seiner obdachlosen Frau nicht.
 *
 * Jetzt zieht einer zum anderen. Der Besitz bleibt getrennt: Das Haus gehört weiter dem,
 * dem es gehörte, und geht später an dessen Erben. Was die Ehe bringt, ist der gemeinsame
 * Haushalt — ein Dach für zwei statt zweier Mieten.
 *
 * **Wer zieht, entscheidet der Platz.** Es geht dorthin, wo noch jemand hineinpasst; haben
 * beide Platz, ins größere Haus, weil dort später auch die Kinder unterkommen. Passt
 * nirgends jemand dazu, bleibt alles, wie es ist — dann wohnen sie eben getrennt, bis
 * einer baut. Das ist besser als eine Ehe, die am Wohnraum scheitert.
 */
async function zusammenziehen(
	oneId: string,
	otherId: string,
	tick: number,
	t: Transaction
): Promise<void> {
	const einer = await Character.findByPk(oneId, { transaction: t });
	const anderer = await Character.findByPk(otherId, { transaction: t });
	if (!einer || !anderer) return;

	const heimEiner: string | null = einer.dataValues.HomeBuildingId;
	const heimAnderer: string | null = anderer.dataValues.HomeBuildingId;
	if (heimEiner === heimAnderer) return;

	// Wer einzieht, braucht einen freien Platz — der andere zählt schon als Bewohner mit.
	const platzBeiEinem: number = (await buildingService.freierWohnraum(heimEiner)) ?? 0;
	const platzBeimAnderen: number = (await buildingService.freierWohnraum(heimAnderer)) ?? 0;

	if (platzBeiEinem > 0 && platzBeiEinem >= platzBeimAnderen) {
		await anderer.update({ HomeBuildingId: heimEiner }, { transaction: t });
		await chronicleService.recordMoveIn(otherId, heimEiner, tick, t);
	} else if (platzBeimAnderen > 0) {
		await einer.update({ HomeBuildingId: heimAnderer }, { transaction: t });
		await chronicleService.recordMoveIn(oneId, heimAnderer, tick, t);
	}
}

// --- Anzeigen ------------------------------------------------------------------------

/** Ein Eintrag im Stammbaum. */
export interface TreeMember {
	id: string;
	firstName: string;
	age: number;
	alive: boolean;
	isPlayed: boolean;
	motherId: string | null;
	fatherId: string | null;
	spouseId: string | null;
}

/**
 * Der Stammbaum eines Hauses — alle Mitglieder, lebend wie tot.
 *
 * Die Toten gehören dazu: Ein Stammbaum, der nur die Lebenden zeigt, ist eine
 * Anwesenheitsliste. Gerade bei Permadeath ist die Reihe der Vorfahren das, was eine
 * Dynastie von einem Charakter unterscheidet.
 */
export async function getFamilyTree(dynastyId: string, tick: number): Promise<TreeMember[]> {
	const mitglieder = await Character.findAll({
		where: { DynastyId: dynastyId },
		order: [['birthTick', 'ASC']]
	});

	return mitglieder.map((person) => ({
		id: person.dataValues.id,
		firstName: person.dataValues.firstName,
		age: ageInYears(person.dataValues.birthTick, person.dataValues.deathTick ?? tick),
		alive: person.dataValues.deathTick === null,
		isPlayed: person.dataValues.role === 'PLAYER',
		motherId: person.dataValues.motherId,
		fatherId: person.dataValues.fatherId,
		spouseId: person.dataValues.spouseId
	}));
}

/** Wie es um die Bevölkerung einer Stadt steht. */
export interface Population {
	living: number;
	children: number;
	births: number;
	deaths: number;
	/** Über wie viele Jahre Geburten und Tote gezählt wurden. */
	overYears: number;
}

/**
 * Die Bevölkerungsstatistik — ohne eigene Tabelle.
 *
 * Geburten und Tote ergeben sich aus `birthTick` und `deathTick`; ein Protokoll wäre eine
 * zweite Wahrheit, die mit der ersten auseinanderlaufen kann. Der Preis ist, dass die
 * Zahlen nur so weit zurückreichen, wie Charaktere gespeichert sind — und die bleiben
 * ohnehin für immer stehen.
 *
 * Gebraucht wird das nicht zur Zierde: Eine Bevölkerung, die langfristig schrumpft oder
 * explodiert, nimmt Wirtschaft und Politik den Boden. Ohne Zahlen fiele das erst auf,
 * wenn es zu spät ist.
 */
export async function getPopulation(
	regionId: string,
	tick: number,
	overYears: number = 5
): Promise<Population> {
	const seit: number = tick - yearsToTicks(overYears);

	const [lebend, kinder, geburten, tote] = await Promise.all([
		Character.count({ where: { RegionId: regionId, deathTick: null } }),
		Character.count({
			where: {
				RegionId: regionId,
				deathTick: null,
				birthTick: { [Op.gt]: tick - yearsToTicks(AGE_OF_MAJORITY) }
			}
		}),
		Character.count({ where: { RegionId: regionId, birthTick: { [Op.gte]: seit } } }),
		Character.count({ where: { RegionId: regionId, deathTick: { [Op.gte]: seit } } })
	]);

	return { living: lebend, children: kinder, births: geburten, deaths: tote, overYears };
}
