import { describe, expect, it } from 'vitest';
import { planWorldAdvance, regrownActionPoints } from '$lib/game/tick.logic';
import { MAX_ACTION_POINTS, MS_PER_TICK, TICKS_PER_YEAR } from '$lib/game/time';

const ANKER = new Date('2026-08-12T12:00:00Z');

function spaeter(ms: number): Date {
	return new Date(ANKER.getTime() + ms);
}

describe('Weltuhr weiterstellen', () => {
	it('rührt sich nicht vor dem ersten vollen Tick', () => {
		expect(planWorldAdvance(ANKER, spaeter(MS_PER_TICK - 1))).toBeNull();
		expect(planWorldAdvance(ANKER, ANKER)).toBeNull();
	});

	it('stellt einen Tick vor, ohne etwas zu verpassen', () => {
		const plan = planWorldAdvance(ANKER, spaeter(MS_PER_TICK));

		expect(plan).toEqual({ ticks: 1, missed: 0, lastTickAt: spaeter(MS_PER_TICK) });
	});

	it('zählt alles über den ersten Tick hinaus als verpasst', () => {
		// Drei Tage aus: 72 Ticks fällig, 71 davon hat niemand erlebt.
		const plan = planWorldAdvance(ANKER, spaeter(72 * MS_PER_TICK));

		expect(plan?.ticks).toBe(72);
		expect(plan?.missed).toBe(71);
	});

	it('verschiebt den Ankerpunkt um volle Ticks, nicht auf jetzt', () => {
		// Sonst ginge der angebrochene Rest bei jedem Durchlauf verloren und die Weltzeit
		// bliebe langsam hinter der Echtzeit zurück.
		const plan = planWorldAdvance(ANKER, spaeter(MS_PER_TICK + 59 * 60 * 1000));

		expect(plan?.ticks).toBe(1);
		expect(plan?.lastTickAt).toEqual(spaeter(MS_PER_TICK));
	});

	it('verliert über viele Durchläufe keine Zeit', () => {
		// Alle 40 Minuten nachsehen, 24 Stunden lang: Am Ende müssen 24 Ticks stehen.
		let anker = ANKER;
		let ticks = 0;
		for (let minute = 40; minute <= 24 * 60; minute += 40) {
			const plan = planWorldAdvance(anker, spaeter(minute * 60 * 1000));
			if (plan) {
				ticks += plan.ticks;
				anker = plan.lastTickAt;
			}
		}

		expect(ticks).toBe(24);
	});

	it('geht nicht rückwärts, wenn die Uhr des Rechners springt', () => {
		expect(planWorldAdvance(ANKER, spaeter(-5 * MS_PER_TICK))).toBeNull();
	});
});

describe('Nachwachsende Aktionspunkte', () => {
	it('gibt einen Punkt je verstrichenem Tick', () => {
		expect(regrownActionPoints(10, 100, 105)).toBe(15);
	});

	it('deckelt beim Vorrat zweier Tage', () => {
		expect(regrownActionPoints(10, 100, 100 + 10 * TICKS_PER_YEAR)).toBe(MAX_ACTION_POINTS);
	});

	it('lässt einen vollen Vorrat voll', () => {
		expect(regrownActionPoints(MAX_ACTION_POINTS, 100, 148)).toBe(MAX_ACTION_POINTS);
	});

	it('nimmt nichts weg, wenn nichts verstrichen ist', () => {
		expect(regrownActionPoints(7, 100, 100)).toBe(7);
	});

	it('nimmt nichts weg, wenn der letzte Stand in der Zukunft liegt', () => {
		expect(regrownActionPoints(7, 120, 100)).toBe(7);
	});
});
