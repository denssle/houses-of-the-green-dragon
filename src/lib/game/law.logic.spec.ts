import { describe, expect, it } from 'vitest';
import {
	canEnact,
	collectable,
	currentValue,
	type Enactment,
	LAW_KINDS,
	LAW_RULES,
	propertyTaxFor,
	taxOn
} from '$lib/game/law.logic';

const IM_AMT = { isHolder: true };
const NICHT_IM_AMT = { isHolder: false };

describe('Gesetze', () => {
	describe('welcher Satz gilt', () => {
		it('ist ohne Erlass der Rückfallwert', () => {
			// Deshalb ändert 4.7b für sich genommen nichts am Spiel: Der Zehnt bleibt bei
			// zehn Prozent, bis jemand etwas anderes will.
			expect(currentValue([], 'TITHE')).toBe(LAW_RULES.TITHE.fallback);
		});

		it('ist der jüngste Erlass', () => {
			const erlasse: Enactment[] = [
				{ kind: 'TITHE', value: 20, enactedTick: 100 },
				{ kind: 'TITHE', value: 5, enactedTick: 300 },
				{ kind: 'TITHE', value: 15, enactedTick: 200 }
			];

			expect(currentValue(erlasse, 'TITHE')).toBe(5);
		});

		it('hält die Arten auseinander', () => {
			const erlasse: Enactment[] = [
				{ kind: 'TITHE', value: 20, enactedTick: 100 },
				{ kind: 'STALL_FEE', value: 7, enactedTick: 100 }
			];

			expect(currentValue(erlasse, 'TITHE')).toBe(20);
			expect(currentValue(erlasse, 'STALL_FEE')).toBe(7);
			expect(currentValue(erlasse, 'SALES_TAX')).toBe(LAW_RULES.SALES_TAX.fallback);
		});
	});

	describe('wer etwas erlassen darf', () => {
		it('nur der Amtsinhaber', () => {
			expect(canEnact(IM_AMT, 'TITHE', 20, 10)).toEqual({ ok: true });
			expect(canEnact(NICHT_IM_AMT, 'TITHE', 20, 10)).toEqual({
				ok: false,
				reason: 'NOT_IN_OFFICE'
			});
		});

		it('nicht über die Grenzen hinaus', () => {
			// Die Verfassung: Ein Zehnt von hundert Prozent wäre das Ende der Wirtschaft,
			// und zwar unwiderruflich — danach hätte niemand mehr genug, um zu handeln.
			expect(canEnact(IM_AMT, 'TITHE', LAW_RULES.TITHE.max + 1, 10)).toEqual({
				ok: false,
				reason: 'OUT_OF_BOUNDS'
			});
			expect(canEnact(IM_AMT, 'TITHE', -1, 10)).toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' });
		});

		it('lässt die Null zu', () => {
			// Ein Bürgermeister darf die Stadt aushungern. Das ist eine politische
			// Entscheidung und keine kaputte.
			expect(canEnact(IM_AMT, 'TITHE', 0, 10)).toEqual({ ok: true });
		});

		it('nicht denselben Satz noch einmal', () => {
			expect(canEnact(IM_AMT, 'TITHE', 10, 10)).toEqual({ ok: false, reason: 'NOTHING_TO_DO' });
		});

		it('keine krummen Zahlen', () => {
			expect(canEnact(IM_AMT, 'TITHE', 12.5, 10)).toEqual({ ok: false, reason: 'NOTHING_TO_DO' });
		});
	});

	describe('was eine Abgabe ausmacht', () => {
		it('rundet zugunsten des Kleinen ab', () => {
			expect(taxOn(20, 10)).toBe(2);
			expect(taxOn(5, 10)).toBe(0);
		});

		it('ist null, wo nichts zu holen ist', () => {
			expect(taxOn(0, 20)).toBe(0);
			expect(taxOn(100, 0)).toBe(0);
		});

		it('rechnet die Grundsteuer je Grundstück', () => {
			expect(propertyTaxFor(3, 5)).toBe(15);
			expect(propertyTaxFor(0, 5)).toBe(0);
			expect(propertyTaxFor(3, 0)).toBe(0);
		});
	});

	describe('was eingezogen wird', () => {
		it('ist die Schuld, wenn das Geld reicht', () => {
			expect(collectable(15, 100)).toBe(15);
		});

		it('ist das Vorhandene, wenn es nicht reicht', () => {
			// Der Rest wird erlassen und nicht vorgetragen: Eine Steuerschuld ohne
			// Vollstreckung wäre nur eine Zahl, die wächst und nie etwas tut.
			expect(collectable(15, 4)).toBe(4);
			expect(collectable(15, 0)).toBe(0);
		});
	});

	describe('die Grenzen selbst', () => {
		it('lassen jede Art bei null beginnen und irgendwo enden', () => {
			for (const art of LAW_KINDS) {
				const regel = LAW_RULES[art];
				expect(regel.min).toBe(0);
				expect(regel.max).toBeGreaterThan(regel.min);
				expect(regel.fallback).toBeGreaterThanOrEqual(regel.min);
				expect(regel.fallback).toBeLessThanOrEqual(regel.max);
			}
		});
	});
});
