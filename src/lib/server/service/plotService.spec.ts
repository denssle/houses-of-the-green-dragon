import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as plotService from '$lib/server/service/plotService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Was auf einer Grundstücksliste steht (Punkt 80).
 *
 * Die Liste sagte „bebaut" und nannte damit ein Ziel, ohne hinzuführen: Wer sein Haus
 * verkaufen wollte, musste es auf der Stadtübersicht zwischen allen anderen suchen.
 * Dabei ist es dieselbe Abfrage — sie warf den Namen nur weg.
 */

const JETZT = 10_000;
let stadtId: string;

async function person(): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: 'Besitzerin',
		role: 'PLAYER',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 100,
		RegionId: stadtId
	});
	return id;
}

async function grundstueck(besitzerId: string): Promise<string> {
	const id = randomUUID();
	await Plot.create({
		id,
		address: `Baugasse ${id.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	return id;
}

describe('Grundstückslisten', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Building.destroy({ where: {} });
		await Plot.destroy({ where: { ownerType: 'CHARACTER' } });
		await Character.destroy({ where: {} });
	});

	it('nennt das Haus, das auf dem Grundstück steht', async () => {
		const besitzerin = await person();
		const acker = await grundstueck(besitzerin);
		const hausId = randomUUID();
		await Building.create({
			id: hausId,
			name: 'Zimmerei',
			optionId: 9,
			lastConditionTick: JETZT,
			PlotId: acker,
			ownerType: 'CHARACTER',
			OwnerCharacterId: besitzerin
		});

		const liste = await plotService.getPlotsOfCharacter(besitzerin);

		expect(liste).toHaveLength(1);
		expect(liste[0].hasBuilding).toBe(true);
		expect(liste[0].building).toEqual({ id: hausId, name: 'Zimmerei' });
	});

	it('lässt das Feld leer, wo nichts steht', async () => {
		const besitzerin = await person();
		await grundstueck(besitzerin);

		const liste = await plotService.getPlotsOfCharacter(besitzerin);

		expect(liste[0].hasBuilding).toBe(false);
		expect(liste[0].building).toBeNull();
	});
});
