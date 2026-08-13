import { describe, expect, it } from 'vitest';
import { chooseHeir, type Child, splitEstate } from '$lib/game/inheritance.logic';
import { yearsToTicks } from '$lib/game/time';

/** Ein Kind, das zum Zeitpunkt `JETZT` das angegebene Alter hat. */
const JETZT = 10_000;
function kind(id: string, alter: number): Child {
	return { id, birthTick: JETZT - yearsToTicks(alter) };
}

describe('Erbfolge', () => {
	describe('wer erbt', () => {
		it('nimmt den benannten Erben', () => {
			const kinder = [kind('anna', 30), kind('bernd', 25)];

			expect(chooseHeir('bernd', kinder, JETZT)).toBe('bernd');
		});

		it('nimmt das älteste volljährige Kind, wenn keiner benannt ist', () => {
			const kinder = [kind('bernd', 25), kind('anna', 30), kind('clara', 20)];

			expect(chooseHeir(null, kinder, JETZT)).toBe('anna');
		});

		it('übergeht den Benannten, wenn er den Erblasser nicht überlebt hat', () => {
			// Der Tote steht nicht mehr in der Liste — genau daran hängt die Regel.
			const kinder = [kind('anna', 30), kind('clara', 20)];

			expect(chooseHeir('bernd', kinder, JETZT)).toBe('anna');
		});

		it('bevorzugt Volljährige vor Älteren, die es nicht sind', () => {
			// Es gibt kein älteres volljähriges Kind: Der Achtzehnjährige geht vor.
			const kinder = [kind('clara', 12), kind('dietrich', 18), kind('emma', 14)];

			expect(chooseHeir(null, kinder, JETZT)).toBe('dietrich');
		});

		it('lässt notfalls ein Kind erben', () => {
			// Ein Haus, das an seinen Kindern vorbei erlischt, bestrafte den Spieler für
			// den Zeitpunkt seines Todes — den er nicht steuert.
			const kinder = [kind('emma', 14), kind('friedrich', 3)];

			expect(chooseHeir(null, kinder, JETZT)).toBe('emma');
		});

		it('achtet den Willen des Erblassers auch bei einem Kind', () => {
			const kinder = [kind('anna', 30), kind('friedrich', 3)];

			expect(chooseHeir('friedrich', kinder, JETZT)).toBe('friedrich');
		});

		it('findet ohne lebende Kinder niemanden', () => {
			expect(chooseHeir(null, [], JETZT)).toBeNull();
			expect(chooseHeir('anna', [], JETZT)).toBeNull();
		});
	});

	describe('was jeder bekommt', () => {
		it('gibt dem Einzelkind alles', () => {
			expect(splitEstate(100, true, 0)).toEqual({ heir: 100, perSibling: 0, toCity: 0 });
		});

		it('teilt den gesetzlichen Anteil unter den Geschwistern', () => {
			// 25 % von 400 sind 100, aufgeteilt auf zwei.
			expect(splitEstate(400, true, 2)).toEqual({ heir: 300, perSibling: 50, toCity: 0 });
		});

		it('lässt den Rest der Teilung beim Erben', () => {
			// 25 % von 100 sind 25, auf drei Geschwister also je 8 — einer bleibt übrig.
			const geteilt = splitEstate(100, true, 3);

			expect(geteilt.perSibling).toBe(8);
			expect(geteilt.heir).toBe(76);
			expect(geteilt.heir + geteilt.perSibling * 3).toBe(100);
		});

		it('verliert keine Münze, egal wie krumm die Zahlen sind', () => {
			for (const geld of [0, 1, 7, 33, 99, 1234, 100_001]) {
				for (const geschwister of [0, 1, 2, 3, 5, 7]) {
					const geteilt = splitEstate(geld, true, geschwister);

					expect(geteilt.heir + geteilt.perSibling * geschwister + geteilt.toCity).toBe(geld);
				}
			}
		});

		it('gibt der Stadt alles, wenn es keinen Erben gibt', () => {
			expect(splitEstate(400, false, 0)).toEqual({ heir: 0, perSibling: 0, toCity: 400 });
		});

		it('folgt einem geänderten Gesetz', () => {
			// Ab 4.7 kann der Rat den Satz verschieben — die Rechnung muss das mitmachen.
			expect(splitEstate(400, true, 2, 0.5)).toEqual({ heir: 200, perSibling: 100, toCity: 0 });
			expect(splitEstate(400, true, 2, 0)).toEqual({ heir: 400, perSibling: 0, toCity: 0 });
		});
	});
});
