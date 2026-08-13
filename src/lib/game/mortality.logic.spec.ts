import { describe, expect, it } from 'vitest';
import {
	deathProbabilityPerTick,
	deathProbabilityPerYear,
	diesThisTick,
	MORTALITY_DOUBLING_YEARS,
	MORTALITY_ONSET_AGE
} from '$lib/game/mortality.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';

describe('Sterberisiko', () => {
	it('lässt die Jugend in Ruhe', () => {
		expect(deathProbabilityPerYear(0)).toBe(0);
		expect(deathProbabilityPerYear(16)).toBe(0);
		expect(deathProbabilityPerYear(MORTALITY_ONSET_AGE - 1)).toBe(0);
	});

	it('verdoppelt sich im vorgesehenen Abstand', () => {
		const anfang: number = deathProbabilityPerYear(MORTALITY_ONSET_AGE);
		const spaeter: number = deathProbabilityPerYear(MORTALITY_ONSET_AGE + MORTALITY_DOUBLING_YEARS);

		expect(spaeter).toBeCloseTo(anfang * 2, 10);
	});

	it('wächst mit dem Alter, aber nie über Gewissheit hinaus', () => {
		expect(deathProbabilityPerYear(200)).toBe(1);
		expect(deathProbabilityPerYear(80)).toBeGreaterThan(deathProbabilityPerYear(70));
	});

	describe('je Tick', () => {
		it('ergibt über ein Jahr wieder das Jahresrisiko', () => {
			// Der Kern der Umrechnung: 48 Ticks überlebt heißt ein Jahr überlebt.
			for (const alter of [45, 60, 70, 85]) {
				const proTick: number = deathProbabilityPerTick(alter);
				const ueberlebt: number = Math.pow(1 - proTick, TICKS_PER_YEAR);

				expect(1 - ueberlebt).toBeCloseTo(deathProbabilityPerYear(alter), 10);
			}
		});

		it('ist deutlich kleiner als das Jahresrisiko geteilt durch nichts', () => {
			expect(deathProbabilityPerTick(70)).toBeLessThan(deathProbabilityPerYear(70));
		});

		it('bleibt für die Jugend bei null', () => {
			expect(deathProbabilityPerTick(20)).toBe(0);
		});
	});

	describe('der Wurf', () => {
		it('verschont die Jugend auch beim schlechtesten Wurf', () => {
			expect(diesThisTick(20, 0)).toBe(false);
		});

		it('trifft den Greis beim schlechtesten Wurf', () => {
			expect(diesThisTick(90, 0)).toBe(true);
		});

		it('verschont jeden beim besten Wurf', () => {
			expect(diesThisTick(90, 0.999999)).toBe(false);
		});
	});

	/**
	 * Kein Test einer Formel, sondern der Balancing-Nachweis: Die Kurve soll ein
	 * mittleres Sterbealter um 70 ergeben. Ändert jemand die Konstanten, fällt hier auf,
	 * was das für die Generationenfolge bedeutet.
	 */
	describe('Lebenserwartung', () => {
		function ueberlebendeAnteile(): Map<number, number> {
			const anteile = new Map<number, number>();
			let lebend = 1;
			for (let alter = 0; alter <= 120; alter++) {
				anteile.set(alter, lebend);
				lebend *= 1 - deathProbabilityPerYear(alter);
			}
			return anteile;
		}

		it('bringt die Hälfte über die siebzig hinweg — knapp', () => {
			const anteile = ueberlebendeAnteile();

			expect(anteile.get(40)).toBe(1);
			expect(anteile.get(70)!).toBeGreaterThan(0.4);
			expect(anteile.get(70)!).toBeLessThan(0.6);
		});

		it('lässt einzelne sehr alt werden', () => {
			const anteile = ueberlebendeAnteile();

			// Ein Greis unter dreißig ist selten genug, um bemerkenswert zu sein, und
			// häufig genug, um vorzukommen.
			expect(anteile.get(90)!).toBeGreaterThan(0.005);
			expect(anteile.get(90)!).toBeLessThan(0.1);
		});
	});
});
