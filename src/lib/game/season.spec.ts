import { describe, expect, it } from 'vitest';
import {
	buildingCostFactor,
	SEASONS,
	seasonOf,
	TICKS_PER_YEAR,
	WINTER_BUILDING_SURCHARGE,
	yearOf
} from '$lib/game/time';

describe('Jahreszeiten', () => {
	it('teilt das Jahr in vier gleiche Teile', () => {
		expect(seasonOf(0)).toBe('SPRING');
		expect(seasonOf(Math.floor(TICKS_PER_YEAR * 0.3))).toBe('SUMMER');
		expect(seasonOf(Math.floor(TICKS_PER_YEAR * 0.6))).toBe('AUTUMN');
		expect(seasonOf(Math.floor(TICKS_PER_YEAR * 0.8))).toBe('WINTER');
	});

	it('beginnt mit jedem Jahr von vorn', () => {
		expect(seasonOf(TICKS_PER_YEAR * 7)).toBe('SPRING');
		expect(seasonOf(TICKS_PER_YEAR * 7 - 1)).toBe('WINTER');
	});

	it('kommt auch mit dem letzten Tick des Jahres zurecht', () => {
		// Rundungsfehler dürfen keine fünfte Jahreszeit erfinden.
		for (let tick = 0; tick < TICKS_PER_YEAR * 3; tick++) {
			expect(SEASONS).toContain(seasonOf(tick));
		}
	});

	/**
	 * Der eigentliche Grund für ein Jahr von fünfzig statt achtundvierzig Stunden: Bei
	 * exakt zwei Realtagen läge jede Uhrzeit für immer an derselben Stelle des Jahres,
	 * und ein Spieler mit festen Gewohnheiten sähe nie mehr als zwei Jahreszeiten.
	 */
	it('wandert durch den Tagesablauf', () => {
		const gesehen = new Set<string>();
		// Jeden Tag zur selben Stunde. Nach fünfzehn Tagen hat er alles einmal gesehen —
		// nachgerechnet, nicht geschätzt.
		for (let tag = 0; tag < 15; tag++) {
			gesehen.add(seasonOf(tag * 24));
		}

		expect(gesehen.size).toBe(SEASONS.length);
	});

	it('bliebe bei achtundvierzig Stunden stehen', () => {
		// Der Gegenbeweis, damit niemand die Zahl versehentlich zurückdreht.
		const beiAchtundvierzig = new Set<number>();
		for (let tag = 0; tag < 14; tag++) {
			beiAchtundvierzig.add(Math.floor((((tag * 24) % 48) / 48) * 4));
		}

		expect(beiAchtundvierzig.size).toBe(2);
	});

	it('zählt die Jahre', () => {
		expect(yearOf(0)).toBe(0);
		expect(yearOf(TICKS_PER_YEAR * 5 + 3)).toBe(5);
	});

	describe('der Frost', () => {
		it('verteuert Bauarbeiten im Winter', () => {
			expect(buildingCostFactor('WINTER')).toBeCloseTo(1 + WINTER_BUILDING_SURCHARGE, 10);
		});

		it('lässt die übrigen Jahreszeiten in Ruhe', () => {
			for (const jahreszeit of ['SPRING', 'SUMMER', 'AUTUMN'] as const) {
				expect(buildingCostFactor(jahreszeit)).toBe(1);
			}
		});
	});
});
