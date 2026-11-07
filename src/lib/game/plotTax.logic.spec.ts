import { describe, expect, it } from 'vitest';
import { GIVE_UP_PLOT_BEFORE_TAX_TICKS, plotTaxDueSoon } from '$lib/game/law.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';

describe('plotTaxDueSoon', () => {
	const termin = 1000 + TICKS_PER_YEAR;

	it('nennt die Schuld nur kurz vor dem Termin', () => {
		const fenster = termin - GIVE_UP_PLOT_BEFORE_TAX_TICKS;

		expect(plotTaxDueSoon(3, 10, 1000, fenster - 1)).toBe(0);
		expect(plotTaxDueSoon(3, 10, 1000, fenster)).toBe(30);
		expect(plotTaxDueSoon(3, 10, 1000, termin)).toBe(30);
	});

	it('kennt keinen Termin, solange nie erhoben wurde', () => {
		expect(plotTaxDueSoon(3, 10, null, termin)).toBe(0);
	});

	it('kennt keine Schuld ohne Steuersatz', () => {
		expect(plotTaxDueSoon(3, 0, 1000, termin)).toBe(0);
	});
});
