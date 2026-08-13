import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { Plot } from '$lib/db/model/plot';
import { Relationship } from '$lib/db/model/relationship';
import { User } from '$lib/db/model/user';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as familyService from '$lib/server/service/familyService';
import * as relationshipService from '$lib/server/service/relationshipService';
import { MARRIAGE_MIN_AFFECTION, PREGNANCY_TICKS } from '$lib/game/family.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.4 gegen die Datenbank. Im Mittelpunkt: dass eine Ehe zustande kommt, dass
 * Kinder nur dort geboren werden, wo Platz ist, und dass ein Kind im richtigen Haus
 * landet.
 */

const JETZT = 10_000;
let stadtId: string;
let userId: string;

async function person(
	name: string,
	alter: number,
	extras: Record<string, unknown> = {}
): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(alter),
		lastTickProcessed: JETZT,
		actionPoints: 48,
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

/** Ein Wohnhaus mit vier Plätzen, auf einem eigenen Grundstück. */
async function wohnhaus(besitzerId: string): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Wohngasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: 'Wohnhaus',
		optionId: 1,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	return id;
}

async function stand(id: string) {
	return (await Character.findByPk(id))!.dataValues;
}

/** Verliebt beide ineinander, so weit es fürs Heiraten reicht. */
async function verlieben(a: string, b: string): Promise<void> {
	await relationshipService.changeAffection(a, b, MARRIAGE_MIN_AFFECTION, JETZT);
	await relationshipService.changeAffection(b, a, MARRIAGE_MIN_AFFECTION, JETZT);
}

describe('Familie', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
		userId = randomUUID();
		await User.create({ id: userId, nickname: 'familie-test', password: 'egal' });
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Relationship.destroy({ where: {} });
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await Plot.destroy({ where: { ownerType: 'CHARACTER' } });
		await Character.destroy({ where: {} });
		await Dynasty.destroy({ where: {} });
	});

	describe('der Antrag', () => {
		it('führt bei einem NPC sofort zur Ehe', async () => {
			// Ein NPC, der auf eine Antwort warten ließe, wäre nur eine Verzögerung.
			const sie = await person('Sie', 25, { role: 'PLAYER' });
			const er = await person('Er', 27, { gender: 'MALE' });
			await verlieben(sie, er);

			expect(await familyService.propose(sie, er)).toEqual({ ok: true, married: true });
			expect((await stand(sie)).spouseId).toBe(er);
			expect((await stand(er)).spouseId).toBe(sie);
		});

		it('bleibt bei einem Spieler liegen, bis er annimmt', async () => {
			const sie = await person('Sie', 25, { role: 'PLAYER' });
			const er = await person('Er', 27, { gender: 'MALE', role: 'PLAYER' });
			await verlieben(sie, er);

			await familyService.propose(sie, er);

			expect((await stand(sie)).spouseId).toBeNull();
			expect((await stand(sie)).proposedToId).toBe(er);

			expect(await familyService.acceptProposal(er, sie)).toEqual({ ok: true });
			expect((await stand(er)).spouseId).toBe(sie);
			expect((await stand(sie)).proposedToId).toBeNull();
		});

		it('scheitert ohne genug Zuneigung', async () => {
			const sie = await person('Sie', 25, { role: 'PLAYER' });
			const er = await person('Er', 27, { gender: 'MALE' });

			expect(await familyService.propose(sie, er)).toEqual({
				ok: false,
				reason: 'TOO_LITTLE_AFFECTION'
			});
		});

		it('lässt sich nicht ohne Antrag annehmen', async () => {
			const sie = await person('Sie', 25);
			const er = await person('Er', 27, { gender: 'MALE' });

			expect(await familyService.acceptProposal(er, sie)).toEqual({
				ok: false,
				reason: 'NO_PROPOSAL'
			});
		});

		it('prüft bei der Annahme noch einmal alles', async () => {
			// Zwischen Antrag und Annahme können Jahre liegen — und ein Ja-Wort.
			const sie = await person('Sie', 25, { role: 'PLAYER' });
			const er = await person('Er', 27, { gender: 'MALE', role: 'PLAYER' });
			await verlieben(sie, er);
			await familyService.propose(sie, er);

			const dazwischen = await person('Dazwischen', 24, { gender: 'MALE' });
			await Character.update({ spouseId: dazwischen }, { where: { id: sie } });

			expect(await familyService.acceptProposal(er, sie)).toEqual({
				ok: false,
				reason: 'ALREADY_MARRIED'
			});
		});

		it('weist Geschwister ab', async () => {
			const mutter = await person('Mutter', 50);
			const sie = await person('Sie', 25, { motherId: mutter, role: 'PLAYER' });
			const er = await person('Er', 27, { gender: 'MALE', motherId: mutter });
			await verlieben(sie, er);

			expect(await familyService.propose(sie, er)).toEqual({
				ok: false,
				reason: 'CLOSE_KIN'
			});
		});
	});

	describe('Kinder', () => {
		/** Ein verheiratetes Paar mit Dach über dem Kopf. */
		async function paar(extras: Record<string, unknown> = {}) {
			const sie = await person('Sie', 25, extras);
			const er = await person('Er', 27, { gender: 'MALE', ...extras });
			const heim = await wohnhaus(sie);
			await Character.update({ spouseId: er, HomeBuildingId: heim }, { where: { id: sie } });
			await Character.update({ spouseId: sie, HomeBuildingId: heim }, { where: { id: er } });
			return { sie, er, heim };
		}

		it('werden empfangen und nach der Zeit geboren', async () => {
			const { sie } = await paar();

			await familyService.advanceFamilies(JETZT, () => 0);
			expect((await stand(sie)).pregnantSinceTick).toBe(JETZT);

			// Zu früh: noch nichts.
			await familyService.advanceFamilies(JETZT + PREGNANCY_TICKS - 1, () => 0.99);
			expect(await Character.count()).toBe(2);

			const spaeter = await familyService.advanceFamilies(JETZT + PREGNANCY_TICKS, () => 0.99);
			expect(spaeter.births).toHaveLength(1);
			expect((await stand(sie)).pregnantSinceTick).toBeNull();
		});

		it('bekommen Mutter und Vater eingetragen', async () => {
			const { sie, er } = await paar();
			await familyService.advanceFamilies(JETZT, () => 0);

			const { births } = await familyService.advanceFamilies(JETZT + PREGNANCY_TICKS, () => 0.99);
			const kind = await stand(births[0].childId);

			expect(kind.motherId).toBe(sie);
			expect(kind.fatherId).toBe(er);
			expect(kind.birthTick).toBe(JETZT + PREGNANCY_TICKS);
		});

		it('ziehen ins Haus der Mutter', async () => {
			const { heim } = await paar();
			await familyService.advanceFamilies(JETZT, () => 0);

			const { births } = await familyService.advanceFamilies(JETZT + PREGNANCY_TICKS, () => 0.99);

			expect((await stand(births[0].childId)).HomeBuildingId).toBe(heim);
		});

		/** Die Rückkopplung: Kinder kommen nur, wo Platz ist. */
		it('bleiben aus, wenn das Haus voll ist', async () => {
			const { sie, heim } = await paar();
			// Vier Plätze, zwei belegt — zwei Kinder dazu, dann ist Schluss.
			await person('Erstes', 5, { HomeBuildingId: heim });
			await person('Zweites', 3, { HomeBuildingId: heim });

			await familyService.advanceFamilies(JETZT, () => 0);

			expect((await stand(sie)).pregnantSinceTick).toBeNull();
		});

		it('bleiben Obdachlosen versagt', async () => {
			const sie = await person('Sie', 25);
			const er = await person('Er', 27, { gender: 'MALE' });
			await Character.update({ spouseId: er }, { where: { id: sie } });

			await familyService.advanceFamilies(JETZT, () => 0);

			expect((await stand(sie)).pregnantSinceTick).toBeNull();
		});

		it('kommen wieder, wenn im Haus Platz wird', async () => {
			const { sie, heim } = await paar();
			const gast = await person('Gast', 60, { HomeBuildingId: heim });
			await person('Kind', 3, { HomeBuildingId: heim });

			await familyService.advanceFamilies(JETZT, () => 0);
			expect((await stand(sie)).pregnantSinceTick).toBeNull();

			// Der Gast stirbt — sein Platz wird frei.
			await Character.update({ deathTick: JETZT }, { where: { id: gast } });
			await familyService.advanceFamilies(JETZT + 1, () => 0);

			expect((await stand(sie)).pregnantSinceTick).toBe(JETZT + 1);
		});

		it('fallen dem Haus zu, das da ist', async () => {
			const hausId = await haus('Haus Adler');
			const { sie } = await paar({ DynastyId: hausId });
			await familyService.advanceFamilies(JETZT, () => 0);

			const { births } = await familyService.advanceFamilies(JETZT + PREGNANCY_TICKS, () => 0.99);

			expect((await stand(births[0].childId)).DynastyId).toBe(hausId);
			expect((await stand(sie)).DynastyId).toBe(hausId);
		});

		it('wachsen ohne Haus als Fremde auf', async () => {
			await paar();
			await familyService.advanceFamilies(JETZT, () => 0);

			const { births } = await familyService.advanceFamilies(JETZT + PREGNANCY_TICKS, () => 0.99);

			expect((await stand(births[0].childId)).DynastyId).toBeNull();
		});
	});

	describe('der Stammbaum', () => {
		it('führt auch die Toten', async () => {
			// Ein Stammbaum, der nur die Lebenden zeigt, ist eine Anwesenheitsliste.
			const hausId = await haus('Haus Adler');
			const ahn = await person('Ahn', 70, { DynastyId: hausId, deathTick: JETZT - 100 });
			const lebend = await person('Lebend', 30, { DynastyId: hausId, motherId: ahn });

			const baum = await familyService.getFamilyTree(hausId, JETZT);

			expect(baum).toHaveLength(2);
			expect(baum.find((m) => m.id === ahn)!.alive).toBe(false);
			expect(baum.find((m) => m.id === lebend)!.motherId).toBe(ahn);
		});

		it('nennt das Alter der Toten zum Todeszeitpunkt', async () => {
			const hausId = await haus('Haus Adler');
			// Mit 70 geboren, gestorben vor zehn Jahren: also mit 60 gestorben.
			const ahn = await person('Ahn', 70, {
				DynastyId: hausId,
				deathTick: JETZT - yearsToTicks(10)
			});

			const baum = await familyService.getFamilyTree(hausId, JETZT);

			expect(baum.find((m) => m.id === ahn)!.age).toBe(60);
		});
	});

	describe('die Bevölkerung', () => {
		it('zählt Lebende, Geburten und Tote', async () => {
			await person('Alt', 60);
			await person('Jung', 3);
			await person('Tot', 50, { deathTick: JETZT - yearsToTicks(1) });

			const zahlen = await familyService.getPopulation(stadtId, JETZT, 5);

			expect(zahlen.living).toBe(2);
			expect(zahlen.children).toBe(1);
			expect(zahlen.births).toBe(1);
			expect(zahlen.deaths).toBe(1);
		});
	});
});
