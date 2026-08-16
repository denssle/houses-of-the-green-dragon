import { describe, expect, it } from 'vitest';
import {
	ARRIVAL_MONEY_MAX,
	ARRIVAL_MONEY_MIN,
	arrivalGifts,
	skillToBring,
	someoneArrives
} from '$lib/game/migration.logic';
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
