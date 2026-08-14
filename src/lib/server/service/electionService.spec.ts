import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { Relationship } from '$lib/db/model/relationship';
import { Candidacy, Election, Vote } from '$lib/db/model/election';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as electionService from '$lib/server/service/electionService';
import * as npcService from '$lib/server/service/npcService';
import * as relationshipService from '$lib/server/service/relationshipService';
import { AMBITION_TO_STAND, CAMPAIGN_TICKS, TERM_TICKS } from '$lib/game/election.logic';
import { AGE_OF_MAJORITY, yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.7a gegen die Datenbank. Im Mittelpunkt steht der Kern der Entscheidung: dass
 * der Amtsinhaber gerechnet und nicht gespeichert wird — und dass deshalb beim Tod
 * niemand nachrücken *muss*, sondern schon nachgerückt *ist*.
 */

const JETZT = 10_000;
let stadtId: string;

async function person(name: string, extras: Record<string, unknown> = {}): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		ambition: 0,
		RegionId: stadtId,
		...extras
	});
	return id;
}

/** Ruft eine Wahl aus und gibt ihre Kennung zurück. */
async function wahlAusrufen(tick = JETZT): Promise<string> {
	await electionService.advanceElections(stadtId, tick);
	return (await electionService.openElection(stadtId))!.dataValues.id;
}

/** Stellt die Weltuhr — `stand()` liest sie, und der Tick entscheidet die Reihenfolge. */
async function uhrAuf(tick: number): Promise<void> {
	await World.update({ currentTick: tick }, { where: { id: WORLD_ID } });
}

async function toeten(id: string): Promise<void> {
	await Character.update({ deathTick: JETZT }, { where: { id } });
}

describe('Wahlen gegen die Datenbank', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Vote.destroy({ where: {} });
		await Candidacy.destroy({ where: {} });
		await Election.destroy({ where: {} });
		await Relationship.destroy({ where: {} });
		await Character.destroy({ where: {} });
	});

	describe('der Lauf einer Wahl', () => {
		it('ruft eine aus, wenn es noch nie eine gab', async () => {
			expect(await electionService.advanceElections(stadtId, JETZT)).toEqual({ opened: true });
			expect(await electionService.openElection(stadtId)).not.toBeNull();
		});

		it('ruft keine zweite aus, solange eine läuft', async () => {
			await wahlAusrufen();
			expect(await electionService.advanceElections(stadtId, JETZT + 1)).toEqual({
				opened: false
			});
			expect(await Election.count()).toBe(1);
		});

		it('zählt aus, wenn die Wahlkampfzeit um ist', async () => {
			await wahlAusrufen();
			const anna = await person('Anna');
			await electionService.stand(anna, stadtId);

			const ergebnis = await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);

			expect(ergebnis.closed?.winner).toBe(anna);
			expect(await electionService.openElection(stadtId)).toBeNull();
		});

		it('ruft erst nach Ablauf der Amtszeit wieder aus', async () => {
			await wahlAusrufen();
			const anna = await person('Anna');
			await electionService.stand(anna, stadtId);
			const ausgezaehlt = JETZT + CAMPAIGN_TICKS;
			await electionService.advanceElections(stadtId, ausgezaehlt);

			expect(await electionService.advanceElections(stadtId, ausgezaehlt + TERM_TICKS - 1)).toEqual(
				{ opened: false }
			);
			expect(await electionService.advanceElections(stadtId, ausgezaehlt + TERM_TICKS)).toEqual({
				opened: true
			});
		});
	});

	describe('kandidieren', () => {
		it('geht nur während einer Wahl', async () => {
			const anna = await person('Anna');
			expect(await electionService.stand(anna, stadtId)).toEqual({
				ok: false,
				reason: 'NO_ELECTION'
			});
		});

		it('geht nicht zweimal', async () => {
			await wahlAusrufen();
			const anna = await person('Anna');

			expect(await electionService.stand(anna, stadtId)).toEqual({ ok: true });
			expect(await electionService.stand(anna, stadtId)).toEqual({
				ok: false,
				reason: 'ALREADY_STANDING'
			});
			expect(await Candidacy.count()).toBe(1);
		});

		it('geht nicht als Kind', async () => {
			await wahlAusrufen();
			const kind = await person('Kind', {
				birthTick: JETZT - yearsToTicks(AGE_OF_MAJORITY - 1)
			});

			expect(await electionService.stand(kind, stadtId)).toEqual({
				ok: false,
				reason: 'TOO_YOUNG'
			});
		});

		it('bringt nur ehrgeizige NPCs auf den Zettel', async () => {
			await wahlAusrufen();
			await person('Ehrgeizig', { ambition: AMBITION_TO_STAND });
			await person('Genügsam', { ambition: AMBITION_TO_STAND - 1 });

			expect(await electionService.npcsStandForElection(stadtId, JETZT)).toBe(1);
			// Ein zweiter Durchlauf stellt niemanden doppelt auf.
			expect(await electionService.npcsStandForElection(stadtId, JETZT)).toBe(0);
		});

		it('drängt den Ehrgeizigsten, wenn sonst niemand will', async () => {
			// Sonst stünde eine kleine Stadt ohne Bürgermeister da, bis der Zufall einen
			// Ehrgeizigen hervorbringt — in der Startstadt lief die Wahl dreimal ins Leere.
			await wahlAusrufen();
			const willNicht = await person('Bescheiden', { ambition: -50 });
			const willAuchNicht = await person('Mäßig', { ambition: 10 });
			// Drei Jahre zu jung — beim Auszählen ist ein Spieljahr vergangen, und wer dann
			// volljährig ist, darf zu Recht auf den Zettel.
			const kind = await person('Kind', {
				ambition: 100,
				birthTick: JETZT - yearsToTicks(AGE_OF_MAJORITY - 3)
			});

			await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);

			// Das ehrgeizige Kind zählt nicht mit — gedrängt wird, wer wählbar ist.
			const inhaber = await electionService.getHolder(stadtId);
			expect(inhaber?.characterId).toBe(willAuchNicht);
			expect([willNicht, kind]).not.toContain(inhaber?.characterId);
		});
	});

	describe('abstimmen', () => {
		it('zählt eine Stimme und lässt keine zweite zu', async () => {
			await wahlAusrufen();
			const anna = await person('Anna');
			const waehler = await person('Wähler');
			await electionService.stand(anna, stadtId);

			expect(await electionService.vote(waehler, stadtId, anna)).toEqual({ ok: true });
			expect(await electionService.vote(waehler, stadtId, anna)).toEqual({
				ok: false,
				reason: 'ALREADY_VOTED'
			});
			expect(await Vote.count()).toBe(1);
		});

		it('lässt NPCs im Wahlkampf nach Zuneigung stimmen', async () => {
			// **Nicht mehr beim Auszählen.** Seit 4.16 ist Wählen eine Handlung wie jede
			// andere: Jeder geht, wenn sein Wesen ihn treibt. Hier wird deshalb der Takt
			// laufen gelassen und nicht die Auszählung abgewartet.
			await wahlAusrufen();
			// Mit Geld über der Rücklage: Wer nichts hat, arbeitet — Sicherheit kommt vor
			// Teilhabe. Das ist der eigene Test darunter.
			const anna = await person('Anna', { diligence: 100, ambition: 100, money: 100 });
			const bertram = await person('Bertram', { diligence: 100, ambition: 100, money: 100 });
			const waehler = await person('Wähler', { diligence: 100, ambition: 100, money: 100 });
			await electionService.stand(anna, stadtId);
			await electionService.stand(bertram, stadtId);
			await relationshipService.changeAffection(waehler, bertram, 60, JETZT);

			// **Zweimal:** Im ersten Tick ziehen sie unter ein Dach — Sicherheit kommt vor
			// Teilhabe, und das ist die Hierarchie, nicht ein Versehen.
			await npcService.actForNpcs(JETZT);
			await npcService.actForNpcs(JETZT);
			const ergebnis = await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);

			// Anna und Bertram wählen sich selbst, der Wähler nimmt Bertram.
			expect(ergebnis.closed?.winner).toBe(bertram);
			expect(ergebnis.closed?.votes).toBe(3);
		});

		it('lässt den Mittellosen erst arbeiten', async () => {
			// **Sicherheit vor Teilhabe.** Wer nichts zu essen hat, geht nicht zur Wahl —
			// und das ist keine Panne, sondern die Bedürfnishierarchie aus 4.13. Sobald die
			// Rücklage steht, wählt er.
			await wahlAusrufen();
			const anna = await person('Anna', { diligence: 100, ambition: 100, money: 100 });
			await electionService.stand(anna, stadtId);
			const arm = await person('Arm', { diligence: 100, ambition: 100, money: 0 });

			await npcService.actForNpcs(JETZT);
			await npcService.actForNpcs(JETZT);

			const stimmen = await Vote.findAll();
			expect(stimmen.map((s) => s.dataValues.VoterCharacterId)).not.toContain(arm);
		});

		it('lässt den Trägen erst spät wählen', async () => {
			// Wer träge und gleichgültig ist, wartet bis kurz vor Schluss — und wenn er
			// vorher stirbt, hat er eben nicht gewählt. Trägheit soll etwas kosten.
			await wahlAusrufen();
			const anna = await person('Anna', { diligence: 100, ambition: 100, money: 100 });
			await electionService.stand(anna, stadtId);
			await person('Traege', { diligence: -100, ambition: -100, money: 100 });

			await npcService.actForNpcs(JETZT);
			await npcService.actForNpcs(JETZT);
			expect(await Vote.count()).toBe(1);

			// Kurz vor der Auszählung geht auch er.
			await World.update({ currentTick: JETZT + CAMPAIGN_TICKS - 1 }, { where: { id: WORLD_ID } });
			await npcService.actForNpcs(JETZT + CAMPAIGN_TICKS - 1);
			expect(await Vote.count()).toBe(2);
		});
	});

	describe('das Amt', () => {
		/**
		 * Eine abgeschlossene Wahl mit eindeutiger Rangfolge: Der erste Name bekommt die
		 * meisten Stimmen, der letzte die wenigsten. Bewusst kein Gleichstand — der wird
		 * in der Logik-Spec geprüft, hier soll die Reihenfolge unstrittig sein.
		 */
		async function wahlMitSieger(namen: string[]): Promise<string[]> {
			await wahlAusrufen();
			const ids: string[] = [];
			for (const name of namen) {
				const id = await person(name);
				await electionService.stand(id, stadtId);
				ids.push(id);
			}
			for (const [rang, id] of ids.entries()) {
				for (let stimme = 0; stimme < namen.length - rang; stimme++) {
					const waehler = await person(`Wähler ${rang}-${stimme}`);
					await electionService.vote(waehler, stadtId, id);
				}
			}
			await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);
			return ids;
		}

		it('hat der Sieger inne', async () => {
			const [erster] = await wahlMitSieger(['Erste', 'Zweite']);

			const inhaber = await electionService.getHolder(stadtId);
			expect(inhaber?.characterId).toBe(erster);
			expect(inhaber?.movedUpBy).toBe(0);
			expect(inhaber?.termEndsTick).toBe(JETZT + CAMPAIGN_TICKS + TERM_TICKS);
		});

		/**
		 * Der Grund für die ganze Bauart: Hier wird nichts nachgetragen. Der Tote fällt aus
		 * der Menge der Lebenden, und dieselbe Rechnung liefert den Nächsten.
		 */
		it('geht beim Tod von selbst an den Zweiten über', async () => {
			const [erster, zweiter, dritter] = await wahlMitSieger(['Erste', 'Zweite', 'Dritte']);

			await toeten(erster);
			expect((await electionService.getHolder(stadtId))?.characterId).toBe(zweiter);

			await toeten(zweiter);
			const inhaber = await electionService.getHolder(stadtId);
			expect(inhaber?.characterId).toBe(dritter);
			expect(inhaber?.movedUpBy).toBe(2);
		});

		it('ruft eine neue Wahl aus, wenn niemand mehr übrig ist', async () => {
			const ids = await wahlMitSieger(['Erste', 'Zweite']);
			for (const id of ids) await toeten(id);

			expect(await electionService.getHolder(stadtId)).toBeUndefined();
			// Nicht erst am Ende der Amtszeit: Eine Stadt ohne Bürgermeister wartet nicht
			// fünf Jahre.
			expect(await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS + 1)).toEqual({
				opened: true
			});
		});
	});

	describe('der Wahlzettel', () => {
		it('zeigt Zwischenstände und die eigene Lage', async () => {
			await wahlAusrufen();
			const ich = await person('Ich', { role: 'PLAYER' });
			const anna = await person('Anna');
			await electionService.stand(ich, stadtId);
			// Einen Tick später: Damit steht die Reihenfolge auf dem Zettel fest.
			await uhrAuf(JETZT + 1);
			await electionService.stand(anna, stadtId);
			await electionService.vote(ich, stadtId, anna);

			const zettel = await electionService.getBallot(stadtId, ich);

			expect(zettel?.iStand).toBe(true);
			expect(zettel?.iVoted).toBe(true);
			expect(zettel?.candidates.map((k) => [k.name, k.votes])).toEqual([
				['Ich', 0],
				['Anna', 1]
			]);
		});

		it('gibt es nicht, wenn keine Wahl läuft', async () => {
			expect(await electionService.getBallot(stadtId)).toBeUndefined();
		});
	});
});
