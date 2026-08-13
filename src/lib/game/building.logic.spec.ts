import { describe, expect, it } from 'vitest';
import {
	CONDITION_MAX,
	currentCondition,
	isRuin,
	outputFactor,
	purchase,
	renovate,
	RENOVATION_ACTION_POINT_COST,
	RENOVATION_COST_PER_POINT,
	residentsAt,
	upgrade,
	UPGRADE_ACTION_POINT_COST,
	wageAt,
	YEARS_TO_RUIN
} from '$lib/game/building.logic';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import { yearsToTicks } from '$lib/game/time';

const WOHNHAUS: BuildingTemplate = {
	optionId: 1,
	initialName: 'Wohnhaus',
	description: 'Ein einfaches Wohnhaus',
	type: 'RESIDENCE',
	limited: false,
	limitedTo: 0,
	actions: [],
	levels: [
		{ price: 100, name: 'Kate', residents: 4 },
		{ price: 150, name: 'Haus', residents: 6 },
		{ price: 400, name: 'Großhaus', residents: 9 }
	]
};

const SCHMIEDE: BuildingTemplate = {
	...WOHNHAUS,
	optionId: 2,
	type: 'CRAFT',
	actions: ['WORK'],
	levels: [
		{ price: 250, name: 'Schmiede', wagePerActionPoint: 3 },
		{ price: 400, name: 'Werkstatt', wagePerActionPoint: 5 }
	]
};

const REICH = { actionPoints: 48, money: 10_000, buildingSkill: 0 };

describe('Gebäude', () => {
	describe('der Verfall', () => {
		it('rührt sich nicht ohne verstrichene Zeit', () => {
			expect(currentCondition(100, 500, 500)).toBe(100);
		});

		it('trifft nach der vorgesehenen Zeit genau die Ruine', () => {
			const spaeter: number = yearsToTicks(YEARS_TO_RUIN);

			expect(currentCondition(CONDITION_MAX, 0, spaeter)).toBe(0);
			expect(isRuin(currentCondition(CONDITION_MAX, 0, spaeter))).toBe(true);
		});

		it('steht nach der Hälfte der Zeit bei der Hälfte', () => {
			const halb: number = yearsToTicks(YEARS_TO_RUIN / 2);

			expect(currentCondition(CONDITION_MAX, 0, halb)).toBeCloseTo(50, 8);
		});

		/**
		 * Wie beim Verfall der Zuneigung: Wer oft nachsieht, darf nichts anderes
		 * vorfinden. Linear heißt hier zusätzlich, dass es ein Ende gibt — eine Kurve,
		 * die sich der Null nur nähert, gäbe nie Bauland zurück.
		 */
		it('ergibt über viele Schritte dasselbe wie über einen', () => {
			const gesamt: number = yearsToTicks(7);
			const inEinem: number = currentCondition(CONDITION_MAX, 0, gesamt);

			let schrittweise = CONDITION_MAX;
			for (let i = 0; i < gesamt; i++) {
				schrittweise = currentCondition(schrittweise, 0, 1);
			}

			expect(schrittweise).toBeCloseTo(inEinem, 8);
		});

		it('fällt nicht unter null', () => {
			expect(currentCondition(10, 0, yearsToTicks(100))).toBe(0);
		});
	});

	describe('was der Zustand bewirkt', () => {
		it('mindert den Lohn linear', () => {
			expect(wageAt(SCHMIEDE, 1, 100)).toBe(3);
			expect(wageAt(SCHMIEDE, 1, 50)).toBe(1);
			expect(outputFactor(50)).toBe(0.5);
		});

		it('lässt eine Schicht nie ganz umsonst sein', () => {
			// Ein Aktionspunkt, der nichts einbringt, wäre ein Verlust ohne Ansage.
			expect(wageAt(SCHMIEDE, 1, 1)).toBe(1);
		});

		it('macht aus einem Wohnhaus keinen Arbeitsplatz', () => {
			expect(wageAt(WOHNHAUS, 1, 100)).toBe(0);
		});

		it('lässt den Wohnraum unberührt', () => {
			// Ein verfallenes Haus wärmt schlecht — aber es hat dieselbe Zahl Betten.
			expect(residentsAt(WOHNHAUS, 1)).toBe(4);
			expect(residentsAt(WOHNHAUS, 3)).toBe(9);
			expect(residentsAt(SCHMIEDE, 1)).toBe(0);
		});
	});

	describe('renovieren', () => {
		it('bringt auf Anfang und kostet nach dem, was fehlt', () => {
			const ergebnis = renovate(REICH, 60);

			expect(ergebnis).toMatchObject({
				ok: true,
				condition: CONDITION_MAX,
				spent: 40 * RENOVATION_COST_PER_POINT,
				actionPoints: 48 - RENOVATION_ACTION_POINT_COST
			});
		});

		it('lohnt sich früh: wer wartet, zahlt mehr', () => {
			const frueh = renovate(REICH, 90);
			const spaet = renovate(REICH, 20);

			expect(frueh.ok && spaet.ok && frueh.spent < spaet.spent).toBe(true);
		});

		it('wird billiger, wer bauen kann', () => {
			const ungelernt = renovate(REICH, 50);
			const meister = renovate({ ...REICH, buildingSkill: 10 }, 50);

			// Halber Preis bei voller Meisterschaft — mehr nicht, sonst wäre es umsonst.
			expect(ungelernt.ok && meister.ok && meister.spent).toBe(
				ungelernt.ok ? ungelernt.spent / 2 : 0
			);
		});

		it('weist ein Haus in bestem Zustand ab', () => {
			expect(renovate(REICH, CONDITION_MAX)).toEqual({ ok: false, reason: 'NOTHING_TO_DO' });
		});

		it('scheitert an Kraft und Geld', () => {
			expect(renovate({ actionPoints: 1, money: 10_000, buildingSkill: 0 }, 50)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_ACTION_POINTS'
			});
			expect(renovate({ actionPoints: 48, money: 5, buildingSkill: 0 }, 50)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
		});
	});

	describe('ausbauen', () => {
		it('hebt die Stufe und kostet den Preis der neuen', () => {
			const ergebnis = upgrade(REICH, WOHNHAUS, 1);

			expect(ergebnis).toMatchObject({
				ok: true,
				level: 2,
				spent: 150,
				actionPoints: 48 - UPGRADE_ACTION_POINT_COST
			});
		});

		it('endet bei der höchsten Stufe', () => {
			expect(upgrade(REICH, WOHNHAUS, 3)).toEqual({ ok: false, reason: 'MAX_LEVEL' });
			expect(upgrade(REICH, SCHMIEDE, 2)).toEqual({ ok: false, reason: 'MAX_LEVEL' });
		});

		it('scheitert am Geld', () => {
			expect(upgrade({ actionPoints: 48, money: 10 }, WOHNHAUS, 1)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
		});
	});

	describe('kaufen', () => {
		it('geht, wenn ein Preis dranhängt und das Geld reicht', () => {
			const ergebnis = purchase(
				{ id: 'ich', money: 500 },
				{ ownerId: 'jemand', forSalePrice: 300 }
			);

			expect(ergebnis).toEqual({ ok: true, buyerMoney: 200, price: 300 });
		});

		it('geht nicht ohne Preisschild', () => {
			expect(
				purchase({ id: 'ich', money: 500 }, { ownerId: 'jemand', forSalePrice: null })
			).toEqual({ ok: false, reason: 'NOT_FOR_SALE' });
		});

		it('lässt niemanden von sich selbst kaufen', () => {
			expect(purchase({ id: 'ich', money: 500 }, { ownerId: 'ich', forSalePrice: 300 })).toEqual({
				ok: false,
				reason: 'ALREADY_OWNED'
			});
		});
	});
});
