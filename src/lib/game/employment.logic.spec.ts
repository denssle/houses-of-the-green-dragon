import { describe, expect, it } from 'vitest';
import { canTakeJob, isWorthTaking, positionsAt, workShift } from '$lib/game/employment.logic';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';

const BAECKEREI: BuildingTemplate = {
	optionId: 5,
	initialName: 'Bäckerei',
	description: 'Backt aus Mehl Brot.',
	type: 'CRAFT',
	limited: false,
	limitedTo: 0,
	actions: [],
	skill: 'BAKING',
	recipe: {
		input: [{ itemId: 'FLOUR', quantity: 2 }],
		outputItemId: 'BREAD',
		baseOutput: 3,
		actionPointCost: 1,
		skill: 'BAKING'
	},
	levels: [
		{ price: 220, name: 'Backhaus' },
		{ price: 400, name: 'Bäckerei' }
	]
};

const WOHNHAUS: BuildingTemplate = {
	...BAECKEREI,
	optionId: 1,
	type: 'RESIDENCE',
	recipe: undefined,
	levels: [{ price: 100, name: 'Kate', residents: 4 }]
};

const ERWACHSEN = { id: 'ich', isAdult: true, hasJob: false };
const STELLE = { ownerId: 'chef', wage: 5, positions: 1, taken: 0 };

describe('Anstellung', () => {
	describe('wie viele Stellen es gibt', () => {
		it('wächst mit der Ausbaustufe', () => {
			expect(positionsAt(BAECKEREI, 1)).toBe(1);
			expect(positionsAt(BAECKEREI, 2)).toBe(2);
		});

		it('gibt es in einem Wohnhaus nicht', () => {
			expect(positionsAt(WOHNHAUS, 1)).toBe(0);
		});
	});

	describe('eine Stelle antreten', () => {
		it('geht bei offenem Aushang', () => {
			expect(canTakeJob(ERWACHSEN, STELLE)).toEqual({ ok: true });
		});

		it('geht nicht ohne Aushang', () => {
			expect(canTakeJob(ERWACHSEN, { ...STELLE, wage: null })).toEqual({
				ok: false,
				reason: 'NO_JOB_OFFERED'
			});
		});

		it('lässt niemanden bei sich selbst anfangen', () => {
			expect(canTakeJob({ ...ERWACHSEN, id: 'chef' }, STELLE)).toEqual({
				ok: false,
				reason: 'ALREADY_OWNED'
			});
		});

		it('weist Kinder ab', () => {
			expect(canTakeJob({ ...ERWACHSEN, isAdult: false }, STELLE)).toEqual({
				ok: false,
				reason: 'TOO_YOUNG'
			});
		});

		it('lässt niemanden zwei Stellen haben', () => {
			expect(canTakeJob({ ...ERWACHSEN, hasJob: true }, STELLE)).toEqual({
				ok: false,
				reason: 'ALREADY_EMPLOYED'
			});
		});

		it('weist ab, wenn der Betrieb voll ist', () => {
			expect(canTakeJob(ERWACHSEN, { ...STELLE, taken: 1 })).toEqual({
				ok: false,
				reason: 'NO_ROOM'
			});
		});
	});

	describe('eine Schicht', () => {
		it('zahlt Lohn aus der Kasse des Arbeitgebers', () => {
			const ergebnis = workShift({ actionPoints: 10, money: 0 }, { money: 100 }, 5, 1, 3);

			expect(ergebnis).toEqual({
				ok: true,
				wage: 5,
				employeeMoney: 5,
				employerMoney: 95,
				produced: 3
			});
		});

		/**
		 * Der Kern des Ganzen: Bis hierher entstand Lohn aus dem Nichts. Ein privater
		 * Betrieb kann nur zahlen, was er hat.
		 */
		it('findet nicht statt, wenn die Kasse leer ist', () => {
			expect(workShift({ actionPoints: 10, money: 0 }, { money: 2 }, 5, 1, 3)).toEqual({
				ok: false,
				reason: 'EMPLOYER_BROKE'
			});
		});

		it('prüft die leere Kasse, bevor Punkte verbraucht sind', () => {
			// Ein Angestellter, der umsonst arbeitet, weil die Kasse leer war, hätte seinen
			// Tag verloren, ohne es vorher wissen zu können.
			const ergebnis = workShift({ actionPoints: 10, money: 0 }, { money: 0 }, 5, 1, 3);

			expect(ergebnis.ok).toBe(false);
		});

		it('scheitert ohne Kraft', () => {
			expect(workShift({ actionPoints: 0, money: 0 }, { money: 100 }, 5, 1, 3)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_ACTION_POINTS'
			});
		});
	});

	describe('ob sich die Stelle lohnt', () => {
		it('vergleicht mit der Tagelöhnerei', () => {
			expect(isWorthTaking(5, 3)).toBe(true);
			expect(isWorthTaking(3, 3)).toBe(false);
		});
	});
});
