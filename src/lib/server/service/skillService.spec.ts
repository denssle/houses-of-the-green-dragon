import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { Skill } from '$lib/db/model/skill';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as skillService from '$lib/server/service/skillService';
import { teachingFee, TEACHING_PRACTICE } from '$lib/game/skill.logic';

/**
 * Phase 4.5a gegen die Datenbank. Im Mittelpunkt: dass die Tabelle spärlich bleibt und
 * dass eine Lehrstunde Geld, Kraft und Können in einem Zug bewegt.
 */

let stadtId: string;

async function person(name: string, money = 1000): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'PLAYER',
		gender: 'FEMALE',
		birthTick: 0,
		lastTickProcessed: 0,
		actionPoints: 48,
		money,
		RegionId: stadtId
	});
	return id;
}

describe('Können', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await Skill.destroy({ where: {} });
		await Character.destroy({ where: { role: 'PLAYER' } });
	});

	describe('die Tabelle', () => {
		it('bleibt leer, solange niemand etwas tut', async () => {
			const wer = await person('Wer');

			expect(await skillService.getLevel(wer, 'SMITHING')).toBe(0);
			expect(await Skill.count()).toBe(0);
		});

		it('legt bei der ersten Übung eine Zeile an', async () => {
			const wer = await person('Wer');

			await skillService.addPractice(wer, 'SMITHING', 1);

			expect(await skillService.getLevel(wer, 'SMITHING')).toBe(1);
			expect(await Skill.count()).toBe(1);
		});

		it('hält Fertigkeiten auseinander', async () => {
			const wer = await person('Wer');

			await skillService.addPractice(wer, 'SMITHING', 100);

			expect(await skillService.getLevel(wer, 'SMITHING')).toBeGreaterThan(1);
			expect(await skillService.getLevel(wer, 'CONSTRUCTION')).toBe(0);
		});
	});

	describe('die Lehre', () => {
		/** Ein Meister mit der angegebenen Stufe. */
		async function meister(stufe: number): Promise<string> {
			const id = await person('Meister');
			await Skill.create({ CharacterId: id, type: 'SMITHING', level: stufe, progress: 0 });
			return id;
		}

		it('bewegt Geld, Kraft und Können in einem Zug', async () => {
			const lehrer = await meister(9);
			const schueler = await person('Schüler', 1000);

			expect(await skillService.learnFrom(schueler, lehrer, 'SMITHING')).toEqual({ ok: true });

			const lehrgeld: number = teachingFee(9);
			expect((await Character.findByPk(lehrer))!.dataValues.money).toBe(1000 + lehrgeld);
			expect((await Character.findByPk(schueler))!.dataValues.money).toBe(1000 - lehrgeld);
			// Zwanzig Übungen auf einmal: das reicht über mehrere der unteren Stufen.
			expect(await skillService.getLevel(schueler, 'SMITHING')).toBe(3);
		});

		it('endet zwei Stufen unter dem Meister', async () => {
			const lehrer = await meister(5);
			const schueler = await person('Schüler');
			await Skill.create({ CharacterId: schueler, type: 'SMITHING', level: 3, progress: 0 });

			expect(await skillService.learnFrom(schueler, lehrer, 'SMITHING')).toEqual({
				ok: false,
				reason: 'NOTHING_TO_LEARN'
			});
		});

		it('nimmt kein Geld, wenn nichts zu lernen ist', async () => {
			const lehrer = await meister(2);
			const schueler = await person('Schüler', 1000);

			await skillService.learnFrom(schueler, lehrer, 'SMITHING');

			expect((await Character.findByPk(schueler))!.dataValues.money).toBe(1000);
			expect((await Character.findByPk(lehrer))!.dataValues.money).toBe(1000);
		});

		it('scheitert, wenn das Lehrgeld fehlt', async () => {
			const lehrer = await meister(9);
			const arm = await person('Arm', 0);

			expect(await skillService.learnFrom(arm, lehrer, 'SMITHING')).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
			expect(await Skill.count({ where: { CharacterId: arm } })).toBe(0);
		});

		it('zeigt nur an, was tatsächlich etwas brächte', async () => {
			const lehrer = await meister(9);
			const schueler = await person('Schüler');

			const angebote = await skillService.getLessons(lehrer, schueler);
			expect(angebote).toHaveLength(1);
			expect(angebote[0]).toMatchObject({ type: 'SMITHING', upTo: 7, teacherLevel: 9 });

			// Auf Stufe 7 angekommen ist bei diesem Meister nichts mehr zu holen.
			await Skill.upsert({
				CharacterId: schueler,
				type: 'SMITHING',
				level: 7,
				progress: 0
			});
			expect(await skillService.getLessons(lehrer, schueler)).toHaveLength(0);
		});

		it('ist um ein Vielfaches schneller als eigenes Üben', async () => {
			const lehrer = await meister(9);
			const alleine = await person('Alleine');
			const gelehrt = await person('Gelehrt');

			// Eine Lehrstunde kostet zwei Aktionspunkte — dieselben zwei allein geübt.
			await skillService.addPractice(alleine, 'SMITHING', 2);
			await skillService.learnFrom(gelehrt, lehrer, 'SMITHING');

			expect(await skillService.getLevel(alleine, 'SMITHING')).toBe(1);
			expect(await skillService.getLevel(gelehrt, 'SMITHING')).toBe(3);
			expect(TEACHING_PRACTICE).toBeGreaterThan(2);
		});
	});
});
