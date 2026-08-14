import { describe, expect, it } from 'vitest';
import {
	type CityState,
	decideMayorAction,
	nextTithe,
	TAX_RAISE_STEP,
	treasuryReserve,
	TREASURY_RESERVE_FACTOR
} from '$lib/game/governance.logic';
import { LAW_RULES } from '$lib/game/law.logic';
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
		guardhouseUnpaid: false,
		repairNeeded: false,
		repairCost: 40,
		missingBuildingPrice: null,
		landExhausted: false,
		developmentCost: ERSCHLIESSUNG,
		tithe: LAW_RULES.TITHE.fallback,
		...werte
	};
}

describe('Was ein Bürgermeister tut', () => {
	describe('die Rangfolge', () => {
		it('lässt die ruhige Stadt in Ruhe', () => {
			expect(decideMayorAction(ruhig())).toBe('NOTHING');
		});

		it('bezahlt zuerst die Wache', () => {
			// Ein Wachhaus ohne Sold ist ein leeres Haus, und Raubzüge kosten mehr als der
			// Sold. Kostet nichts außer dem Aushang — deshalb ganz vorn.
			const stadt = ruhig({ guardhouseUnpaid: true, repairNeeded: true });

			expect(decideMayorAction(stadt)).toBe('PAY_GUARD');
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
		it('steigt, wenn die Kasse die Rücklage nicht hergibt', () => {
			const arm = ruhig({ treasury: 0 });

			expect(nextTithe(arm)).toBe(LAW_RULES.TITHE.fallback + TAX_RAISE_STEP);
		});

		it('sinkt, wenn die Stadt hortet', () => {
			// Eine Stadt, die hortet, nimmt ihren Bürgern Geld ab, das sie besser selbst
			// ausgäben.
			const reich = ruhig({ treasury: treasuryReserve(ERSCHLIESSUNG) * 5 });

			expect(nextTithe(reich)).toBe(LAW_RULES.TITHE.fallback - TAX_RAISE_STEP);
		});

		it('bleibt im Mittelfeld, wo sie ist', () => {
			expect(nextTithe(ruhig())).toBeUndefined();
		});

		it('überschreitet die Verfassung nicht', () => {
			// Die Grenzen aus 4.7b gelten auch für einen NPC im Amt.
			const arm = ruhig({ treasury: 0, tithe: LAW_RULES.TITHE.max });
			const reich = ruhig({
				treasury: treasuryReserve(ERSCHLIESSUNG) * 5,
				tithe: LAW_RULES.TITHE.min
			});

			expect(nextTithe(arm)).toBeUndefined();
			expect(nextTithe(reich)).toBeUndefined();
		});
	});

	describe('die Rücklage', () => {
		it('wächst mit den Preisen statt eine Konstante zu sein', () => {
			expect(treasuryReserve(60)).toBe(60 * TREASURY_RESERVE_FACTOR);
			expect(treasuryReserve(120)).toBeGreaterThan(treasuryReserve(60));
		});
	});
});
