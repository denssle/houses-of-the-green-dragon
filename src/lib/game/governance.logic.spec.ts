import { describe, expect, it } from 'vitest';
import {
	type CityState,
	decideMayorAction,
	nextTaxChange,
	TAX_RAISE_STEP,
	TAX_RAISE_STEP_COIN,
	taxStep,
	treasuryReserve,
	TREASURY_RESERVE_FACTOR
} from '$lib/game/governance.logic';
import { LAW_RULES } from '$lib/game/law.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';
import { PERSONALITY_AXES, type Personality } from '$lib/game/personality.logic';

function anlagen(): Personality {
	const voll = {} as Personality;
	for (const achse of PERSONALITY_AXES) voll[achse] = 0;
	return voll;
}

const ERSCHLIESSUNG = 60;

/** Eine Stadt, in der alles in Ordnung ist — ihr Bürgermeister hat nichts zu tun. */
function ruhig(werte: Partial<CityState> = {}): CityState {
	return {
		personality: anlagen(),
		treasury: treasuryReserve(ERSCHLIESSUNG) * 2,
		unstaffedWorkplace: false,
		repairNeeded: false,
		repairCost: 40,
		missingBuildingPrice: null,
		landExhausted: false,
		developmentCost: ERSCHLIESSUNG,
		rates: { PROPERTY_TAX: LAW_RULES.PROPERTY_TAX.fallback, TITHE: LAW_RULES.TITHE.fallback },
		// Elf Grundstücke in Bürgerhand und eine Pacht — die Lage im Messlauf nach vierzig
		// Spieljahren.
		taxBase: { PROPERTY_TAX: 11, TITHE: 1 },
		// Nie etwas erlassen: Der Rückfallwert gilt seit Anbeginn, jede Frist ist abgelaufen.
		rateAgeInTicks: { PROPERTY_TAX: Infinity, TITHE: Infinity },
		...werte
	};
}

describe('Was ein Bürgermeister tut', () => {
	describe('die Rangfolge', () => {
		it('lässt die ruhige Stadt in Ruhe', () => {
			expect(decideMayorAction(ruhig())).toBe('NOTHING');
		});

		it('besetzt zuerst die Stellen der Stadt', () => {
			// Ein Wachhaus ohne Sold ist ein leeres Haus, eine Schmiede ohne Schmied stellt
			// nichts her. Kostet nichts außer dem Aushang — deshalb ganz vorn.
			const stadt = ruhig({ unstaffedWorkplace: true, repairNeeded: true });

			expect(decideMayorAction(stadt)).toBe('PAY_WAGE');
		});

		it('erhält, bevor es baut', () => {
			// Herrichten ist billiger als neu bauen, und der Verfall frisst still.
			const stadt = ruhig({ repairNeeded: true, missingBuildingPrice: 300 });

			expect(decideMayorAction(stadt)).toBe('REPAIR');
		});

		it('baut, was fehlt — wenn die Rücklage bleibt', () => {
			const genug = ruhig({
				missingBuildingPrice: 300,
				treasury: 300 + treasuryReserve(ERSCHLIESSUNG)
			});
			const knapp = ruhig({
				missingBuildingPrice: 300,
				treasury: 300 + treasuryReserve(ERSCHLIESSUNG) - 1
			});

			expect(decideMayorAction(genug)).toBe('BUILD_PUBLIC');
			// Löhne und Instandhaltung laufen weiter — eine Stadt, die alles verbaut, kann
			// ihre Wache nächste Woche nicht bezahlen.
			expect(decideMayorAction(knapp)).not.toBe('BUILD_PUBLIC');
		});

		it('weist Land aus, wenn keines mehr frei ist', () => {
			const stadt = ruhig({ landExhausted: true });

			expect(decideMayorAction(stadt)).toBe('DEVELOP_LAND');
		});

		it('dreht zuletzt an der Steuer', () => {
			// Sie trifft andere: Wer sie anhebt, nimmt seinen Wählern etwas weg — und wird
			// daran gemessen.
			const arm = ruhig({ treasury: 0, landExhausted: true });

			expect(decideMayorAction(arm)).toBe('SET_TAX');
		});
	});

	describe('die Steuer', () => {
		/**
		 * **An der Steuer, die trägt** (5.71, Punkt 96).
		 *
		 * Bis hierher gab es nur eine, an der ein NPC drehen durfte: den Zehnt. Der greift
		 * auf die Ernte einer Pacht, und in vierzig gemessenen Spieljahren gab es davon
		 * eine — die Kasse stand durchgehend auf null, während das Amt in fast jedem Tick
		 * die Steuern erhöhte. Gewählt wird deshalb nach der Bemessungsgrundlage.
		 */
		it('greift zur Grundsteuer, wo Grundbesitz ist', () => {
			const arm = ruhig({ treasury: 0 });

			expect(nextTaxChange(arm)).toEqual({
				kind: 'PROPERTY_TAX',
				value: LAW_RULES.PROPERTY_TAX.fallback + TAX_RAISE_STEP_COIN
			});
		});

		it('und zum Zehnt, wo nur gepachtet wird', () => {
			const arm = ruhig({ treasury: 0, taxBase: { PROPERTY_TAX: 0, TITHE: 2 } });

			expect(nextTaxChange(arm)).toEqual({
				kind: 'TITHE',
				value: LAW_RULES.TITHE.fallback + TAX_RAISE_STEP
			});
		});

		it('rührt keine an, die niemanden erreicht', () => {
			// Sie brächte nichts ein und ärgerte trotzdem jemanden, sobald es ihn gibt.
			const leer = ruhig({ treasury: 0, taxBase: { PROPERTY_TAX: 0, TITHE: 0 } });

			expect(nextTaxChange(leer)).toBeUndefined();
			expect(decideMayorAction(leer)).toBe('NOTHING');
		});

		it('senkt, wenn die Stadt hortet — dieselbe, die sie erhebt', () => {
			// Eine Stadt, die hortet, nimmt ihren Bürgern Geld ab, das sie besser selbst
			// ausgäben. Und entlastet wird zuerst, wer sie trägt.
			const reich = ruhig({
				treasury: treasuryReserve(ERSCHLIESSUNG) * 5,
				rates: { PROPERTY_TAX: 4, TITHE: LAW_RULES.TITHE.fallback }
			});

			expect(nextTaxChange(reich)).toEqual({
				kind: 'PROPERTY_TAX',
				value: 4 - TAX_RAISE_STEP_COIN
			});
		});

		it('bleibt im Mittelfeld, wo sie ist', () => {
			expect(nextTaxChange(ruhig())).toBeUndefined();
		});

		it('überschreitet die Verfassung nicht', () => {
			// Die Grenzen aus 4.7b gelten auch für einen NPC im Amt.
			const arm = ruhig({
				treasury: 0,
				rates: { PROPERTY_TAX: LAW_RULES.PROPERTY_TAX.max, TITHE: LAW_RULES.TITHE.max },
				taxBase: { PROPERTY_TAX: 11, TITHE: 1 }
			});
			const reich = ruhig({
				treasury: treasuryReserve(ERSCHLIESSUNG) * 5,
				rates: { PROPERTY_TAX: LAW_RULES.PROPERTY_TAX.min, TITHE: LAW_RULES.TITHE.min }
			});

			expect(nextTaxChange(arm)).toBeUndefined();
			expect(nextTaxChange(reich)).toBeUndefined();
		});

		it('weicht auf die nächste aus, wenn eine am Anschlag steht', () => {
			// Sonst stünde eine Stadt mit ausgereizter Grundsteuer da, obwohl der Zehnt noch
			// Luft hat.
			const arm = ruhig({
				treasury: 0,
				rates: { PROPERTY_TAX: LAW_RULES.PROPERTY_TAX.max, TITHE: LAW_RULES.TITHE.fallback }
			});

			expect(nextTaxChange(arm)).toEqual({
				kind: 'TITHE',
				value: LAW_RULES.TITHE.fallback + TAX_RAISE_STEP
			});
		});

		/**
		 * **Der Fehler, den erst der Testlauf zeigte** (Punkt 96). Ohne diese Frist erhöhte
		 * das Amt die Grundsteuer stündlich, obwohl sie jährlich eingezogen wird — zwanzig
		 * Erhöhungen, ehe die erste Münze daraus ankam, und in `worldComesAlive` verhungerte
		 * darüber jemand.
		 */
		it('dreht nicht wieder, ehe die letzte Änderung gewirkt hat', () => {
			const frisch = ruhig({
				treasury: 0,
				rateAgeInTicks: { PROPERTY_TAX: TICKS_PER_YEAR - 1, TITHE: Infinity }
			});

			// Nicht die Grundsteuer — die wurde eben erst geändert. Der Zehnt greift bei
			// jeder Ernte und darf deshalb sofort wieder angefasst werden.
			expect(nextTaxChange(frisch)).toEqual({
				kind: 'TITHE',
				value: LAW_RULES.TITHE.fallback + TAX_RAISE_STEP
			});
		});

		it('wartet ein Spieljahr ab, wenn nur die Grundsteuer trägt', () => {
			const frisch = ruhig({
				treasury: 0,
				taxBase: { PROPERTY_TAX: 11, TITHE: 0 },
				rateAgeInTicks: { PROPERTY_TAX: TICKS_PER_YEAR - 1, TITHE: Infinity }
			});

			expect(nextTaxChange(frisch)).toBeUndefined();
			expect(decideMayorAction(frisch)).toBe('NOTHING');
		});

		it('springt in Münzen anders als in Anteilen', () => {
			// Fünf Prozent mehr Zehnt sind ein Schritt, fünf Münzen mehr Grundsteuer ein
			// Vermögen: Ein Grundstück kostet vierzig.
			expect(taxStep('PROPERTY_TAX')).toBe(TAX_RAISE_STEP_COIN);
			expect(taxStep('TITHE')).toBe(TAX_RAISE_STEP);
		});
	});

	describe('die Rücklage', () => {
		it('wächst mit den Preisen statt eine Konstante zu sein', () => {
			expect(treasuryReserve(60)).toBe(60 * TREASURY_RESERVE_FACTOR);
			expect(treasuryReserve(120)).toBeGreaterThan(treasuryReserve(60));
		});
	});
});
