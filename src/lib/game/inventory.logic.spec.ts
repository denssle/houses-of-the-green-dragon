import { describe, expect, it } from 'vitest';
import { CARRIED_CAPACITY, inventoryCapacity, fitsInInventory } from '$lib/game/inventory.logic';

describe('Das Inventar', () => {
	describe('wie viel hineingeht', () => {
		it('ist auch ohne Dach nicht null', () => {
			// Wer nichts tragen könnte, könnte kein Brot kaufen — Obdachlosigkeit ist eine
			// Notlage und keine Sackgasse.
			expect(inventoryCapacity(0)).toBe(CARRIED_CAPACITY);
		});

		it('wächst mit dem, was das Dach hergibt', () => {
			expect(inventoryCapacity(40)).toBe(CARRIED_CAPACITY + 40);
		});

		it('nimmt einem ein verfallenes Haus nichts weg', () => {
			// `storageAt` kann auf 0 fallen; am Leib getragen wird trotzdem, was man trägt.
			expect(inventoryCapacity(-5)).toBe(CARRIED_CAPACITY);
		});
	});

	describe('ob etwas hineinpasst', () => {
		it('lässt zu, was gerade noch geht', () => {
			expect(fitsInInventory(35, 40, 5)).toBe(true);
		});

		it('weist ab, was darüber ginge', () => {
			expect(fitsInInventory(35, 40, 6)).toBe(false);
		});

		/**
		 * **Wer schon darüber liegt, verliert nichts.** Ein Umzug in eine kleinere Bleibe
		 * und ein verfallendes Dach führen genau dorthin — eine Grenze, die Bestände
		 * wegwirft, wäre eine Strafe für etwas, das niemand entschieden hat.
		 */
		it('nimmt nichts mehr auf, wenn man schon darüber liegt', () => {
			expect(fitsInInventory(60, 40, 1)).toBe(false);
		});

		it('lässt Herausnehmen immer zu', () => {
			expect(fitsInInventory(60, 40, -1)).toBe(true);
			expect(fitsInInventory(60, 40, 0)).toBe(true);
		});
	});
});
