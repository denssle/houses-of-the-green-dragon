import { describe, expect, it } from 'vitest';
import {
	AMBITION_TO_STAND,
	canStand,
	canVote,
	currentHolder,
	isEligible,
	npcChoice,
	ranking,
	TERM_YEARS,
	wouldStand
} from '$lib/game/election.logic';
import { AGE_OF_MAJORITY, yearsToTicks } from '$lib/game/time';

const JETZT = 10_000;
const geboren = (alter: number): number => JETZT - yearsToTicks(alter);

describe('Wahlen', () => {
	describe('wer wählen darf', () => {
		it('lässt Erwachsene wählen', () => {
			expect(isEligible(geboren(AGE_OF_MAJORITY), JETZT)).toBe(true);
		});

		it('lässt Kinder nicht wählen', () => {
			// Die Sorge aus Punkt 9: Ohne Untergrenze gewinnt, wer die meisten Kleinkinder
			// hat.
			expect(isEligible(geboren(AGE_OF_MAJORITY - 1), JETZT)).toBe(false);
		});
	});

	describe('sich aufstellen lassen', () => {
		const erwachsen = { birthTick: geboren(30), alreadyStanding: false };

		it('geht während einer laufenden Wahl', () => {
			expect(canStand(erwachsen, { open: true }, JETZT)).toEqual({ ok: true });
		});

		it('geht nicht ohne Wahl', () => {
			expect(canStand(erwachsen, { open: false }, JETZT)).toEqual({
				ok: false,
				reason: 'NO_ELECTION'
			});
		});

		it('geht nicht zweimal', () => {
			expect(canStand({ ...erwachsen, alreadyStanding: true }, { open: true }, JETZT)).toEqual({
				ok: false,
				reason: 'ALREADY_STANDING'
			});
		});
	});

	describe('abstimmen', () => {
		const waehler = { birthTick: geboren(30), alreadyVoted: false };
		const wahl = { open: true, candidates: ['anna', 'bertram'] };

		it('geht einmal', () => {
			expect(canVote(waehler, wahl, 'anna', JETZT)).toEqual({ ok: true });
			expect(canVote({ ...waehler, alreadyVoted: true }, wahl, 'anna', JETZT)).toEqual({
				ok: false,
				reason: 'ALREADY_VOTED'
			});
		});

		it('geht nur auf einen, der antritt', () => {
			expect(canVote(waehler, wahl, 'niemand', JETZT)).toEqual({
				ok: false,
				reason: 'NO_SUCH_PERSON'
			});
		});
	});

	describe('das Auszählen', () => {
		it('sortiert nach Stimmen', () => {
			const rang = ranking(
				[
					{ candidateId: 'anna', votes: 3 },
					{ candidateId: 'bertram', votes: 5 }
				],
				['anna', 'bertram']
			);

			expect(rang).toEqual(['bertram', 'anna']);
		});

		it('entscheidet Gleichstand nach der Reihenfolge der Kandidatur', () => {
			// Ein Münzwurf wäre gerechter und wäre schlechter: Er machte das Ergebnis von
			// einem Zufall abhängig, den niemand nachvollziehen kann — und bei jedem
			// Nachrücken müsste neu geworfen werden.
			const rang = ranking(
				[
					{ candidateId: 'spaeter', votes: 4 },
					{ candidateId: 'zuerst', votes: 4 }
				],
				['zuerst', 'spaeter']
			);

			expect(rang).toEqual(['zuerst', 'spaeter']);
		});
	});

	describe('wer das Amt innehat', () => {
		const rang = ['erster', 'zweiter', 'dritter'];

		it('ist der Sieger, solange er lebt', () => {
			expect(currentHolder(rang, new Set(rang))).toBe('erster');
		});

		/**
		 * Der Kern der Entscheidung zu Punkt 10: Die Nachfolge ist keine Sonderbehandlung,
		 * sondern dieselbe Rechnung. Der Zweite rückt nach, weil er nach dem Toten der
		 * Beste ist — ohne dass beim Sterben irgendetwas mitlaufen müsste.
		 */
		it('rückt beim Tod auf den Nächsten', () => {
			expect(currentHolder(rang, new Set(['zweiter', 'dritter']))).toBe('zweiter');
			expect(currentHolder(rang, new Set(['dritter']))).toBe('dritter');
		});

		it('ist niemand, wenn alle tot sind — dann muss neu gewählt werden', () => {
			expect(currentHolder(rang, new Set())).toBeUndefined();
		});
	});

	describe('wie ein NPC wählt', () => {
		it('nimmt den, den er am liebsten mag', () => {
			const gewaehlt = npcChoice('waehler', [
				{ candidateId: 'anna', affection: 10 },
				{ candidateId: 'bertram', affection: 40 }
			]);

			expect(gewaehlt).toBe('bertram');
		});

		it('wählt sich selbst, wenn er antritt', () => {
			const gewaehlt = npcChoice('waehler', [
				{ candidateId: 'anna', affection: 90 },
				{ candidateId: 'waehler', affection: 0 }
			]);

			expect(gewaehlt).toBe('waehler');
		});

		it('wählt niemanden, wenn niemand antritt', () => {
			expect(npcChoice('waehler', [])).toBeUndefined();
		});
	});

	describe('wer sich aufstellen lässt', () => {
		it('hängt am Ehrgeiz', () => {
			// Die Handlung, auf die die Achse seit 4.4a wartet.
			expect(wouldStand(AMBITION_TO_STAND)).toBe(true);
			expect(wouldStand(AMBITION_TO_STAND - 1)).toBe(false);
		});
	});

	describe('die Amtszeit', () => {
		it('ist kurz genug für mehrere Wahlen im Leben', () => {
			// Ein Charakter lebt rund siebzig Jahre und erlebt damit gut zehn Wahlen.
			expect(70 / TERM_YEARS).toBeGreaterThan(10);
		});
	});
});
