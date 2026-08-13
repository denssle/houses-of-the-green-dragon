import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { Character } from '$lib/db/model/character';
import { Candidacy, Election, Vote } from '$lib/db/model/election';
import { Region } from '$lib/db/model/region';
import {
	CAMPAIGN_TICKS,
	canStand,
	canVote,
	currentHolder,
	isEligible,
	npcChoice,
	type Office,
	ranking,
	type Tally,
	TERM_TICKS,
	wouldStand
} from '$lib/game/election.logic';
import * as relationshipService from '$lib/server/service/relationshipService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Wahlen und Ämter.
 *
 * **Es gibt keine Ämtertabelle.** Wer ein Amt innehat, ergibt sich aus der letzten
 * abgeschlossenen Wahl — der bestplatzierte Kandidat, der noch lebt. Damit ist die
 * Nachfolge beim Tod keine Sonderbehandlung, sondern dieselbe Rechnung: Der
 * Zweitplatzierte rückt nach, weil er nach dem Toten der Beste ist. Kein Ereignis, das
 * beim Sterben mitlaufen müsste, keine zweite Ablage, die abweichen könnte.
 */

export type ElectionResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/** Die laufende Wahl einer Stadt — oder nichts. */
export async function openElection(regionId: string, office: Office = 'MAYOR') {
	return Election.findOne({ where: { RegionId: regionId, office, closed: false } });
}

async function lastClosed(regionId: string, office: Office = 'MAYOR') {
	return Election.findOne({
		where: { RegionId: regionId, office, closed: true },
		order: [['closesTick', 'DESC']]
	});
}

/**
 * Die Reihenfolge der Kandidaturen — sie entscheidet bei Gleichstand.
 *
 * Der Tick allein reicht nicht: `npcsStandForElection` stellt alle im **selben** Tick
 * auf, und ohne weiteres Kriterium gäbe die Datenbank die Zeilen in beliebiger Ordnung
 * zurück. Dann hinge das Ergebnis einer Pattwahl davon ab, wie SQLite gerade liest — und
 * könnte beim nächsten Nachrücken anders ausfallen. Die Kennung als letzter Schlüssel ist
 * willkürlich, aber immerhin gleichbleibend.
 */
const KANDIDATUR_REIHENFOLGE: [string, string][] = [
	['standingSinceTick', 'ASC'],
	['createdAt', 'ASC'],
	['CharacterId', 'ASC']
];

/** Die Rangfolge einer abgeschlossenen Wahl. */
async function rangfolge(electionId: string): Promise<string[]> {
	const kandidaturen = await Candidacy.findAll({
		where: { ElectionId: electionId },
		order: KANDIDATUR_REIHENFOLGE
	});
	const reihenfolge: string[] = kandidaturen.map((k) => k.dataValues.CharacterId);

	const stimmen = await Vote.findAll({ where: { ElectionId: electionId } });
	const gezaehlt: Tally[] = reihenfolge.map((id) => ({
		candidateId: id,
		votes: stimmen.filter((s) => s.dataValues.CandidateCharacterId === id).length
	}));

	return ranking(gezaehlt, reihenfolge);
}

export interface OfficeHolder {
	characterId: string;
	name: string;
	termEndsTick: number | null;
	/** Wie viele vor ihm gestorben oder ausgeschieden sind. */
	movedUpBy: number;
}

/**
 * Wer das Amt jetzt innehat.
 *
 * Gerechnet, nicht gespeichert: der bestplatzierte lebende Kandidat der letzten Wahl.
 */
export async function getHolder(
	regionId: string,
	office: Office = 'MAYOR'
): Promise<OfficeHolder | undefined> {
	const wahl = await lastClosed(regionId, office);
	if (!wahl) return undefined;

	const rang: string[] = await rangfolge(wahl.dataValues.id);
	if (rang.length === 0) return undefined;

	const lebende = await Character.findAll({
		where: { id: { [Op.in]: rang }, deathTick: null },
		attributes: ['id', 'firstName']
	});
	const lebendeIds = new Set<string>(lebende.map((c) => c.dataValues.id));

	const inhaberId: string | undefined = currentHolder(rang, lebendeIds);
	if (!inhaberId) return undefined;

	return {
		characterId: inhaberId,
		name: lebende.find((c) => c.dataValues.id === inhaberId)!.dataValues.firstName,
		termEndsTick: wahl.dataValues.termEndsTick,
		movedUpBy: rang.indexOf(inhaberId)
	};
}

// --- Der Lauf einer Wahl -------------------------------------------------------------

export interface ElectionTick {
	opened: boolean;
	closed?: { winner?: string; votes: number; candidates: number };
}

/**
 * Ein Herzschlag Politik.
 *
 * Zwei Aufgaben: eine Wahl ausrufen, wenn keine läuft und die Amtszeit abgelaufen ist —
 * und eine laufende auszählen, wenn ihre Zeit um ist. Beides passiert selten (alle fünf
 * Spieljahre), der Durchlauf ist also billig.
 */
export async function advanceElections(
	regionId: string,
	tick: number,
	office: Office = 'MAYOR'
): Promise<ElectionTick> {
	const laufend = await openElection(regionId, office);

	if (laufend) {
		if (tick < laufend.dataValues.closesTick) return { opened: false };
		return { opened: false, closed: await auszaehlen(laufend.dataValues.id, regionId, tick) };
	}

	// Neu ausrufen, wenn es noch nie eine gab, die Amtszeit vorbei ist — oder niemand
	// mehr da ist, der das Amt führen könnte.
	const letzte = await lastClosed(regionId, office);
	const inhaber = await getHolder(regionId, office);
	const abgelaufen: boolean =
		!letzte ||
		!inhaber ||
		(letzte.dataValues.termEndsTick !== null && tick >= letzte.dataValues.termEndsTick);

	if (!abgelaufen) return { opened: false };

	await Election.create({
		id: randomUUID(),
		RegionId: regionId,
		office,
		openedTick: tick,
		closesTick: tick + CAMPAIGN_TICKS,
		termEndsTick: null,
		closed: false
	});
	return { opened: true };
}

/**
 * Auszählen.
 *
 * Vorher stimmen alle NPCs ab, die es noch nicht getan haben — nach Zuneigung zu den
 * Kandidaten. Das geschieht **erst hier** und nicht laufend: Eine Stimme ist eine
 * Entscheidung ohne Kosten, und ein NPC, der sie am ersten Tag abgibt, hätte nur weniger
 * Zeit gehabt, sich eine Meinung zu bilden.
 */
async function auszaehlen(
	electionId: string,
	regionId: string,
	tick: number
): Promise<NonNullable<ElectionTick['closed']>> {
	await notfallsJemandenAufstellen(electionId, regionId, tick);
	await npcsAbstimmenLassen(electionId, regionId, tick);

	const rang: string[] = await rangfolge(electionId);
	const stimmen: number = await Vote.count({ where: { ElectionId: electionId } });

	await Election.update(
		{ closed: true, termEndsTick: tick + TERM_TICKS },
		{ where: { id: electionId } }
	);

	return { winner: rang[0], votes: stimmen, candidates: rang.length };
}

/**
 * Wenn der Zettel leer bleibt, wird jemand aufgestellt.
 *
 * Eine kleine Stadt kann eine Weile lang niemanden hervorbringen, der von sich aus will —
 * und stünde dann ohne Bürgermeister da, bis der Zufall einen Ehrgeizigen gebiert. Statt
 * dessen tritt der Ehrgeizigste an, den es gibt: nicht, weil er will, sondern weil es
 * jemand tun muss.
 */
async function notfallsJemandenAufstellen(
	electionId: string,
	regionId: string,
	tick: number
): Promise<void> {
	if ((await Candidacy.count({ where: { ElectionId: electionId } })) > 0) return;

	const anwaerter = await Character.findAll({
		where: { RegionId: regionId, deathTick: null },
		order: [['ambition', 'DESC']]
	});
	const gedraengt = anwaerter.find((person) => isEligible(person.dataValues.birthTick, tick));
	if (!gedraengt) return;

	await Candidacy.create({
		ElectionId: electionId,
		CharacterId: gedraengt.dataValues.id,
		standingSinceTick: tick
	});
}

/** Alle wahlberechtigten NPCs, die noch nicht gewählt haben, stimmen ab. */
async function npcsAbstimmenLassen(
	electionId: string,
	regionId: string,
	tick: number
): Promise<void> {
	const kandidaten = await Candidacy.findAll({ where: { ElectionId: electionId } });
	if (kandidaten.length === 0) return;

	const kandidatenIds: string[] = kandidaten.map((k) => k.dataValues.CharacterId);
	const waehler = await Character.findAll({
		where: { RegionId: regionId, deathTick: null, role: 'NPC' }
	});

	for (const waehlerIn of waehler) {
		if (!isEligible(waehlerIn.dataValues.birthTick, tick)) continue;

		const schon = await Vote.findOne({
			where: { ElectionId: electionId, VoterCharacterId: waehlerIn.dataValues.id }
		});
		if (schon) continue;

		// Kein eigenes Wahlkampfsystem: Es zählt, wie der Wähler zum Kandidaten steht.
		const zuneigungen = [];
		for (const kandidatId of kandidatenIds) {
			const stand = await relationshipService.getAffection(
				waehlerIn.dataValues.id,
				kandidatId,
				tick
			);
			zuneigungen.push({ candidateId: kandidatId, affection: stand.affection });
		}

		const gewaehlt: string | undefined = npcChoice(waehlerIn.dataValues.id, zuneigungen);
		if (!gewaehlt) continue;

		await Vote.create({
			ElectionId: electionId,
			VoterCharacterId: waehlerIn.dataValues.id,
			CandidateCharacterId: gewaehlt
		});
	}
}

// --- Handlungen ----------------------------------------------------------------------

export async function stand(characterId: string, regionId: string): Promise<ElectionResult> {
	const tick: number = await worldService.currentTick();
	const wahl = await openElection(regionId);
	const bewerber = await Character.findByPk(characterId);
	if (!bewerber) return { ok: false, reason: 'NO_SUCH_PERSON' };

	const schon = wahl
		? await Candidacy.findOne({
				where: { ElectionId: wahl.dataValues.id, CharacterId: characterId }
			})
		: null;

	const geprueft = canStand(
		{ birthTick: bewerber.dataValues.birthTick, alreadyStanding: schon !== null },
		{ open: wahl !== null },
		tick
	);
	if (!geprueft.ok) return geprueft;

	await Candidacy.create({
		ElectionId: wahl!.dataValues.id,
		CharacterId: characterId,
		standingSinceTick: tick
	});
	return { ok: true };
}

export async function vote(
	voterId: string,
	regionId: string,
	candidateId: string
): Promise<ElectionResult> {
	const wahl = await openElection(regionId);
	const waehler = await Character.findByPk(voterId);
	if (!waehler) return { ok: false, reason: 'NO_SUCH_PERSON' };

	const kandidaten = wahl
		? await Candidacy.findAll({ where: { ElectionId: wahl.dataValues.id } })
		: [];
	const schon = wahl
		? await Vote.findOne({ where: { ElectionId: wahl.dataValues.id, VoterCharacterId: voterId } })
		: null;

	const geprueft = canVote(
		{ birthTick: waehler.dataValues.birthTick, alreadyVoted: schon !== null },
		{ open: wahl !== null, candidates: kandidaten.map((k) => k.dataValues.CharacterId) },
		candidateId,
		await worldService.currentTick()
	);
	if (!geprueft.ok) return geprueft;

	await Vote.create({
		ElectionId: wahl!.dataValues.id,
		VoterCharacterId: voterId,
		CandidateCharacterId: candidateId
	});
	return { ok: true };
}

/** NPCs mit genug Ehrgeiz stellen sich auf — die Handlung, auf die die Achse wartete. */
export async function npcsStandForElection(regionId: string, tick: number): Promise<number> {
	const wahl = await openElection(regionId);
	if (!wahl) return 0;

	const npcs = await Character.findAll({
		where: { RegionId: regionId, deathTick: null, role: 'NPC' }
	});

	let neue = 0;
	for (const npc of npcs) {
		if (!isEligible(npc.dataValues.birthTick, tick)) continue;
		if (!wouldStand(npc.dataValues.ambition)) continue;

		const schon = await Candidacy.findOne({
			where: { ElectionId: wahl.dataValues.id, CharacterId: npc.dataValues.id }
		});
		if (schon) continue;

		await Candidacy.create({
			ElectionId: wahl.dataValues.id,
			CharacterId: npc.dataValues.id,
			standingSinceTick: tick
		});
		neue++;
	}
	return neue;
}

// --- Anzeigen ------------------------------------------------------------------------

export interface Ballot {
	electionId: string;
	closesTick: number;
	candidates: { id: string; name: string; votes: number; mine: boolean }[];
	iStand: boolean;
	iVoted: boolean;
}

export async function getBallot(regionId: string, viewerId?: string): Promise<Ballot | undefined> {
	const wahl = await openElection(regionId);
	if (!wahl) return undefined;

	const kandidaturen = await Candidacy.findAll({
		where: { ElectionId: wahl.dataValues.id },
		order: KANDIDATUR_REIHENFOLGE
	});
	const stimmen = await Vote.findAll({ where: { ElectionId: wahl.dataValues.id } });

	const kandidaten = [];
	for (const kandidatur of kandidaturen) {
		const person = await Character.findByPk(kandidatur.dataValues.CharacterId);
		if (!person) continue;
		kandidaten.push({
			id: person.dataValues.id,
			name: person.dataValues.firstName,
			// Zwischenstände sind sichtbar: Ein Wahlkampf, in dem niemand weiß, wo er
			// steht, ist keiner.
			votes: stimmen.filter(
				(s) => s.dataValues.CandidateCharacterId === kandidatur.dataValues.CharacterId
			).length,
			mine: person.dataValues.id === viewerId
		});
	}

	return {
		electionId: wahl.dataValues.id,
		closesTick: wahl.dataValues.closesTick,
		candidates: kandidaten,
		iStand: kandidaten.some((k) => k.mine),
		iVoted: stimmen.some((s) => s.dataValues.VoterCharacterId === viewerId)
	};
}

/** Die Stadtkasse — bisher nur ein Sammelbecken, ab 4.7b ein Hebel. */
export async function getTreasury(regionId: string): Promise<number> {
	const stadt = await Region.findByPk(regionId);
	return stadt?.dataValues.treasury ?? 0;
}
