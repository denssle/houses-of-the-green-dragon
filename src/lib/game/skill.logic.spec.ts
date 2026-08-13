import { describe, expect, it } from 'vitest';
import {
	costFactor,
	MAX_SKILL_LEVEL,
	practice,
	practiceForNextLevel,
	PRACTICE_FOR_SECOND_LEVEL,
	skillFactor,
	teach,
	teachableUpTo,
	TEACHING_ACTION_POINT_COST,
	teachingFee,
	totalPracticeFor
} from '$lib/game/skill.logic';
import { AGE_OF_MAJORITY, TICKS_PER_YEAR } from '$lib/game/time';

describe('Fertigkeiten', () => {
	describe('die Kurve', () => {
		it('verdoppelt sich mit jeder Stufe', () => {
			expect(practiceForNextLevel(1)).toBe(PRACTICE_FOR_SECOND_LEVEL);
			expect(practiceForNextLevel(2)).toBe(PRACTICE_FOR_SECOND_LEVEL * 2);
			expect(practiceForNextLevel(5)).toBe(PRACTICE_FOR_SECOND_LEVEL * 16);
		});

		it('endet auf der Höchststufe', () => {
			expect(practiceForNextLevel(MAX_SKILL_LEVEL)).toBeUndefined();
		});

		/**
		 * Kein Test einer Formel, sondern der Balancing-Nachweis: Die höchste Stufe soll
		 * ein ganzes Leben kosten, eine mittlere nebenbei mitlaufen. Wer die Konstanten
		 * anfasst, sieht hier sofort, was das für ein Leben bedeutet.
		 */
		it('kostet für die Meisterschaft ein ganzes Leben', () => {
			// Von der Volljährigkeit bis zum mittleren Sterbealter, ein Punkt je Tick.
			const einLeben: number = (70 - AGE_OF_MAJORITY) * TICKS_PER_YEAR;

			expect(totalPracticeFor(MAX_SKILL_LEVEL)).toBeGreaterThan(einLeben * 0.8);
			expect(totalPracticeFor(MAX_SKILL_LEVEL)).toBeLessThan(einLeben);
		});

		it('lässt eine mittlere Stufe nebenbei mitlaufen', () => {
			// Rund 155 Übungen für Stufe 6 — ein paar Wochen Arbeit, kein Lebenswerk.
			expect(totalPracticeFor(6)).toBeLessThan(200);
		});
	});

	describe('üben', () => {
		it('sammelt, bis die Stufe voll ist', () => {
			expect(practice({ level: 1, progress: 0 }, 3)).toEqual({ level: 1, progress: 3 });
			expect(practice({ level: 1, progress: 3 }, 2)).toEqual({ level: 2, progress: 0 });
		});

		it('nimmt den Überschuss in die neue Stufe mit', () => {
			expect(practice({ level: 1, progress: 0 }, 7)).toEqual({ level: 2, progress: 2 });
		});

		it('springt bei einer Lehrstunde über mehrere Stufen', () => {
			// Zwanzig Übungen auf einmal: 5 für Stufe 2, 10 für Stufe 3, Rest bleibt.
			expect(practice({ level: 1, progress: 0 }, 20)).toEqual({ level: 3, progress: 5 });
		});

		it('lässt Übung über der Höchststufe verfallen', () => {
			// Sonst ließe sie sich horten und beim nächsten Anheben der Grenze einlösen.
			expect(practice({ level: MAX_SKILL_LEVEL, progress: 0 }, 10_000)).toEqual({
				level: MAX_SKILL_LEVEL,
				progress: 0
			});
		});
	});

	describe('was Können bewirkt', () => {
		it('hebt den Ertrag um zehn Prozent je Stufe', () => {
			expect(skillFactor(0)).toBe(1);
			expect(skillFactor(10)).toBeCloseTo(2, 10);
		});

		it('senkt Kosten, aber höchstens auf die Hälfte', () => {
			expect(costFactor(0)).toBe(1);
			expect(costFactor(4)).toBeCloseTo(0.8, 10);
			// Ohne Deckel käme der Meister bei null heraus — Renovieren wäre umsonst.
			expect(costFactor(20)).toBe(0.5);
		});
	});

	describe('die Lehre', () => {
		const MEISTER = { actionPoints: 10, level: 9 };
		const SCHUELER = { actionPoints: 10, money: 1000, level: 3 };

		it('lässt den Schüler zwei Stufen unter dem Meister bleiben', () => {
			expect(teachableUpTo(9)).toBe(7);
			expect(teachableUpTo(1)).toBe(0);
		});

		it('kostet beide Zeit und den Schüler Lehrgeld', () => {
			const ergebnis = teach(MEISTER, SCHUELER);

			expect(ergebnis).toEqual({
				ok: true,
				teacherActionPoints: 10 - TEACHING_ACTION_POINT_COST,
				studentActionPoints: 10 - TEACHING_ACTION_POINT_COST,
				fee: teachingFee(9)
			});
		});

		it('endet, wo der Schüler den Meister fast eingeholt hat', () => {
			expect(teach(MEISTER, { ...SCHUELER, level: 7 })).toEqual({
				ok: false,
				reason: 'NOTHING_TO_LEARN'
			});
		});

		it('braucht einen Meister mit Kraft', () => {
			expect(teach({ actionPoints: 1, level: 9 }, SCHUELER)).toEqual({
				ok: false,
				reason: 'TEACHER_TOO_TIRED'
			});
		});

		it('braucht einen Schüler mit Geld', () => {
			expect(teach(MEISTER, { ...SCHUELER, money: 0 })).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
		});

		it('ist um ein Vielfaches schneller als eigenes Üben', () => {
			// Der ganze Sinn der Sache: Wer einen Meister findet, spart Jahre.
			const alleine = practice({ level: 3, progress: 0 }, 1);
			const gelehrt = practice({ level: 3, progress: 0 }, 20);

			expect(gelehrt.level).toBeGreaterThan(alleine.level);
		});
	});
});
