import { describe, expect, it } from 'vitest';
import {
	type CityState,
	decideMayorAction,
	GREED_TO_KEEP_STIPEND,
	nextStipendChange,
	nextTaxChange,
	STIPEND_EFFECT_DELAY,
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
		missingBuilding: false,
		publicConstruction: false,
		landExhausted: false,
		developmentRunning: false,
		developmentCost: ERSCHLIESSUNG,
		rates: { PROPERTY_TAX: LAW_RULES.PROPERTY_TAX.fallback, TITHE: LAW_RULES.TITHE.fallback },
		// Elf Grundstücke in Bürgerhand und eine Pacht — die Lage im Messlauf nach vierzig
		// Spieljahren.
		taxBase: { PROPERTY_TAX: 11, TITHE: 1 },
		// Nie etwas erlassen: Der Rückfallwert gilt seit Anbeginn, jede Frist ist abgelaufen.
		rateAgeInTicks: { PROPERTY_TAX: Infinity, TITHE: Infinity },
		stipend: LAW_RULES.OFFICE_STIPEND.fallback,
		stipendAgeInTicks: Infinity,
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
			const stadt = ruhig({ repairNeeded: true, missingBuilding: true });

			expect(decideMayorAction(stadt)).toBe('REPAIR');
		});

		it('baut, was fehlt — auch mit leerer Kasse, denn es kostet nichts mehr', () => {
			// **Die Rücklagenprüfung, die hier stand, ist mit 5.93 gefallen** (Punkt 102).
			// Ein öffentlicher Bau ist seither ein Rohbau: Die Stadt zahlt keinen Preis,
			// sondern Löhne — und ob sie die aufbringt, entscheidet jede einzelne Schicht,
			// nicht der Beschluss.
			expect(decideMayorAction(ruhig({ missingBuilding: true, treasury: 0 }))).toBe('BUILD_PUBLIC');
		});

		it('legt kein zweites Fundament, solange das erste offen ist', () => {
			// Dieselbe Bremse wie bei der Erschließung: Was nichts kostet, hält die Kasse
			// nicht mehr auf. Sonst hätte die Stadt drei angefangene Häuser und kein
			// fertiges.
			const stadt = ruhig({ missingBuilding: true, publicConstruction: true });

			expect(decideMayorAction(stadt)).not.toBe('BUILD_PUBLIC');
		});

		it('weist Land aus, wenn keines mehr frei ist', () => {
			const stadt = ruhig({ landExhausted: true });

			expect(decideMayorAction(stadt)).toBe('DEVELOP_LAND');
		});

		it('weist auch mit leerer Kasse aus — es kostet nichts mehr', () => {
			// **Die Sperre, hinter der Grünau stand** (5.92, Punkte 102 und 93): Die alte
			// Bedingung verlangte 360 Münzen im Voraus, die Kasse hielt 13, und deshalb ist
			// dort seit Tick 5291 kein Grundstück mehr entstanden. Seit die Erschließung
			// Arbeit ist statt eines Preises, fällt der Lohn schichtweise an — und wird
			// schichtweise geprüft.
			expect(decideMayorAction(ruhig({ treasury: 0, landExhausted: true }))).toBe('DEVELOP_LAND');
		});

		it('weist nicht zweimal aus, solange die erste Baustelle offen ist', () => {
			// Die Bremse, die an die Stelle des Preises getreten ist: Sonst hätte die Stadt
			// hundert angefangene Wege statt eines fertigen Grundstücks.
			const stadt = ruhig({ landExhausted: true, developmentRunning: true });

			expect(decideMayorAction(stadt)).not.toBe('DEVELOP_LAND');
		});

		it('spart erst am eigenen Gehalt, dann an der Steuer der anderen', () => {
			// **Der Unterschied zwischen einem Amt und einer Pfründe** (Punkte 93, 96). In
			// Grünau stand die Kasse bei 13 Münzen, während die Entschädigung 50 je
			// Spieljahr kostete — und der Amtsinhaber erhöhte sieben Jahre in Folge die
			// Grundsteuer, weil das der einzige Hebel war, den er hatte.
			// `developmentRunning`, damit nicht die Erschließung dazwischenkommt: Die kostet
			// seit 5.92 nichts und geht deshalb vor — aber nur, solange keine läuft.
			const arm = ruhig({ treasury: 0, landExhausted: true, developmentRunning: true });

			expect(decideMayorAction(arm)).toBe('SET_STIPEND');
			expect(nextStipendChange(arm)?.value).toBe(LAW_RULES.OFFICE_STIPEND.fallback - 1);
		});

		it('dreht zuletzt an der Steuer', () => {
			// Sie trifft andere: Wer sie anhebt, nimmt seinen Wählern etwas weg — und wird
			// daran gemessen. Seit 5.91 kommt sie erst, wenn am eigenen Gehalt nichts mehr
			// zu sparen ist — hier steht es deshalb schon auf null.
			const arm = ruhig({
				treasury: 0,
				landExhausted: true,
				developmentRunning: true,
				stipend: LAW_RULES.OFFICE_STIPEND.min
			});

			expect(decideMayorAction(arm)).toBe('SET_TAX');
		});
	});

	describe('die Aufwandsentschädigung', () => {
		it('bleibt, wenn die Kasse trägt', () => {
			expect(nextStipendChange(ruhig())).toBeUndefined();
		});

		it('sinkt, wenn die Kasse unter der Rücklage steht', () => {
			const knapp = ruhig({ treasury: treasuryReserve(ERSCHLIESSUNG) - 1 });

			expect(nextStipendChange(knapp)?.value).toBe(LAW_RULES.OFFICE_STIPEND.fallback - 1);
		});

		it('behält ein Gieriger für sich', () => {
			// Die Stadt steht dann, wo sie steht — und die Steuer trifft wie bisher die
			// anderen. Das ist der Preis dafür, dass hier ein Mensch entscheidet und keine
			// Rechnung.
			const gierig = ruhig({
				treasury: 0,
				personality: { ...anlagen(), greed: GREED_TO_KEEP_STIPEND }
			});

			expect(nextStipendChange(gierig)).toBeUndefined();
			expect(decideMayorAction(gierig)).toBe('SET_TAX');
		});

		it('fällt nicht unter null', () => {
			const schon_null = ruhig({ treasury: 0, stipend: LAW_RULES.OFFICE_STIPEND.min });

			expect(nextStipendChange(schon_null)).toBeUndefined();
		});

		it('steigt wieder, wenn die Kasse überläuft', () => {
			const ueppig = ruhig({
				treasury: treasuryReserve(ERSCHLIESSUNG) * 4 + 1,
				stipend: LAW_RULES.OFFICE_STIPEND.min
			});

			expect(nextStipendChange(ueppig)?.value).toBe(LAW_RULES.OFFICE_STIPEND.min + 1);
		});

		it('wartet ein Spieljahr, ehe wieder gedreht wird', () => {
			// Ohne Frist senkte ein Amtsinhaber den Satz binnen fünf Ticks auf null, ehe die
			// erste gesparte Münze in der Kasse sichtbar wird — derselbe Fehler wie 5.71 bei
			// der Grundsteuer.
			const frisch = ruhig({ treasury: 0, stipendAgeInTicks: STIPEND_EFFECT_DELAY - 1 });

			expect(nextStipendChange(frisch)).toBeUndefined();
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
			const leer = ruhig({
				treasury: 0,
				taxBase: { PROPERTY_TAX: 0, TITHE: 0 },
				stipend: LAW_RULES.OFFICE_STIPEND.min
			});

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
				rateAgeInTicks: { PROPERTY_TAX: TICKS_PER_YEAR - 1, TITHE: Infinity },
				stipend: LAW_RULES.OFFICE_STIPEND.min
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
