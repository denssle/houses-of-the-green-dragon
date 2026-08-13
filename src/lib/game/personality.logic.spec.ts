import { describe, expect, it } from 'vitest';
import {
	AXIS_MAX,
	AXIS_MIN,
	INHERITANCE_SPREAD,
	inheritPersonality,
	NOTABLE_FROM,
	PERSONALITY_AXES,
	type Personality,
	personalityLabel,
	randomPersonality
} from '$lib/game/personality.logic';

/** Ein Charakter mit lauter gleichen Anlagen — für Rechnungen, die eine Achse prüfen. */
function anlagen(werte: Partial<Personality> = {}, grundwert = 0): Personality {
	const voll = {} as Personality;
	for (const achse of PERSONALITY_AXES) voll[achse] = grundwert;
	return { ...voll, ...werte };
}

/** Ein Würfel, der die übergebenen Werte der Reihe nach liefert und dann wiederholt. */
function wuerfel(...werte: number[]): () => number {
	let i = 0;
	return () => werte[i++ % werte.length];
}

describe('Persönlichkeit', () => {
	describe('die erste Generation', () => {
		it('bleibt auf der Skala', () => {
			for (const wurf of [0, 0.5, 1]) {
				const anlage = randomPersonality(wuerfel(wurf));
				for (const achse of PERSONALITY_AXES) {
					expect(anlage[achse]).toBeGreaterThanOrEqual(AXIS_MIN);
					expect(anlage[achse]).toBeLessThanOrEqual(AXIS_MAX);
				}
			}
		});

		it('trifft bei mittleren Würfen die Mitte', () => {
			expect(randomPersonality(wuerfel(0.5)).greed).toBe(0);
		});

		/**
		 * Der Mittelwert dreier Würfe ergibt eine Glockenkurve. Ohne sie wäre ein
		 * Charakter mit +95 Gier so häufig wie einer mit 0 — eine Stadt voller Extreme.
		 */
		it('häuft sich in der Mitte statt an den Rändern', () => {
			let zufall = 1;
			const naechster = (): number => {
				// Ein einfacher, aber gleichverteilter Generator — kein Math.random, damit
				// der Test nicht gelegentlich anders ausgeht.
				zufall = (zufall * 1103515245 + 12345) % 2147483648;
				return zufall / 2147483648;
			};

			let mitte = 0;
			let rand = 0;
			for (let i = 0; i < 2000; i++) {
				const wert: number = randomPersonality(naechster).courage;
				if (Math.abs(wert) < 25) mitte++;
				if (Math.abs(wert) > 75) rand++;
			}

			expect(mitte).toBeGreaterThan(rand * 5);
		});
	});

	describe('die Vererbung', () => {
		it('trifft ohne Streuung die Mitte der Eltern', () => {
			const kind = inheritPersonality(
				anlagen({ diligence: 70 }),
				anlagen({ diligence: 30 }),
				wuerfel(0.5)
			);

			expect(kind.diligence).toBe(50);
		});

		it('streut nach oben und unten', () => {
			const eltern = anlagen({ greed: 0 });

			expect(inheritPersonality(eltern, eltern, wuerfel(1)).greed).toBe(INHERITANCE_SPREAD);
			expect(inheritPersonality(eltern, eltern, wuerfel(0)).greed).toBe(-INHERITANCE_SPREAD);
		});

		it('lässt aus zwei Fleißigen einen Faulpelz werden — wenn der Würfel es will', () => {
			// Nicht anzüchtbar: Gewissheit gibt es keine, nur bessere Aussichten.
			const fleissig = anlagen({ diligence: 20 });

			expect(inheritPersonality(fleissig, fleissig, wuerfel(0)).diligence).toBeLessThan(0);
		});

		it('nimmt den einen Elternteil, wenn der andere fehlt', () => {
			const kind = inheritPersonality(anlagen({ ambition: 60 }), null, wuerfel(0.5));

			expect(kind.ambition).toBe(60);
		});

		it('würfelt, wenn beide fehlen', () => {
			const kind = inheritPersonality(null, null, wuerfel(0.5));

			expect(kind.ambition).toBe(0);
		});

		it('läuft nicht über die Skala hinaus', () => {
			const extrem = anlagen({}, AXIS_MAX);

			expect(inheritPersonality(extrem, extrem, wuerfel(1)).courage).toBe(AXIS_MAX);
		});
	});

	describe('das Etikett', () => {
		it('nennt den stärksten Ausschlag', () => {
			const gierig = anlagen({ greed: 85, ambition: 60 });

			expect(personalityLabel(gierig, 'FEMALE')).toBe('die Gierige');
			expect(personalityLabel(gierig, 'MALE')).toBe('der Gierige');
		});

		it('nennt auch den Ausschlag nach unten', () => {
			expect(personalityLabel(anlagen({ diligence: -80 }), 'MALE')).toBe('der Faule');
			expect(personalityLabel(anlagen({ agreeableness: -80 }), 'FEMALE')).toBe(
				'die Streitsüchtige'
			);
		});

		it('schweigt über Unauffällige', () => {
			// Ein Etikett, das jeder trägt, sagt nichts.
			expect(personalityLabel(anlagen({ greed: NOTABLE_FROM - 1 }), 'MALE')).toBe('ausgeglichen');
			expect(personalityLabel(anlagen(), 'FEMALE')).toBe('ausgeglichen');
		});

		it('entscheidet bei Gleichstand nach dem Betrag, nicht nach dem Vorzeichen', () => {
			const beides = anlagen({ courage: -90, greed: 50 });

			expect(personalityLabel(beides, 'MALE')).toBe('der Vorsichtige');
		});
	});
});
