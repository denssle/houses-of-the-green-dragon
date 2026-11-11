import { describe, expect, it } from 'vitest';
import { ALMOSEN_UNTER, almsBudget, needsAlms } from '$lib/game/alms.logic';

describe('Armenspeisung (0.11.0)', () => {
	const arm = { satiety: ALMOSEN_UNTER - 1, hatEssen: false, geld: 0 };

	it('speist, wer hungert, nichts daheim hat und sich kein Brot leisten kann', () => {
		expect(needsAlms(arm, 4)).toBe(true);
	});

	it('aber nicht, wer noch nicht geschwächt ist', () => {
		expect(needsAlms({ ...arm, satiety: ALMOSEN_UNTER }, 4)).toBe(false);
	});

	it('nicht, wer Brot daheim hat', () => {
		expect(needsAlms({ ...arm, hatEssen: true }, 4)).toBe(false);
	});

	it('und nicht, wer es sich kaufen kann — sein Geld gehört dem Bäcker', () => {
		expect(needsAlms({ ...arm, geld: 4 }, 4)).toBe(false);
		expect(needsAlms({ ...arm, geld: 3 }, 4)).toBe(true);
	});

	it('gibt nur aus, was über der Rücklage liegt', () => {
		expect(almsBudget(1000, 240)).toBe(760);
		expect(almsBudget(100, 240)).toBe(0);
	});
});
