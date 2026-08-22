import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { Building } from '$lib/db/model/building';
import { Event } from '$lib/db/model/event';
import type { EventFacts, EventKind } from '$lib/game/chronicle.logic';
import * as nameService from '$lib/server/service/nameService';

/**
 * Die Chronik: was geschehen ist.
 *
 * **Geschrieben wird dort, wo das Ereignis entsteht** — in den Diensten, nicht im Takt.
 * Eine Hochzeit kann ein Spieler auslösen, eine Geburt der Takt, eine Anstellung beides;
 * ein zentraler Sammler müsste all das erraten. Damit ist `record` die eine Stelle, die
 * jeder Dienst kennt, und die einzige Abhängigkeit, die sie mitbringt.
 *
 * **Ein Fehler beim Schreiben darf die Handlung nicht kippen.** Wer heiratet, ist
 * verheiratet, auch wenn die Chronik gerade klemmt — deshalb wird hier geschluckt und
 * geloggt statt geworfen. Andersherum hinge das Spiel an seinem Protokoll.
 */

export async function record(
	kind: EventKind,
	regionId: string | null,
	tick: number,
	facts: EventFacts = {},
	t?: Transaction
): Promise<void> {
	try {
		await Event.create(
			{
				id: randomUUID(),
				RegionId: regionId,
				kind,
				tick,
				subjectId: facts.subjectId ?? null,
				objectId: facts.objectId ?? null,
				buildingId: facts.buildingId ?? null,
				dynastyId: facts.dynastyId ?? null,
				value: facts.value ?? null,
				detail: facts.detail ?? null
			},
			{ transaction: t }
		);
	} catch (fehler) {
		console.error('Die Chronik ließ sich nicht fortschreiben:', fehler);
	}
}

/**
 * Wo jemand von nun an wohnt.
 *
 * Eine eigene Funktion, weil drei Stellen sie brauchen — die Heirat, der NPC, der ein Dach
 * findet, und der Ehepartner, der in ein neu gebautes Haus mitzieht. Sie steht hier und
 * nicht bei der Familie, weil `buildingService` sie ebenfalls ruft und die Familie
 * ihrerseits schon von den Gebäuden abhängt: Ein Ringschluss zwischen zwei Diensten wäre
 * ein hoher Preis für eine Zeile.
 *
 * Die Region kommt von der Person und nicht vom Gebäude: Wer einzieht, ist der, um dessen
 * Leben es geht.
 */
export async function recordMoveIn(
	characterId: string,
	buildingId: string | null,
	tick: number,
	t?: Transaction
): Promise<void> {
	if (!buildingId) return;

	const person = await Character.findByPk(characterId, { transaction: t });
	if (!person) return;

	await record(
		'MOVED_IN',
		person.dataValues.RegionId,
		tick,
		{ subjectId: characterId, buildingId },
		t
	);
}

/** Ein Eintrag, wie ihn die Anzeige braucht: mit Namen statt Kennungen. */
export interface ChronicleEntry {
	id: string;
	kind: EventKind;
	tick: number;
	subject?: { id: string; name: string };
	object?: { id: string; name: string };
	building?: { id: string; name: string };
	dynasty?: { id: string; name: string };
	value: number | null;
	detail: string | null;
}

export interface ChronicleQuery {
	regionId?: string;
	/** Nur Einträge, an denen diese Person beteiligt war — ihr Lebenslauf. */
	characterId?: string;
	/** Nur Einträge, die dieses Haus betreffen. */
	dynastyId?: string;
	/**
	 * Nur Einträge zu diesem Gebäude — seine Geschichte (Punkt 62).
	 *
	 * Damit braucht ein Errichtungsdatum keine eigene Spalte: Der Bau steht seit jeher als
	 * `BUILDING_BUILT` in der Chronik, es fehlte nur der Weg, danach zu fragen. Wo kein
	 * Eintrag ist, stand das Haus schon beim Weltaufbau.
	 */
	buildingId?: string;
	limit?: number;
	before?: number;
}

/**
 * Die Chronik lesen.
 *
 * **Dieselben Zeilen, drei Fragen**: Was geschah in der Stadt, was betraf mein Haus, was
 * hat diese Person erlebt. Deshalb gibt es hier keine drei Abfragen, sondern eine mit
 * drei Filtern — der Lebenslauf eines Charakters ist kein eigenes System, sondern eine
 * Sicht.
 */
export async function getChronicle(query: ChronicleQuery = {}): Promise<ChronicleEntry[]> {
	const wo: Record<string | symbol, unknown> = {};
	if (query.regionId) wo.RegionId = query.regionId;
	if (query.buildingId) wo.buildingId = query.buildingId;
	if (query.before !== undefined) wo.tick = { [Op.lt]: query.before };

	if (query.characterId) {
		wo[Op.or as unknown as string] = [
			{ subjectId: query.characterId },
			{ objectId: query.characterId }
		];
	} else if (query.dynastyId) {
		// Ein Ereignis gehört einem Haus, wenn das Haus genannt ist oder einer seiner
		// Angehörigen beteiligt war — auch die längst verstorbenen.
		const angehoerige = await Character.findAll({
			where: { DynastyId: query.dynastyId },
			attributes: ['id']
		});
		const ids: string[] = angehoerige.map((person) => person.dataValues.id);
		wo[Op.or as unknown as string] = [
			{ dynastyId: query.dynastyId },
			{ subjectId: { [Op.in]: ids } },
			{ objectId: { [Op.in]: ids } }
		];
	}

	const zeilen = await Event.findAll({
		where: wo,
		order: [
			['tick', 'DESC'],
			['createdAt', 'DESC']
		],
		limit: query.limit ?? 50
	});

	// Namen in einem Rutsch nachschlagen: Eine Chronikseite mit fünfzig Einträgen soll
	// nicht hundert Abfragen auslösen.
	const personIds = new Set<string>();
	const gebaeudeIds = new Set<string>();
	const hausIds = new Set<string>();
	for (const zeile of zeilen) {
		if (zeile.dataValues.subjectId) personIds.add(zeile.dataValues.subjectId);
		if (zeile.dataValues.objectId) personIds.add(zeile.dataValues.objectId);
		if (zeile.dataValues.buildingId) gebaeudeIds.add(zeile.dataValues.buildingId);
		if (zeile.dataValues.dynastyId) hausIds.add(zeile.dataValues.dynastyId);
	}

	// **Mit dem Hausnamen** (5.10): In der Chronik stehen Menschen aus verschiedenen
	// Häusern nebeneinander, und erst der Nachname sagt, wer zu wem gehört.
	const personen = await nameService.displayNames(personIds);

	const gebaeude = new Map<string, string>();
	if (gebaeudeIds.size > 0) {
		const gefunden = await Building.findAll({
			where: { id: { [Op.in]: [...gebaeudeIds] } },
			attributes: ['id', 'name']
		});
		for (const haus of gefunden) gebaeude.set(haus.dataValues.id, haus.dataValues.name);
	}

	const haeuser = new Map<string, string>();
	if (hausIds.size > 0) {
		const gefunden = await Dynasty.findAll({
			where: { id: { [Op.in]: [...hausIds] } },
			attributes: ['id', 'name']
		});
		for (const haus of gefunden) haeuser.set(haus.dataValues.id, haus.dataValues.name);
	}

	return zeilen.map((zeile) => {
		const werte = zeile.dataValues;
		return {
			id: werte.id,
			kind: werte.kind,
			tick: werte.tick,
			// Was nicht mehr auffindbar ist, fällt weg statt die Zeile zu verlieren: Ein
			// abgerissenes Gebäude macht die Hochzeit nicht ungeschehen.
			subject: benannt(werte.subjectId, personen),
			object: benannt(werte.objectId, personen),
			building: benannt(werte.buildingId, gebaeude),
			dynasty: benannt(werte.dynastyId, haeuser),
			value: werte.value,
			detail: werte.detail
		};
	});
}

function benannt(
	id: string | null,
	namen: Map<string, string>
): { id: string; name: string } | undefined {
	if (!id) return undefined;
	return { id, name: namen.get(id) ?? 'jemand' };
}
