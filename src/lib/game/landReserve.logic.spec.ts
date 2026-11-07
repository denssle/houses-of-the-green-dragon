import { describe, expect, it } from 'vitest';
import { LAND_RESERVE_YEARS, landReserve } from '$lib/game/law.logic';

describe('landReserve (0.8.2)', () => {
	it('verlangt drei Jahre Steuer auf alles, was einem danach gehört', () => {
		expect(LAND_RESERVE_YEARS).toBe(3);
		expect(landReserve(19, 5, 40)).toBe(3 * 19 * 5);
	});

	it('und ohne Steuer wenigstens den Preis eines zweiten Grundstücks', () => {
		expect(landReserve(0, 3, 40)).toBe(40);
		expect(landReserve(2, 1, 40)).toBe(40);
	});
});
