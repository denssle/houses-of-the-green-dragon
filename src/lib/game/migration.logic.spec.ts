import { describe, expect, it } from 'vitest';
import {
	ARRIVAL_AGE_MIN,
	ARRIVAL_CHANCE_PER_TICK,
	ARRIVAL_MONEY_MAX,
	ARRIVAL_MONEY_MIN,
	arrivalGender,
	arrivalGifts,
	formOf,
	GENERATION_MIN,
	KIND_ALTER_MAX,
	planHousehold,
	skillToBring,
	someoneArrives
} from '$lib/game/migration.logic';
import { seededRoll } from '$lib/game/testRoll';
import { SKILL_TYPES } from '$lib/game/skill.logic';

/**
 * Wer von außerhalb kommt (Punkt 71).
 *
 * Der Zuzug trägt in dieser Welt drei Lasten auf einmal: Er ist das Ventil gegen das
 * Aussterben, er bringt Handwerk in eine Stadt, die es nicht selbst erlernen kann
 * (Punkt 70), und er ist die einzige Geldquelle, die die Regel aus `KONZEPT.md` nicht
 * bricht — Geld kommt mit einem Menschen von draußen, statt aus dem Nichts zu entstehen.
 */

describe('Wer ankommt', () => {
	it('kommt nur, wo ein Bett frei ist', () => {
		// **Die Bremse ist der Wohnraum**, keine Obergrenze: Wer ankommt und nichts findet,
		// zieht weiter. Damit lässt sich eine Stadt nicht überlaufen, ohne dass jemand eine
		// Zahl pflegen müsste.
		expect(someoneArrives(0, false)).toBe(false);
		expect(someoneArrives(0, true)).toBe(true);
	});

	it('kommt selten', () => {
		// Im Mittel einer alle zwei Spieljahre. Ein Wurf knapp über der Schwelle bringt
		// niemanden — sonst stünde bald jeder Zweite als Fremder in der Stadt.
		expect(someoneArrives(0.5, true)).toBe(false);
	});

	it('holt nach, was ein Ausfall übersprungen hat', () => {
		// **Der Befund vom 22.08.2026:** Der Takt würfelt einmal je Herzschlag, die Weltuhr
		// stellt nach einem Neustart aber mehrere Stunden auf einmal vor. Diese Stunden
		// fielen für den Zuzug aus — die Welt alterte, aber niemand konnte in ihr ankommen,
		// und jeder Deploy kostete die Stadt Ankünfte. In Grünau kam über gut 215 Ticks
		// niemand an; allein aus dem Zufall wären das 11,5 %, mit den verlorenen Würfen
		// deutlich mehr.
		const knappDarueber = 0.05;

		expect(someoneArrives(knappDarueber, true)).toBe(false);
		// Zwanzig übersprungene Stunden: rund 18 % statt 1 %.
		expect(someoneArrives(knappDarueber, true, 20)).toBe(true);
	});

	it('bleibt bei einer Stunde, was es war', () => {
		// Der Normalfall darf sich nicht verschoben haben: Ein Herzschlag ohne Ausfall
		// würfelt gegen dieselbe Schwelle wie vor 5.47.
		expect(someoneArrives(ARRIVAL_CHANCE_PER_TICK - 0.0001, true, 1)).toBe(true);
		expect(someoneArrives(ARRIVAL_CHANCE_PER_TICK, true, 1)).toBe(false);
	});

	it('lässt auch nach langem Ausfall niemanden ohne Dach ein', () => {
		// Die Bremse bleibt die Bremse — sonst stünde nach jedem Neustart jemand vor einer
		// vollen Unterkunft und zöge trotzdem ein.
		expect(someoneArrives(0, false, 500)).toBe(false);
	});

	it('bringt mit, was er anderswo verdient hat', () => {
		const arm = arrivalGifts({ money: 0, skill: 0, age: 0 });
		const wohlhabend = arrivalGifts({ money: 0.999, skill: 0.999, age: 0.999 });

		expect(arm.money).toBe(ARRIVAL_MONEY_MIN);
		expect(wohlhabend.money).toBe(ARRIVAL_MONEY_MAX);
		// Er kommt mitten im Leben an, nicht als Kind.
		expect(arm.ageInYears).toBeGreaterThan(16);
		// Und er kann sein Handwerk, ohne Meister zu sein.
		expect(arm.skillLevel).toBeGreaterThan(0);
		expect(wohlhabend.skillLevel).toBeLessThan(10);
	});

	it('bringt das Handwerk mit, das der Stadt fehlt', () => {
		// **Der Kern für Punkt 70.** Ein weiterer Schmied in einer Stadt voller Schmiede
		// ändert nichts; ein Bäcker in einer Stadt ohne Brot ändert alles.
		const alleAußerBacken = SKILL_TYPES.filter((koennen) => koennen !== 'BAKING');

		expect(skillToBring(SKILL_TYPES, alleAußerBacken, 0)).toBe('BAKING');
		expect(skillToBring(SKILL_TYPES, alleAußerBacken, 0.99)).toBe('BAKING');
	});

	it('bringt irgendein Handwerk mit, wenn die Stadt alles hat', () => {
		// Kein Sonderfall im Aufrufer: Wo nichts fehlt, wird unter allem gewählt.
		const gewaehlt = skillToBring(SKILL_TYPES, SKILL_TYPES, 0.5);

		expect(SKILL_TYPES).toContain(gewaehlt);
	});

	it('greift auch beim höchsten Wurf nicht daneben', () => {
		// Ein Wurf von exakt 1 würde ohne die Deckelung hinter das letzte Element zeigen.
		expect(skillToBring(SKILL_TYPES, [], 1)).toBe(SKILL_TYPES[SKILL_TYPES.length - 1]);
	});
});

describe('arrivalGender (0.9.0)', () => {
	it('würfelt 50:50, wenn niemand ledig ist', () => {
		expect(arrivalGender(0, 0, 0.49)).toBe('FEMALE');
		expect(arrivalGender(0, 0, 0.51)).toBe('MALE');
	});

	it('schickt eher eine Frau, wenn ledige Männer warten', () => {
		// Vier Männer, keine Frau: 5 zu 6.
		expect(arrivalGender(4, 0, 0.8)).toBe('FEMALE');
		expect(arrivalGender(4, 0, 0.84)).toBe('MALE');
	});

	it('und eher einen Mann im umgekehrten Fall', () => {
		expect(arrivalGender(0, 4, 0.2)).toBe('MALE');
	});
});

describe('planHousehold (0.9.0)', () => {
	/** Ein Würfel, der die gegebenen Werte der Reihe nach liefert, danach 0.5. */
	const folge =
		(...werte: number[]) =>
		() =>
			werte.length > 0 ? werte.shift()! : 0.5;
	const ledige = { maenner: 0, frauen: 0 };

	it('bringt eine Großfamilie mit drei Generationen', () => {
		// Form 0.95 → GROSSFAMILIE, drei Kinder (0.99), zwei Großeltern (0.99).
		const leute = planHousehold(folge(0.95, 0.99, 0.99), 20, ledige);

		expect(formOf(leute)).toBe('GROSSFAMILIE');
		expect(leute.filter((l) => l.rolle === 'KIND')).toHaveLength(3);
		expect(leute.filter((l) => l.rolle === 'GROSSVATER' || l.rolle === 'GROSSMUTTER')).toHaveLength(
			2
		);
		const vater = leute.find((l) => l.rolle === 'HAUPT')!;
		const opa = leute.find((l) => l.rolle === 'GROSSVATER')!;
		expect(opa.alter - vater.alter).toBeGreaterThanOrEqual(GENERATION_MIN);
	});

	it('macht Eltern alt genug für ihre Kinder', () => {
		for (let i = 0; i < 200; i++) {
			const leute = planHousehold(seededRoll(i), 20, ledige);
			const eltern = leute.filter((l) => l.rolle === 'HAUPT' || l.rolle === 'PARTNER');
			for (const kind of leute.filter((l) => l.rolle === 'KIND')) {
				for (const elter of eltern) {
					expect(elter.alter - kind.alter).toBeGreaterThanOrEqual(ARRIVAL_AGE_MIN);
				}
				expect(kind.alter).toBeLessThanOrEqual(KIND_ALTER_MAX);
			}
		}
	});

	it('schrumpft auf die freien Betten', () => {
		const leute = planHousehold(folge(0.95, 0.99, 0.99), 3, ledige);
		expect(leute).toHaveLength(3);
		expect(formOf(leute)).toBe('FAMILIE');

		const einer = planHousehold(folge(0.95, 0.99, 0.99), 1, ledige);
		expect(einer).toHaveLength(1);
		expect(formOf(einer)).toBe('ALLEIN');
	});

	it('bringt niemanden ohne Bett', () => {
		expect(planHousehold(folge(0.1), 0, ledige)).toEqual([]);
	});

	it('lässt den Einzelnen nach dem Heiratsmarkt wählen', () => {
		// Form 0.1 → ALLEIN, Geschlecht 0.8 bei vier ledigen Männern → Frau.
		const [einzeln] = planHousehold(folge(0.1, 0.8), 20, { maenner: 4, frauen: 0 });
		expect(einzeln.geschlecht).toBe('FEMALE');
	});
});
