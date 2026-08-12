import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character as CharacterModel } from '$lib/db/model/character';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as characterService from '$lib/server/service/characterService';
import * as worldService from '$lib/server/service/worldService';
import { MAX_ACTION_POINTS, MS_PER_TICK } from '$lib/game/time';

/**
 * Phase 4.1 gegen die Datenbank. Der Kern: Ein Serverausfall darf niemandem etwas
 * schenken und niemandem etwas nehmen.
 */

const START = new Date('2026-08-12T12:00:00Z');
let stadtId: string;

/** Setzt die Weltuhr auf einen bekannten Stand zurück. */
async function weltzeit(tick: number, lastTickAt: Date): Promise<void> {
	await World.update({ currentTick: tick, lastTickAt }, { where: { id: WORLD_ID } });
}

async function charakter(actionPoints: number, lastTickProcessed: number): Promise<string> {
	const id = randomUUID();
	await CharacterModel.create({
		id,
		firstName: 'Adelbert',
		role: 'PLAYER',
		gender: 'MALE',
		birthTick: 0,
		lastTickProcessed,
		actionPoints,
		money: 0,
		RegionId: stadtId
	});
	return id;
}

async function stand(id: string) {
	const gefunden = await CharacterModel.findByPk(id);
	return gefunden!.dataValues;
}

describe('Weltzeit', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await CharacterModel.destroy({ where: { role: 'PLAYER' } });
		await weltzeit(1000, START);
	});

	it('stellt die Uhr um die vergangene Echtzeit vor', async () => {
		const geschehen = await worldService.advanceWorld(new Date(START.getTime() + 3 * MS_PER_TICK));

		expect(geschehen?.ticks).toBe(3);
		expect(await worldService.currentTick()).toBe(1003);
	});

	it('rührt sich nicht vor dem ersten vollen Tick', async () => {
		const geschehen = await worldService.advanceWorld(new Date(START.getTime() + 60_000));

		expect(geschehen).toBeNull();
		expect(await worldService.currentTick()).toBe(1000);
	});

	describe('nach einem Ausfall', () => {
		it('überspringt die verpasste Zeit, als wäre sie nicht gewesen', async () => {
			const adelbert = await charakter(5, 1000);

			// Drei Tage aus: 72 Ticks, 71 davon verpasst.
			await worldService.advanceWorld(new Date(START.getTime() + 72 * MS_PER_TICK));

			// Nur der eine gelebte Tick wächst nach — nicht 72.
			expect((await stand(adelbert)).lastTickProcessed).toBe(1071);
			const geladen = await characterService.getCharacter(adelbert);
			expect(geladen?.actionPoints).toBe(6);
		});

		it('nimmt niemandem, was er sich bei laufendem Server angesammelt hat', async () => {
			// Zwanzig Stunden nicht hereingeschaut, während der Server lief.
			const adelbert = await charakter(0, 980);

			// Danach fünf Stunden Ausfall: vier verpasste Ticks.
			await worldService.advanceWorld(new Date(START.getTime() + 5 * MS_PER_TICK));

			// Verschoben wird **um** die Ausfallzeit, nicht **auf** die neue Weltzeit: Die
			// zwanzig rechtmäßig angesammelten Ticks bleiben stehen, die vier verpassten
			// sind weg.
			expect((await stand(adelbert)).lastTickProcessed).toBe(984);
			const geladen = await characterService.getCharacter(adelbert);
			expect(geladen?.actionPoints).toBe(21);
		});

		it('lässt bei laufendem Server jeden Tick zählen', async () => {
			const adelbert = await charakter(10, 1000);

			// Stunde um Stunde, wie es der Takt tut.
			for (let i = 1; i <= 5; i++) {
				await worldService.advanceWorld(new Date(START.getTime() + i * MS_PER_TICK));
			}

			expect((await stand(adelbert)).lastTickProcessed).toBe(1000);
			const geladen = await characterService.getCharacter(adelbert);
			expect(geladen?.actionPoints).toBe(15);
		});
	});

	describe('Nachwachsen beim Laden', () => {
		it('schreibt den neuen Stand fort', async () => {
			const adelbert = await charakter(10, 1000);
			await weltzeit(1020, START);

			await characterService.getCharacter(adelbert);

			const danach = await stand(adelbert);
			expect(danach.actionPoints).toBe(30);
			expect(danach.lastTickProcessed).toBe(1020);
		});

		it('deckelt den Vorrat', async () => {
			const adelbert = await charakter(10, 1000);
			await weltzeit(1000 + 5 * MAX_ACTION_POINTS, START);

			const geladen = await characterService.getCharacter(adelbert);

			expect(geladen?.actionPoints).toBe(MAX_ACTION_POINTS);
		});

		it('ändert nichts, wenn kein Tick vergangen ist', async () => {
			const adelbert = await charakter(10, 1000);

			await characterService.getCharacter(adelbert);

			expect((await stand(adelbert)).actionPoints).toBe(10);
		});
	});
});
