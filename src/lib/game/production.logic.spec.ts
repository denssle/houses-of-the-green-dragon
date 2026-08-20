import { describe, expect, it } from 'vitest';
import { produce, type Recipe, titheOn, yieldOf } from '$lib/game/production.logic';
import { LAW_RULES } from '$lib/game/law.logic';

/** Der Zehnt ist seit 4.7b ein Gesetz; ohne Erlass gilt der Rueckfallwert. */
const ZEHNT: number = LAW_RULES.TITHE.fallback;

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

/** Eine Werkstatt in voller Güte, ohne Ausbau — der Bezugspunkt für alles Übrige. */
const NEU = { condition: 100, level: 1 };

describe('Herstellen', () => {
	describe('der Ertrag', () => {
		it('folgt der Grundmenge des Rezepts', () => {
			expect(yieldOf(MAHLEN, 0, NEU)).toBe(2);
		});

		it('steigt mit dem Können', () => {
			expect(yieldOf(ERNTE, 10, NEU)).toBeGreaterThan(yieldOf(ERNTE, 0, NEU));
		});

		it('sinkt mit dem Zustand des Betriebs', () => {
			expect(yieldOf(ERNTE, 0, { ...NEU, condition: 50 })).toBeLessThan(yieldOf(ERNTE, 0, NEU));
		});

		it('bringt immer mindestens ein Stück', () => {
			// Sonst wäre der Aktionspunkt verloren, ohne dass es jemand angesagt hätte —
			// dieselbe Regel wie beim Lohn.
			expect(yieldOf(MAHLEN, 0, { ...NEU, condition: 1 })).toBe(1);
		});

		it('steigt mit dem Ausbau', () => {
			// Der Sinn des Ausbaus: dieselben zwei Stämme, mehr Bretter. Die Aktionspunkte
			// je Durchgang bleiben dieselben — der Ausbau kauft Ertrag, nicht Zeit.
			expect(yieldOf(MAHLEN, 0, { ...NEU, level: 2 })).toBe(3);
			expect(yieldOf(MAHLEN, 0, { ...NEU, level: 3 })).toBe(4);
		});

		it('nimmt eine Stufe unterhalb der ersten nicht als Abzug', () => {
			// Eine 0 in der Spalte wäre ein Datenfehler; sie darf den Ertrag halbieren,
			// aber nicht unter die Grundmenge drücken.
			expect(yieldOf(MAHLEN, 0, { ...NEU, level: 0 })).toBe(2);
		});
	});

	describe('ein Durchgang', () => {
		it('geht, wenn Zutaten und Kraft da sind', () => {
			const ergebnis = produce(KRAEFTIG, MAHLEN, { GRAIN: 3 }, NEU, 'WINTER');

			expect(ergebnis).toEqual({ ok: true, actionPoints: 9, produced: 2 });
		});

		it('scheitert ohne Zutaten', () => {
			expect(produce(KRAEFTIG, MAHLEN, { GRAIN: 2 }, NEU, 'WINTER')).toEqual({
				ok: false,
				reason: 'NOT_IN_STOCK'
			});
		});

		it('scheitert ohne Kraft', () => {
			expect(
				produce({ actionPoints: 0, skillLevel: 0 }, MAHLEN, { GRAIN: 9 }, NEU, 'WINTER')
			).toEqual({ ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' });
		});
	});

	describe('die Jahreszeit', () => {
		it('lässt zur Erntezeit ernten', () => {
			expect(produce(KRAEFTIG, ERNTE, {}, NEU, 'SUMMER').ok).toBe(true);
			expect(produce(KRAEFTIG, ERNTE, {}, NEU, 'AUTUMN').ok).toBe(true);
		});

		it('lässt im Winter nichts wachsen', () => {
			// Die erste Wirkung der Jahreszeiten, die etwas erzeugt statt nur etwas zu
			// verteuern — und der Grund für Vorratshaltung.
			expect(produce(KRAEFTIG, ERNTE, {}, NEU, 'WINTER')).toEqual({
				ok: false,
				reason: 'WRONG_SEASON'
			});
			expect(produce(KRAEFTIG, ERNTE, {}, NEU, 'SPRING').ok).toBe(false);
		});

		it('lässt die Mühle das ganze Jahr über mahlen', () => {
			// Was kein Feld ist, kennt keine Saison.
			for (const jahreszeit of ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const) {
				expect(produce(KRAEFTIG, MAHLEN, { GRAIN: 3 }, NEU, jahreszeit).ok).toBe(true);
			}
		});
	});

	describe('der Zehnt', () => {
		it('nimmt einen Bruchteil der Ernte', () => {
			expect(titheOn(20, ZEHNT)).toBe(2);
		});

		it('lässt kleine Ernten unbehelligt', () => {
			// Abgerundet: Wer eine Handvoll erntet, zahlt nichts. Das ist die Kehrseite
			// davon, den Ertrag zu besteuern statt die Zeit.
			expect(titheOn(5, ZEHNT)).toBe(0);
		});
	});
});
