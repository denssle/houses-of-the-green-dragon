import { Op, type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Character } from '$lib/db/model/character';
import { DynastyRelationship } from '$lib/db/model/dynastyRelationship';
import { Relationship } from '$lib/db/model/relationship';
import {
	affectionNow,
	affectionLabel,
	changeAffection as verschieben,
	houseDrift,
	type Kinship,
	socialize,
	standingNow
} from '$lib/game/relationship.logic';
import * as characterService from '$lib/server/service/characterService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Zuneigung gegen die Datenbank.
 *
 * Zwei Sparsamkeiten tragen das Ganze, und beide sind kein Feinschliff, sondern die
 * Voraussetzung dafür, dass es überhaupt trägt:
 *
 * - **Nur Abweichungen werden gespeichert.** Fehlt eine Zeile, gilt der Grundwert aus
 *   Verwandtschaft und Hausstand. Sonst wüchse die Tabelle quadratisch mit der
 *   Einwohnerzahl.
 * - **Lesen schreibt nichts.** Der Verfall wird aus `lastChangedTick` gerechnet, nicht
 *   fortgeschrieben. Sonst hinge die Zuneigung davon ab, wie oft jemand die Seite
 *   aufruft — und genau das soll sie nicht.
 *
 * Aufgeräumt wird beim Schreiben: Wer auf dem Grundwert ankommt, verliert seine Zeile.
 */

/** Was die Anzeige über eine Beziehung wissen will. */
export interface Standing {
	affection: number;
	kinship: Kinship;
	houseStanding: number;
}

/**
 * Die Zuneigung von einem zum anderen — gerichtet.
 *
 * A kann B schätzen, ohne dass es erwidert wird. Wer das Verhältnis in beide Richtungen
 * braucht, fragt zweimal.
 */
export async function getAffection(fromId: string, toId: string, tick: number): Promise<Standing> {
	const [von, zu] = await Promise.all([Character.findByPk(fromId), Character.findByPk(toId)]);
	if (!von || !zu) {
		return { affection: 0, kinship: 'NONE', houseStanding: 0 };
	}

	const verwandtschaft: Kinship = await kinshipBetween(fromId, toId);
	const hausstand: number = await getStanding(
		von.dataValues.DynastyId,
		zu.dataValues.DynastyId,
		tick
	);
	const zeile = await Relationship.findOne({
		where: { fromCharacterId: fromId, toCharacterId: toId }
	});

	return {
		affection: Math.round(
			affectionNow(
				zeile?.dataValues.affection ?? 0,
				zeile?.dataValues.lastChangedTick ?? tick,
				tick,
				verwandtschaft,
				hausstand
			)
		),
		kinship: verwandtschaft,
		houseStanding: hausstand
	};
}

/**
 * Verschiebt die persönliche Zuneigung und lässt sie auf die Häuser abfärben.
 *
 * In einer Transaktion, weil beides zusammengehört: Ein Zerwürfnis, das die Person
 * trifft, aber die Häuser nicht, wäre eine halbe Wahrheit — und beim nächsten Lesen
 * nicht mehr als solche erkennbar.
 */
export async function changeAffection(
	fromId: string,
	toId: string,
	delta: number,
	tick: number
): Promise<number> {
	return sequelize.transaction(async (t: Transaction) => {
		const zeile = await Relationship.findOne({
			where: { fromCharacterId: fromId, toCharacterId: toId },
			transaction: t,
			lock: t.LOCK.UPDATE
		});

		const neu: number = verschieben(
			zeile?.dataValues.affection ?? 0,
			zeile?.dataValues.lastChangedTick ?? tick,
			tick,
			delta
		);

		if (neu === 0) {
			// Auf dem Grundwert angekommen: Die Zeile sagt nichts mehr aus. Das hält die
			// Tabelle klein — räumt aber nur auf, was jemand anfasst. Was niemand mehr
			// berührt, bleibt liegen, bis ein Aufräumlauf darüber geht.
			if (zeile) {
				await Relationship.destroy({
					where: { fromCharacterId: fromId, toCharacterId: toId },
					transaction: t
				});
			}
		} else {
			await Relationship.upsert(
				{
					fromCharacterId: fromId,
					toCharacterId: toId,
					affection: neu,
					lastChangedTick: tick
				},
				{ transaction: t }
			);
		}

		await haeuserMitziehen(fromId, toId, delta, tick, t);
		return neu;
	});
}

/** Ein Mensch, wie er auf der Leute-Seite steht. */
export interface PersonOnList {
	id: string;
	firstName: string;
	title: string;
	/** Wie **er** zu dir steht — nicht umgekehrt. */
	affectionToYou: string;
	kinship: Kinship;
	/** Anderweitig vergeben — dann erübrigt sich das Werben. */
	married: boolean;
	isSpouse: boolean;
	/** Er hat dir einen Antrag gemacht und wartet auf Antwort. */
	hasProposedToYou: boolean;
}

/**
 * Wer sonst noch hier ist.
 *
 * Gezeigt wird, wie die anderen zu **dir** stehen: Das ist die Richtung, die zählt, wenn
 * es ums Werben (4.4) und ums Wählen (4.7) geht. Die eigene Meinung über andere hat noch
 * keine Wirkung im Spiel.
 */
export async function getNeighbours(
	characterId: string,
	regionId: string,
	tick: number
): Promise<PersonOnList[]> {
	const leute = await Character.findAll({
		where: { RegionId: regionId, deathTick: null, id: { [Op.ne]: characterId } },
		order: [['firstName', 'ASC']]
	});

	const liste: PersonOnList[] = [];
	for (const person of leute) {
		const stand = await getAffection(person.dataValues.id, characterId, tick);
		liste.push({
			id: person.dataValues.id,
			firstName: person.dataValues.firstName,
			title: person.dataValues.title,
			affectionToYou: affectionLabel(stand.affection),
			kinship: stand.kinship,
			married: person.dataValues.spouseId !== null,
			isSpouse: person.dataValues.spouseId === characterId,
			hasProposedToYou: person.dataValues.proposedToId === characterId
		});
	}
	return liste;
}

export type SocializeResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/**
 * Zeit mit jemandem verbringen.
 *
 * Wie jede Handlung, die Ressourcen verbraucht: erst sperren und nachwachsen lassen
 * (`loadForAction`), dann abrechnen. Die Zuneigung wächst beim **anderen** — man macht
 * sich beliebt, nicht sich selbst etwas vor.
 */
export async function spendTimeWith(
	characterId: string,
	otherId: string
): Promise<SocializeResult> {
	if (characterId === otherId) return { ok: false, reason: 'SAME_PERSON' };

	const anderer = await Character.findByPk(otherId);
	if (!anderer || anderer.dataValues.deathTick !== null) {
		return { ok: false, reason: 'NO_SUCH_PERSON' };
	}

	const tick: number = await worldService.currentTick();

	const ergebnis = await sequelize.transaction(async (t: Transaction) => {
		const besucher = await characterService.loadForAction(characterId, tick, t);
		if (!besucher) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const geplant = socialize(
			{
				actionPoints: besucher.dataValues.actionPoints,
				regionId: besucher.dataValues.RegionId
			},
			{ regionId: anderer.dataValues.RegionId }
		);
		if (!geplant.ok) return geplant;

		await besucher.update({ actionPoints: geplant.actionPoints }, { transaction: t });
		return { ok: true, delta: geplant.delta } as const;
	});

	if (!ergebnis.ok) return ergebnis;

	// Bewusst außerhalb der Transaktion oben: `changeAffection` öffnet eine eigene, und
	// SQLite verträgt keine verschachtelten. Der Aktionspunkt ist damit theoretisch
	// ausgegeben, bevor die Zuneigung steigt — bei einem Fehler dazwischen verliert man
	// einen Punkt. Das ist der billigere Preis gegenüber einer Sperre, die den ganzen
	// Beziehungsbaum umfasst.
	await changeAffection(otherId, characterId, ergebnis.delta, tick);
	return { ok: true };
}

/**
 * Der Stand zweier Häuser, abgeklungen auf jetzt.
 *
 * Ohne Haus — die Fremd-NPCs gehören zu keinem — gibt es nichts zu verrechnen, und
 * innerhalb desselben Hauses erst recht nicht: Eine Dynastie führt keine Fehde mit sich
 * selbst.
 */
export async function getStanding(
	fromDynastyId: string | null,
	toDynastyId: string | null,
	tick: number
): Promise<number> {
	if (!fromDynastyId || !toDynastyId || fromDynastyId === toDynastyId) return 0;

	const zeile = await DynastyRelationship.findOne({
		where: { fromDynastyId, toDynastyId }
	});
	if (!zeile) return 0;

	return Math.round(standingNow(zeile.dataValues.standing, zeile.dataValues.lastChangedTick, tick));
}

/**
 * Fehde ansagen, Frieden schließen, ein Bündnis eingehen.
 *
 * Der erklärte Anteil setzt den Wert **direkt**, statt ihn zu verschieben: Eine
 * Kriegserklärung verhandelt nicht mit dem, was vorher war. Sie wirkt sofort auf alle
 * Mitglieder, weil sie als Schicht in jede persönliche Beziehung eingeht — ohne dass
 * eine einzige Beziehungszeile angefasst werden müsste.
 *
 * Gerichtet wie die persönliche Beziehung: Ein Haus kann ein anderes für einen Feind
 * halten, ohne dass es erwidert wird.
 */
export async function declareStanding(
	fromDynastyId: string,
	toDynastyId: string,
	standing: number,
	tick: number
): Promise<void> {
	if (fromDynastyId === toDynastyId) return;

	await DynastyRelationship.upsert({
		fromDynastyId,
		toDynastyId,
		standing,
		lastChangedTick: tick
	});
}

/**
 * Die natürliche Hälfte: Jede persönliche Änderung schiebt das Verhältnis der Häuser um
 * einen Bruchteil mit.
 *
 * **Inkrementell und nicht aggregiert.** Eine Auswertung über alle Mitgliederpaare wäre
 * quadratisch und ließe sich — anders als Verfall und Aktionsbudget — nicht faul beim
 * Lesen nachrechnen: Sie müsste jede einzelne Beziehung kennen, auch die, die gar keine
 * Zeile haben.
 */
async function haeuserMitziehen(
	fromId: string,
	toId: string,
	delta: number,
	tick: number,
	t: Transaction
): Promise<void> {
	const abdruck: number = houseDrift(delta);
	if (abdruck === 0) return;

	const [von, zu] = await Promise.all([
		Character.findByPk(fromId, { transaction: t }),
		Character.findByPk(toId, { transaction: t })
	]);
	const vonHaus = von?.dataValues.DynastyId;
	const zuHaus = zu?.dataValues.DynastyId;
	if (!vonHaus || !zuHaus || vonHaus === zuHaus) return;

	const zeile = await DynastyRelationship.findOne({
		where: { fromDynastyId: vonHaus, toDynastyId: zuHaus },
		transaction: t,
		lock: t.LOCK.UPDATE
	});

	// Auch hier erst abklingen lassen, dann verschieben: Eine Fehde von vor drei
	// Generationen soll nicht mit vollem Gewicht zurückkommen, weil zwei Urenkel
	// aneinandergeraten.
	const neu: number = verschieben(
		zeile?.dataValues.standing ?? 0,
		zeile?.dataValues.lastChangedTick ?? tick,
		tick,
		abdruck
	);

	await DynastyRelationship.upsert(
		{ fromDynastyId: vonHaus, toDynastyId: zuHaus, standing: neu, lastChangedTick: tick },
		{ transaction: t }
	);
}

/**
 * Wie zwei Charaktere verwandt sind.
 *
 * Gerechnet, nicht gespeichert: Der Stammbaum steht schon in `motherId`, `fatherId` und
 * `spouseId`, eine zweite Ablage geriete unweigerlich damit auseinander. Weiter als bis
 * zu den Großeltern wird nicht gesucht — Vettern und Nichten sind einander im Spiel
 * Fremde, bis sie sich kennenlernen, und genau das ist gewollt: Persönliche Beziehungen
 * werden nicht vererbt.
 */
export async function kinshipBetween(fromId: string, toId: string): Promise<Kinship> {
	if (fromId === toId) return 'NONE';

	const [von, zu] = await Promise.all([Character.findByPk(fromId), Character.findByPk(toId)]);
	if (!von || !zu) return 'NONE';

	const a = von.dataValues;
	const b = zu.dataValues;

	if (a.spouseId === toId) return 'SPOUSE';
	if (a.motherId === toId || a.fatherId === toId) return 'PARENT';
	if (b.motherId === fromId || b.fatherId === fromId) return 'CHILD';

	// Geschwister: mindestens ein gemeinsamer Elternteil. `null` zählt nicht mit, sonst
	// wären alle Elternlosen miteinander verschwistert.
	const gemeinsam: boolean =
		(a.motherId !== null && (a.motherId === b.motherId || a.motherId === b.fatherId)) ||
		(a.fatherId !== null && (a.fatherId === b.motherId || a.fatherId === b.fatherId));
	if (gemeinsam) return 'SIBLING';

	if (await istGrosselternteil(a.motherId, a.fatherId, toId)) return 'GRANDCHILD';
	if (await istGrosselternteil(b.motherId, b.fatherId, fromId)) return 'GRANDPARENT';

	return 'NONE';
}

/** Ist `gesucht` ein Elternteil einer der beiden übergebenen Personen? */
async function istGrosselternteil(
	mutterId: string | null,
	vaterId: string | null,
	gesucht: string
): Promise<boolean> {
	const eltern: string[] = [mutterId, vaterId].filter((id): id is string => id !== null);
	if (eltern.length === 0) return false;

	const gefunden = await Character.findAll({
		where: {
			id: { [Op.in]: eltern },
			[Op.or]: [{ motherId: gesucht }, { fatherId: gesucht }]
		},
		attributes: ['id']
	});
	return gefunden.length > 0;
}
