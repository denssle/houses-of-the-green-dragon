import { describe, expect, it } from 'vitest';
import {
	affectionBonus,
	GARMENT_BONUS,
	GARMENT_LIFETIME_TICKS,
	GARMENT_LIFETIME_YEARS,
	garmentIntact,
	garmentYearsLeft,
	PERFUME_BONUS,
	TONIC_ACTION_POINTS,
	tonicRestores
} from '$lib/game/attire.logic';
import { MAX_ACTION_POINTS, TICKS_PER_YEAR } from '$lib/game/time';

const JETZT = 10_000;

describe('Kleidung und Duftwasser', () => {
	describe('wie lange ein Gewand hält', () => {
		it('einige Spieljahre, dann ist es hin', () => {
			// Das ist Punkt 20 im Kleinen: Ohne Verschleiß kauft jeder genau ein Gewand,
			// und der Schneider hat danach nichts mehr zu tun.
			expect(garmentIntact(JETZT, JETZT)).toBe(true);
			expect(garmentIntact(JETZT, JETZT + GARMENT_LIFETIME_TICKS - 1)).toBe(true);
			expect(garmentIntact(JETZT, JETZT + GARMENT_LIFETIME_TICKS)).toBe(false);
		});

		it('gar nicht, wenn man keines trägt', () => {
			expect(garmentIntact(null, JETZT)).toBe(false);
			expect(garmentYearsLeft(null, JETZT)).toBe(0);
		});

		it('lässt sich in Jahren sagen', () => {
			// Ticks sind eine Rechengröße, keine Auskunft.
			expect(garmentYearsLeft(JETZT, JETZT)).toBe(GARMENT_LIFETIME_YEARS);
			expect(garmentYearsLeft(JETZT, JETZT + TICKS_PER_YEAR)).toBe(GARMENT_LIFETIME_YEARS - 1);
			expect(garmentYearsLeft(JETZT, JETZT + GARMENT_LIFETIME_TICKS)).toBe(0);
		});
	});

	describe('was das Auftreten zuschlägt', () => {
		it('nichts ohne beides', () => {
			expect(affectionBonus({ garmentIntact: false, perfumeUsed: false })).toBe(0);
		});

		it('das Gewand bei jedem Umgang', () => {
			expect(affectionBonus({ garmentIntact: true, perfumeUsed: false })).toBe(GARMENT_BONUS);
		});

		it('das Duftwasser obendrauf', () => {
			// Beides zugleich ist die teuerste und wirksamste Art zu werben.
			expect(affectionBonus({ garmentIntact: true, perfumeUsed: true })).toBe(
				GARMENT_BONUS + PERFUME_BONUS
			);
		});

		it('gibt dem Duftwasser mehr Gewicht als dem Gewand', () => {
			// Es ist der Aufwand für einen Anlass und einmal verbraucht — das Gewand wirkt
			// dafür wochenlang.
			expect(PERFUME_BONUS).toBeGreaterThan(GARMENT_BONUS);
		});
	});

	describe('der Stärkungstrank', () => {
		it('füllt auf, was fehlt', () => {
			expect(tonicRestores(MAX_ACTION_POINTS - 3, MAX_ACTION_POINTS)).toBe(3);
			expect(tonicRestores(0, MAX_ACTION_POINTS)).toBe(TONIC_ACTION_POINTS);
		});

		it('wirkt nicht über die Obergrenze hinaus', () => {
			// Sonst hortete man Punkte für einen Tag, an dem alles auf einmal geschieht —
			// und die Drosselung über das Aktionsbudget wäre ausgehebelt.
			expect(tonicRestores(MAX_ACTION_POINTS, MAX_ACTION_POINTS)).toBe(0);
		});

		it('ersetzt keinen Tag', () => {
			// Ein Trank, der die Hauptressource beliebig ersetzt, kaufte Zeit: Wer mehr Geld
			// hat, hätte einfach mehr Tag.
			expect(TONIC_ACTION_POINTS).toBeLessThan(MAX_ACTION_POINTS / 4);
		});
	});
});
