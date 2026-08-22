import { describe, expect, it } from 'vitest';
import { seededRoll } from '$lib/game/testRoll';

/**
 * Der wiederholbare Würfel (Punkt 54).
 *
 * Er muss zweierlei können: bei gleichem Startwert dasselbe liefern — sonst nützt er den
 * Tests nichts — und trotzdem streuen, sonst wären alle Gründer einer Welt gleich.
 */
describe('Ein Würfel, der sich wiederholen lässt', () => {
	it('gibt bei gleichem Startwert dieselbe Folge', () => {
		const erster = seededRoll(42);
		const zweiter = seededRoll(42);

		const eine = [erster(), erster(), erster()];
		const andere = [zweiter(), zweiter(), zweiter()];

		expect(eine).toEqual(andere);
	});

	it('gibt bei anderem Startwert eine andere Folge', () => {
		expect(seededRoll(1)()).not.toBe(seededRoll(2)());
	});

	it('bleibt zwischen null und eins', () => {
		const wuerfel = seededRoll(7);
		for (let i = 0; i < 200; i++) {
			const wurf: number = wuerfel();
			expect(wurf).toBeGreaterThanOrEqual(0);
			expect(wurf).toBeLessThan(1);
		}
	});

	it('streut, statt auf einem Wert zu stehen', () => {
		// Ohne Streuung wären alle Gründer gleich — und eine Welt ohne Unterschiede ist
		// keine Probe für ein Spiel, das von Unterschieden lebt.
		const wuerfel = seededRoll(3);
		const werte = Array.from({ length: 100 }, () => wuerfel());
		const unten: number = werte.filter((w) => w < 0.5).length;

		expect(unten).toBeGreaterThan(25);
		expect(unten).toBeLessThan(75);
	});
});
