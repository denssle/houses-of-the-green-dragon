import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Event } from '$lib/db/model/event';
import { Law } from '$lib/db/model/law';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { Skill } from '$lib/db/model/skill';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as schoolService from '$lib/server/service/schoolService';
import { LAW_RULES } from '$lib/game/law.logic';
import { TEACHING_ACTION_POINT_COST, TEACHING_GAP } from '$lib/game/skill.logic';
import { AGE_OF_MAJORITY, yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.7e. Die Schule erfindet keine Mechanik — sie stellt einen Lehrmeister, den die
 * Stadt bezahlt. Geprüft wird deshalb vor allem, **wer wen bezahlt** und dass der
 * Schultag das Kind Kraft kostet.
 */

const SCHULGELD: number = LAW_RULES.SCHOOL_FEE.fallback;
const JETZT = 10_000;
let stadtId: string;
let schuleId: string;

async function person(name: string, extras: Record<string, unknown> = {}): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 100,
		RegionId: stadtId,
		...extras
	});
	return id;
}

async function kind(name: string, alter = 10): Promise<string> {
	return person(name, { birthTick: JETZT - yearsToTicks(alter), money: 0 });
}

/** Ein Lehrer mit dieser Stufe, an der Schule angestellt. */
async function lehrerMitStufe(level: number): Promise<string> {
	const id = await person('Lehrerin');
	await Skill.create({ CharacterId: id, type: 'SMITHING', level, progress: 0 });
	await Employment.create({
		EmployeeCharacterId: id,
		BuildingId: schuleId,
		wagePerActionPoint: 4,
		sinceTick: JETZT
	});
	return id;
}

async function stand(id: string) {
	return (await Character.findByPk(id))!.dataValues;
}

async function kasse(): Promise<number> {
	return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
}

describe('Die Schule', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Event.destroy({ where: {} });
		await Law.destroy({ where: {} });
		await Employment.destroy({ where: {} });
		await Skill.destroy({ where: {} });
		await Building.destroy({ where: {} });
		await Plot.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });

		const plotId = randomUUID();
		await Plot.create({
			id: plotId,
			address: 'Schulgasse 1',
			type: 'BUILDING_LAND',
			RegionId: stadtId,
			ownerType: 'CITY'
		});
		schuleId = randomUUID();
		await Building.create({
			id: schuleId,
			name: 'Schule',
			optionId: schoolService.SCHOOL_OPTION_ID,
			lastConditionTick: JETZT,
			PlotId: plotId,
			ownerType: 'CITY'
		});
	});

	describe('was sie anbietet', () => {
		it('nichts ohne Lehrer', async () => {
			// Eine Schule ohne Lehrer ist ein leeres Haus.
			expect(await schoolService.getTeachers(schuleId)).toEqual([]);

			const schueler = await kind('Kind');
			expect(await schoolService.attend(schueler, schuleId, 'SMITHING', schueler)).toEqual({
				ok: false,
				reason: 'NOTHING_TO_LEARN'
			});
		});

		it('nur, was der Lehrer selbst beherrscht', async () => {
			await lehrerMitStufe(5);

			const faecher = await schoolService.getTeachers(schuleId);
			expect(faecher.map((eintrag) => eintrag.skill)).toEqual(['SMITHING']);
			expect(faecher[0].upTo).toBe(5 - TEACHING_GAP);
		});

		it('nichts von einem, der es selbst kaum kann', async () => {
			// Dieselbe Grenze wie bei der privaten Lehre: zwei Stufen Abstand.
			await lehrerMitStufe(TEACHING_GAP);
			expect(await schoolService.getTeachers(schuleId)).toEqual([]);
		});
	});

	describe('ein Schultag', () => {
		it('kostet das Kind Kraft und den Zahlenden Geld', async () => {
			await lehrerMitStufe(5);
			const schueler = await kind('Kind');
			const elternteil = await person('Mutter');

			const ergebnis = await schoolService.attend(schueler, schuleId, 'SMITHING', elternteil);

			expect(ergebnis).toEqual({
				ok: true,
				skill: 'SMITHING',
				fee: SCHULGELD,
				teacher: 'Lehrerin'
			});
			// Lernen steht gegen Verdienen: Der Tag ist weg.
			expect((await stand(schueler)).actionPoints).toBe(48 - TEACHING_ACTION_POINT_COST);
			expect((await stand(elternteil)).money).toBe(100 - SCHULGELD);
			// Das Kind zahlt nichts — es hat nichts.
			expect((await stand(schueler)).money).toBe(0);
		});

		it('füllt die Stadtkasse, nicht den Beutel des Lehrers', async () => {
			// Der Unterschied zur privaten Lehre: Der Lehrer ist bereits von der Stadt
			// bezahlt, das Schulgeld ist eine Abgabe und kein Honorar.
			const lehrer = await lehrerMitStufe(5);
			const schueler = await kind('Kind');
			const elternteil = await person('Mutter');

			await schoolService.attend(schueler, schuleId, 'SMITHING', elternteil);

			expect(await kasse()).toBe(SCHULGELD);
			expect((await stand(lehrer)).money).toBe(100);
			// Seine Zeit kostet es ihn trotzdem.
			expect((await stand(lehrer)).actionPoints).toBe(48 - TEACHING_ACTION_POINT_COST);
		});

		it('bringt Übung', async () => {
			await lehrerMitStufe(5);
			const schueler = await kind('Kind');
			const elternteil = await person('Mutter');

			await schoolService.attend(schueler, schuleId, 'SMITHING', elternteil);

			const gelernt = await Skill.findOne({ where: { CharacterId: schueler, type: 'SMITHING' } });
			expect(gelernt?.dataValues.progress).toBeGreaterThan(0);
		});

		it('ist umsonst, wenn das Gesetz auf null steht', async () => {
			// Dann zahlt die Stadt die Bildung ihrer Kinder ganz allein — genau dafür ist
			// das Schulgeld ein Gesetz und keine Konstante.
			await Law.create({
				id: randomUUID(),
				RegionId: stadtId,
				kind: 'SCHOOL_FEE',
				value: 0,
				enactedTick: JETZT,
				EnactedByCharacterId: null
			});
			await lehrerMitStufe(5);
			const schueler = await kind('Kind');
			const elternteil = await person('Mutter');

			const ergebnis = await schoolService.attend(schueler, schuleId, 'SMITHING', elternteil);

			expect(ergebnis).toMatchObject({ ok: true, fee: 0 });
			expect((await stand(elternteil)).money).toBe(100);
		});

		it('findet nicht statt, wenn das Schulgeld fehlt', async () => {
			await lehrerMitStufe(5);
			const schueler = await kind('Kind');
			const arm = await person('Arme', { money: 0 });

			expect(await schoolService.attend(schueler, schuleId, 'SMITHING', arm)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
			expect((await stand(schueler)).actionPoints).toBe(48);
		});

		it('ist nichts für Erwachsene', async () => {
			// Wer volljährig ist, lernt beim Meister und zahlt ihn selbst.
			await lehrerMitStufe(5);
			const erwachsen = await kind('Groß', AGE_OF_MAJORITY);
			const elternteil = await person('Mutter');

			expect(await schoolService.attend(erwachsen, schuleId, 'SMITHING', elternteil)).toEqual({
				ok: false,
				reason: 'TOO_YOUNG'
			});
		});

		it('steht danach in der Chronik', async () => {
			await lehrerMitStufe(5);
			const schueler = await kind('Kind');
			const elternteil = await person('Mutter');

			await schoolService.attend(schueler, schuleId, 'SMITHING', elternteil);

			const eintrag = await Event.findOne({ where: { kind: 'SCHOOL_ATTENDED' } });
			expect(eintrag?.dataValues.subjectId).toBe(schueler);
			expect(eintrag?.dataValues.detail).toBe('SMITHING');
		});
	});
});
