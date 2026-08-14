import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { Event } from '$lib/db/model/event';
import { Plot } from '$lib/db/model/plot';
import { Relationship } from '$lib/db/model/relationship';
import { User } from '$lib/db/model/user';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as familyService from '$lib/server/service/familyService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as relationshipService from '$lib/server/service/relationshipService';
import { chronicleMessage } from '$lib/chronicleMessage';
import { MARRIAGE_MIN_AFFECTION } from '$lib/game/family.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.7d. Zwei Fragen stehen im Mittelpunkt: Wird mitgeschrieben, was geschieht — und
 * überdauert der Eintrag das, worüber er berichtet?
 */

const JETZT = 10_000;
let stadtId: string;
let userId: string;

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

async function haus(name: string): Promise<string> {
	const id = randomUUID();
	await Dynasty.create({ id, name, UserId: userId, foundedAtTick: 0 });
	return id;
}

describe('Die Chronik', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
		userId = randomUUID();
		await User.create({ id: userId, nickname: 'chronik-test', password: 'egal' });
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Event.destroy({ where: {} });
		await Relationship.destroy({ where: {} });
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await Plot.destroy({ where: { ownerType: 'CHARACTER' } });
		await Character.destroy({ where: {} });
		await Dynasty.destroy({ where: {} });
	});

	describe('was mitgeschrieben wird', () => {
		it('eine Hochzeit', async () => {
			const sie = await person('Sie', { role: 'PLAYER' });
			const er = await person('Er', { gender: 'MALE' });
			await relationshipService.changeAffection(sie, er, MARRIAGE_MIN_AFFECTION, JETZT);
			await relationshipService.changeAffection(er, sie, MARRIAGE_MIN_AFFECTION, JETZT);

			await familyService.propose(sie, er);

			const chronik = await chronicleService.getChronicle({ regionId: stadtId });
			expect(chronik[0].kind).toBe('MARRIAGE');
			expect(chronicleMessage(chronik[0])).toBe('Sie und Er haben geheiratet.');
		});

		it('ein Einzug — beim Zusammenziehen nach der Hochzeit', async () => {
			// Wo jemand gewohnt hat, ist eine der wenigen Angaben, die ein ganzes Leben
			// umspannen. Bis 5.3 setzte das Zusammenziehen die Kennung und sonst nichts.
			const plotId = randomUUID();
			await Plot.create({
				id: plotId,
				address: 'Herdgasse 1',
				type: 'BUILDING_LAND',
				RegionId: stadtId,
				ownerType: 'CHARACTER'
			});
			const hausId = randomUUID();
			await Building.create({
				id: hausId,
				name: 'Kate am Wall',
				optionId: 1,
				condition: 100,
				lastConditionTick: JETZT,
				PlotId: plotId,
				ownerType: 'CHARACTER'
			});

			const sie = await person('Sie', { role: 'PLAYER', HomeBuildingId: hausId });
			const er = await person('Er', { gender: 'MALE' });
			await relationshipService.changeAffection(sie, er, MARRIAGE_MIN_AFFECTION, JETZT);
			await relationshipService.changeAffection(er, sie, MARRIAGE_MIN_AFFECTION, JETZT);

			await familyService.propose(sie, er);

			const seins = await chronicleService.getChronicle({ characterId: er });
			const einzug = seins.find((eintrag) => eintrag.kind === 'MOVED_IN');
			expect(einzug).toBeDefined();
			expect(chronicleMessage(einzug!)).toBe('Er wohnt jetzt in Kate am Wall.');
		});

		it('ein Todesfall, mit Alter', async () => {
			const alte = await person('Alte', { birthTick: JETZT - yearsToTicks(71) });

			await lifecycleService.die(alte, JETZT);

			const chronik = await chronicleService.getChronicle({ regionId: stadtId });
			expect(chronicleMessage(chronik[0])).toBe('Alte ist mit 71 Jahren gestorben.');
		});

		it('ein Erbfall — als eigener Eintrag neben dem Tod', async () => {
			const vater = await person('Vater', { gender: 'MALE', money: 100 });
			await person('Kind', {
				birthTick: JETZT - yearsToTicks(20),
				motherId: null,
				fatherId: vater
			});

			await lifecycleService.die(vater, JETZT);

			const chronik = await chronicleService.getChronicle({ regionId: stadtId });
			const arten: string[] = chronik.map((eintrag) => eintrag.kind);
			expect(arten).toContain('DEATH');
			expect(arten).toContain('INHERITANCE');
		});
	});

	describe('was der Eintrag überdauert', () => {
		it('den Tod der Beteiligten', async () => {
			// Der Grund für die fehlenden Fremdschlüssel: Ein Eintrag, der mit seinem
			// Gegenstand verschwindet, ist keine Chronik, sondern eine Zustandsanzeige.
			const tote = await person('Verstorbene');
			await chronicleService.record('DEATH', stadtId, JETZT, { subjectId: tote, value: 60 });
			await Character.destroy({ where: { id: tote } });

			const chronik = await chronicleService.getChronicle({ regionId: stadtId });
			expect(chronik).toHaveLength(1);
			// Der Name ist weg, das Ereignis nicht.
			expect(chronicleMessage(chronik[0])).toBe('jemand ist mit 60 Jahren gestorben.');
		});
	});

	describe('die drei Sichten', () => {
		it('zeigen dieselben Zeilen, gefiltert', async () => {
			const hausId = await haus('Haus Grün');
			const meins = await person('Meiner', { DynastyId: hausId });
			const fremd = await person('Fremder');

			await chronicleService.record('DEATH', stadtId, JETZT, { subjectId: meins, value: 40 });
			await chronicleService.record('DEATH', stadtId, JETZT, { subjectId: fremd, value: 50 });

			expect(await chronicleService.getChronicle({ regionId: stadtId })).toHaveLength(2);
			expect(await chronicleService.getChronicle({ characterId: meins })).toHaveLength(1);
			// Das Haus sieht, was seine Angehörigen betrifft — auch ohne dass es genannt ist.
			expect(await chronicleService.getChronicle({ dynastyId: hausId })).toHaveLength(1);
		});

		it('nehmen auch das mit, woran jemand nur beteiligt war', async () => {
			const brautvater = await person('Brautvater');
			const braut = await person('Braut');
			await chronicleService.record('MARRIAGE', stadtId, JETZT, {
				subjectId: braut,
				objectId: brautvater
			});

			expect(await chronicleService.getChronicle({ characterId: brautvater })).toHaveLength(1);
		});
	});

	describe('die Reihenfolge', () => {
		it('ist das Neueste zuerst', async () => {
			const wer = await person('Wer');
			await chronicleService.record('BIRTH', stadtId, JETZT - 100, { subjectId: wer });
			await chronicleService.record('DEATH', stadtId, JETZT, { subjectId: wer, value: 2 });

			const chronik = await chronicleService.getChronicle({ regionId: stadtId });
			expect(chronik.map((eintrag) => eintrag.kind)).toEqual(['DEATH', 'BIRTH']);
		});
	});
});
