import { describe, expect, it } from 'vitest';
import {
	AFFECTION_HALF_LIFE_YEARS,
	AFFECTION_MAX,
	AFFECTION_MIN,
	affectionLabel,
	affectionNow,
	baseAffection,
	changeAffection,
	decayed,
	houseDrift,
	kinshipBonus,
	standingNow,
	STANDING_HALF_LIFE_YEARS
} from '$lib/game/relationship.logic';
import { yearsToTicks } from '$lib/game/time';

describe('Zuneigung', () => {
	describe('der Verfall', () => {
		it('halbiert den Wert nach der Halbwertszeit', () => {
			const nachher: number = decayed(
				80,
				yearsToTicks(AFFECTION_HALF_LIFE_YEARS),
				AFFECTION_HALF_LIFE_YEARS
			);

			expect(nachher).toBeCloseTo(40, 10);
		});

		/**
		 * Der Kern der ganzen Datei: Wer oft nachsieht, darf nichts anderes vorfinden als
		 * wer selten nachsieht. Sonst wäre das Aufrufen der Seite eine Spielhandlung.
		 */
		it('ergibt über viele kleine Schritte dasselbe wie über einen großen', () => {
			const gesamt: number = yearsToTicks(12);
			const inEinem: number = decayed(73, gesamt, AFFECTION_HALF_LIFE_YEARS);

			let schrittweise = 73;
			for (let i = 0; i < gesamt; i++) {
				schrittweise = decayed(schrittweise, 1, AFFECTION_HALF_LIFE_YEARS);
			}

			expect(schrittweise).toBeCloseTo(inEinem, 8);
		});

		it('rührt sich nicht ohne verstrichene Zeit', () => {
			expect(decayed(50, 0, AFFECTION_HALF_LIFE_YEARS)).toBe(50);
			expect(decayed(50, -10, AFFECTION_HALF_LIFE_YEARS)).toBe(50);
		});

		it('lässt Hass genauso abklingen wie Liebe', () => {
			const nachher: number = decayed(
				-80,
				yearsToTicks(AFFECTION_HALF_LIFE_YEARS),
				AFFECTION_HALF_LIFE_YEARS
			);

			expect(nachher).toBeCloseTo(-40, 10);
		});

		it('kommt nie ganz bei null an, aber beliebig nah', () => {
			expect(Math.abs(decayed(100, yearsToTicks(100), AFFECTION_HALF_LIFE_YEARS))).toBeLessThan(1);
		});

		it('gibt Häusern ein längeres Gedächtnis als Menschen', () => {
			const jahre: number = yearsToTicks(15);
			const person: number = decayed(100, jahre, AFFECTION_HALF_LIFE_YEARS);
			const haus: number = decayed(100, jahre, STANDING_HALF_LIFE_YEARS);

			expect(haus).toBeGreaterThan(person);
		});
	});

	describe('die drei Schichten', () => {
		it('gibt Verwandten einen Vorsprung', () => {
			expect(kinshipBonus('SPOUSE')).toBeGreaterThan(kinshipBonus('SIBLING'));
			expect(kinshipBonus('SIBLING')).toBeGreaterThan(kinshipBonus('GRANDCHILD'));
			expect(kinshipBonus('NONE')).toBe(0);
		});

		it('verrechnet Verwandtschaft und Hausstand zum Grundwert', () => {
			// Hausstand geht mit halbem Gewicht ein.
			expect(baseAffection('SIBLING', 40)).toBe(40);
			expect(baseAffection('NONE', -80)).toBe(-40);
		});

		it('fällt nach langer Funkstille auf den Grundwert zurück, nicht auf null', () => {
			// Ein Bruder, den man Jahre nicht gesehen hat, ist wieder einfach ein Bruder.
			const spaeter: number = affectionNow(60, 0, yearsToTicks(100), 'SIBLING', 0);

			expect(Math.round(spaeter)).toBe(kinshipBonus('SIBLING'));
		});

		/**
		 * Der zweite Testschwerpunkt aus dem Plan: Ohne das ist Romeo und Julia
		 * mechanisch ausgeschlossen.
		 */
		it('lässt die persönliche Schicht eine Hausfehde überstimmen', () => {
			const fehde = -100;

			// Ohne Zutun: Der Hausstand bestimmt alles.
			expect(affectionNow(0, 0, 0, 'NONE', fehde)).toBe(-50);

			// Mit gepflegter persönlicher Zuneigung: Freundschaft trotz Fehde.
			expect(affectionNow(90, 0, 0, 'NONE', fehde)).toBe(40);
		});

		it('lässt umgekehrt den Hass trotz Verwandtschaft zu', () => {
			// Der Bonus ist ein Ausgangspunkt, keine Untergrenze.
			expect(affectionNow(-100, 0, 0, 'CHILD', 0)).toBe(-70);
		});

		it('hält alles auf der Skala', () => {
			expect(affectionNow(100, 0, 0, 'SPOUSE', 100)).toBe(AFFECTION_MAX);
			expect(affectionNow(-100, 0, 0, 'NONE', -100)).toBe(AFFECTION_MIN);
		});
	});

	describe('eine Interaktion', () => {
		it('verschiebt den Wert', () => {
			expect(changeAffection(10, 0, 0, 5)).toBe(15);
			expect(changeAffection(10, 0, 0, -25)).toBe(-15);
		});

		it('rechnet den Verfall vorher ein', () => {
			// Wer seit einer Halbwertszeit nichts von sich hören ließ, startet bei der
			// Hälfte — nicht beim alten Stand.
			const nachher: number = changeAffection(80, 0, yearsToTicks(AFFECTION_HALF_LIFE_YEARS), 10);

			expect(nachher).toBe(50);
		});

		it('läuft nicht über die Skala hinaus', () => {
			expect(changeAffection(95, 0, 0, 50)).toBe(AFFECTION_MAX);
			expect(changeAffection(-95, 0, 0, -50)).toBe(AFFECTION_MIN);
		});
	});

	describe('der Abdruck auf den Häusern', () => {
		it('bleibt bei Höflichkeiten wirkungslos', () => {
			expect(houseDrift(3)).toBe(0);
			expect(houseDrift(-4)).toBe(0);
		});

		it('schlägt bei einem Zerwürfnis durch', () => {
			expect(houseDrift(-30)).toBe(-3);
			expect(houseDrift(50)).toBe(5);
		});
	});

	describe('der Stand der Häuser', () => {
		it('klingt ab wie alles andere', () => {
			expect(standingNow(60, 0, yearsToTicks(STANDING_HALF_LIFE_YEARS))).toBeCloseTo(30, 8);
		});
	});

	describe('das Wort zur Zahl', () => {
		it('nennt die Mitte gleichgültig', () => {
			expect(affectionLabel(0)).toBe('gleichgültig');
			expect(affectionLabel(5)).toBe('gleichgültig');
			expect(affectionLabel(-5)).toBe('gleichgültig');
		});

		it('steigert sich in beide Richtungen', () => {
			expect(affectionLabel(-100)).toBe('Hass');
			expect(affectionLabel(-30)).toBe('Feindschaft');
			expect(affectionLabel(-10)).toBe('Abneigung');
			expect(affectionLabel(10)).toBe('Wohlwollen');
			expect(affectionLabel(30)).toBe('Freundschaft');
			expect(affectionLabel(100)).toBe('Verbundenheit');
		});
	});
});
