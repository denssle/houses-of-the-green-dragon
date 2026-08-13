import { describe, expect, it } from 'vitest';
import { produce, type Recipe, TITHE, titheOn, yieldOf } from '$lib/game/production.logic';

const ERNTE: Recipe = {
	input: [],
	outputItemId: 'GRAIN',
	baseOutput: 6,
	actionPointCost: 1,
	skill: 'FARMING',
	seasons: ['SUMMER', 'AUTUMN']
};

const MAHLEN: Recipe = {
	input: [{ itemId: 'GRAIN', quantity: 3 }],
	outputItemId: 'FLOUR',
	baseOutput: 2,
	actionPointCost: 1,
	skill: 'BAKING'
};

const KRAEFTIG = { actionPoints: 10, skillLevel: 0 };

describe('Herstellen', () => {
	describe('der Ertrag', () => {
		it('folgt der Grundmenge des Rezepts', () => {
			expect(yieldOf(MAHLEN, 0, 100)).toBe(2);
		});

		it('steigt mit dem Können', () => {
			expect(yieldOf(ERNTE, 10, 100)).toBeGreaterThan(yieldOf(ERNTE, 0, 100));
		});

		it('sinkt mit dem Zustand des Betriebs', () => {
			expect(yieldOf(ERNTE, 0, 50)).toBeLessThan(yieldOf(ERNTE, 0, 100));
		});

		it('bringt immer mindestens ein Stück', () => {
			// Sonst wäre der Aktionspunkt verloren, ohne dass es jemand angesagt hätte —
			// dieselbe Regel wie beim Lohn.
			expect(yieldOf(MAHLEN, 0, 1)).toBe(1);
		});
	});

	describe('ein Durchgang', () => {
		it('geht, wenn Zutaten und Kraft da sind', () => {
			const ergebnis = produce(KRAEFTIG, MAHLEN, { GRAIN: 3 }, 100, 'WINTER');

			expect(ergebnis).toEqual({ ok: true, actionPoints: 9, produced: 2 });
		});

		it('scheitert ohne Zutaten', () => {
			expect(produce(KRAEFTIG, MAHLEN, { GRAIN: 2 }, 100, 'WINTER')).toEqual({
				ok: false,
				reason: 'NOT_IN_STOCK'
			});
		});

		it('scheitert ohne Kraft', () => {
			expect(
				produce({ actionPoints: 0, skillLevel: 0 }, MAHLEN, { GRAIN: 9 }, 100, 'WINTER')
			).toEqual({ ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' });
		});
	});

	describe('die Jahreszeit', () => {
		it('lässt zur Erntezeit ernten', () => {
			expect(produce(KRAEFTIG, ERNTE, {}, 100, 'SUMMER').ok).toBe(true);
			expect(produce(KRAEFTIG, ERNTE, {}, 100, 'AUTUMN').ok).toBe(true);
		});

		it('lässt im Winter nichts wachsen', () => {
			// Die erste Wirkung der Jahreszeiten, die etwas erzeugt statt nur etwas zu
			// verteuern — und der Grund für Vorratshaltung.
			expect(produce(KRAEFTIG, ERNTE, {}, 100, 'WINTER')).toEqual({
				ok: false,
				reason: 'WRONG_SEASON'
			});
			expect(produce(KRAEFTIG, ERNTE, {}, 100, 'SPRING').ok).toBe(false);
		});

		it('lässt die Mühle das ganze Jahr über mahlen', () => {
			// Was kein Feld ist, kennt keine Saison.
			for (const jahreszeit of ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const) {
				expect(produce(KRAEFTIG, MAHLEN, { GRAIN: 3 }, 100, jahreszeit).ok).toBe(true);
			}
		});
	});

	describe('der Zehnt', () => {
		it('nimmt einen Bruchteil der Ernte', () => {
			expect(titheOn(20)).toBe(Math.floor(20 * TITHE));
		});

		it('lässt kleine Ernten unbehelligt', () => {
			// Abgerundet: Wer eine Handvoll erntet, zahlt nichts. Das ist die Kehrseite
			// davon, den Ertrag zu besteuern statt die Zeit.
			expect(titheOn(5)).toBe(0);
		});
	});
});
