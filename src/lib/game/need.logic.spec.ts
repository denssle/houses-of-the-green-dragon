import { describe, expect, it } from 'vitest';
import {
	actionPointFactor,
	currentSatiety,
	eat,
	starvationRiskPerYear,
	SATIETY_MAX,
	SATIETY_STARVING,
	SATIETY_WEAKENED,
	satietyLabel,
	TICKS_TO_STARVE,
	wouldBeWasted
} from '$lib/game/need.logic';
import { diesThisTick } from '$lib/game/mortality.logic';
import { MAX_ACTION_POINTS, TICKS_PER_YEAR } from '$lib/game/time';

describe('Bedürfnisse', () => {
	describe('der Hunger', () => {
		it('rührt sich nicht ohne verstrichene Zeit', () => {
			expect(currentSatiety(SATIETY_MAX, 500, 500)).toBe(SATIETY_MAX);
		});

		it('ist nach der vorgesehenen Zeit aufgebraucht', () => {
			expect(currentSatiety(SATIETY_MAX, 0, TICKS_TO_STARVE)).toBe(0);
		});

		it('steht nach der Hälfte bei der Hälfte', () => {
			expect(currentSatiety(SATIETY_MAX, 0, TICKS_TO_STARVE / 2)).toBeCloseTo(50, 8);
		});

		it('ergibt über viele Schritte dasselbe wie über einen', () => {
			// Wie überall: Wer oft nachsieht, darf nichts anderes vorfinden.
			const inEinem: number = currentSatiety(SATIETY_MAX, 0, 40);
			let schrittweise = SATIETY_MAX;
			for (let i = 0; i < 40; i++) schrittweise = currentSatiety(schrittweise, 0, 1);

			expect(schrittweise).toBeCloseTo(inEinem, 8);
		});

		it('fällt nicht unter null', () => {
			expect(currentSatiety(10, 0, TICKS_TO_STARVE * 5)).toBe(0);
		});

		/**
		 * Der Balancing-Nachweis: Essen soll etwas sein, das man alle paar Tage regelt.
		 * Wer die Konstanten anfasst, sieht hier, was das für den Alltag bedeutet.
		 */
		it('lässt ein Wochenende ohne Hunger vergehen', () => {
			// Zwei Realtage sind so viele Ticks, wie das Aktionsbudget zum Auffüllen
			// braucht — nach dieser Zeit soll noch niemand geschwächt sein.
			const nachZweiTagen: number = currentSatiety(SATIETY_MAX, 0, MAX_ACTION_POINTS);

			expect(nachZweiTagen).toBeGreaterThan(SATIETY_WEAKENED);
			expect(actionPointFactor(nachZweiTagen)).toBe(1);
		});

		it('wird binnen zweier Spieljahre lebensgefährlich', () => {
			const nachZweiJahren: number = currentSatiety(SATIETY_MAX, 0, TICKS_PER_YEAR * 2);

			expect(nachZweiJahren).toBe(0);
			expect(starvationRiskPerYear(nachZweiJahren)).toBe(0.9);
		});
	});

	describe('die Staffelung', () => {
		it('lässt den Satten in Ruhe', () => {
			expect(actionPointFactor(SATIETY_MAX)).toBe(1);
			expect(starvationRiskPerYear(SATIETY_MAX)).toBe(0);
		});

		it('nimmt zuerst Leistung, nicht Leben', () => {
			// Der Kern der Entscheidung: eine Vorwarnung, bevor es gefährlich wird.
			const geschwaecht: number = SATIETY_WEAKENED - 1;

			expect(actionPointFactor(geschwaecht)).toBeLessThan(1);
			expect(starvationRiskPerYear(geschwaecht)).toBe(0);
		});

		it('erhöht das Sterberisiko erst ganz unten', () => {
			expect(starvationRiskPerYear(SATIETY_STARVING)).toBe(0);
			expect(starvationRiskPerYear(SATIETY_STARVING - 1)).toBeGreaterThan(0);
			expect(starvationRiskPerYear(0)).toBe(0.9);
		});

		it('lässt auch einen Jungen verhungern', () => {
			// Der Grund, warum die Not ein eigenes Risiko hat und kein Faktor ist: Vor
			// vierzig ist das Altersrisiko null, und jedes Vielfache von null bliebe null.
			expect(diesThisTick(20, 0, starvationRiskPerYear(0))).toBe(true);
			expect(diesThisTick(20, 0, starvationRiskPerYear(SATIETY_MAX))).toBe(false);
		});

		it('bringt einen Verhungernden binnen eines Spieltages um', () => {
			const proTick: number = 1 - Math.pow(1 - starvationRiskPerYear(0), 1 / TICKS_PER_YEAR);
			const ueberlebtEinenTag: number = Math.pow(1 - proTick, 24);

			expect(ueberlebtEinenTag).toBeLessThan(0.5);
		});

		it('halbiert die Kraft im schlimmsten Fall, nimmt sie aber nicht ganz', () => {
			// Wer gar nichts mehr kann, könnte sich auch kein Brot mehr verdienen.
			expect(actionPointFactor(0)).toBe(0.5);
		});
	});

	describe('essen', () => {
		it('füllt auf', () => {
			expect(eat(20, 40)).toBe(60);
		});

		it('lässt sich nicht auf Vorrat futtern', () => {
			// Wer vorsorgen will, legt Brot ins Lager, nicht in den Magen.
			expect(eat(90, 40)).toBe(SATIETY_MAX);
			expect(wouldBeWasted(SATIETY_MAX)).toBe(true);
			expect(wouldBeWasted(99)).toBe(false);
		});
	});

	describe('das Wort zum Zustand', () => {
		it('benennt die Stufen', () => {
			expect(satietyLabel(SATIETY_MAX)).toBe('satt');
			expect(satietyLabel(40)).toBe('hungrig');
			expect(satietyLabel(20)).toBe('ausgezehrt');
			expect(satietyLabel(5)).toBe('am Verhungern');
			expect(satietyLabel(0)).toBe('verhungert');
		});
	});
});
