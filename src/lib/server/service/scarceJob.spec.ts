import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Plot } from '$lib/db/model/plot';
import { BuildingStock } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as employmentService from '$lib/server/service/employmentService';
import * as npcService from '$lib/server/service/npcService';
import { TAGELOHN } from '$lib/game/economy';
import { yearsToTicks } from '$lib/game/time';

/**
 * Umsatteln, wo die Stadt Hände braucht (5.99, Punkt 115).
 *
 * Die Logik prüft `npc.logic.spec.ts`, den Wechsel selbst `employmentService.spec.ts`.
 * Hier geht es um den Weg dazwischen: Sieht ein NPC in der echten Lageaufnahme, dass
 * nebenan eine Bäckerei Leute sucht, während die Stadt kein Brot hat — und geht er hin?
 */

const JETZT = 10_000;
const ZIMMEREI = 9;
const BAECKEREI = 5;
let stadtId: string;

async function person(name: string, geld: number, rolle: 'NPC' | 'PLAYER'): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: rolle,
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: geld,
		RegionId: stadtId
	});
	return id;
}

async function betrieb(optionId: number, besitzerId: string): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Werkgasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: `Betrieb ${optionId}`,
		optionId,
		level: 1,
		condition: 100,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	return id;
}

/** Ein Geselle in der Zimmerei, und nebenan eine Bäckerei mit Aushang. */
async function lage(baeckerGeld: number): Promise<{ geselle: string; backstube: string }> {
	// Die Besitzer sind Spieler: Ihr Zug gehört nicht zu dem, was hier geprüft wird.
	const zimmermeisterin = await person('Zimmermeisterin', 500, 'PLAYER');
	const saegewerk = await betrieb(ZIMMEREI, zimmermeisterin);
	await employmentService.offerJob(zimmermeisterin, saegewerk, TAGELOHN);

	const geselle = await person('Geselle', 50, 'NPC');
	expect(await employmentService.takeJob(geselle, saegewerk)).toEqual({ ok: true });

	const baeckerin = await person('Bäckerin', baeckerGeld, 'PLAYER');
	const backstube = await betrieb(BAECKEREI, baeckerin);
	await employmentService.offerJob(baeckerin, backstube, TAGELOHN);
	return { geselle, backstube };
}

describe('Umsatteln, wo die Stadt Hände braucht (5.99)', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Employment.destroy({ where: {} });
		await BuildingStock.destroy({ where: {} });
		await Building.destroy({ where: { optionId: [ZIMMEREI, BAECKEREI] } });
		// Die Einwohner der Startwelt gehen mit: Sie zählen beim Brotbedarf mit, und der
		// soll hier nur an den Personen dieses Tests hängen.
		await Character.destroy({ where: {} });
	});

	it('wechselt aus der Zimmerei in die Bäckerei, wenn Brot fehlt', async () => {
		const { geselle, backstube } = await lage(500);

		const ausgang = await npcService.ausfuehren(geselle, JETZT);

		expect(ausgang.action).toBe('TAKE_JOB');
		expect((await employmentService.getJobOf(geselle))?.buildingId).toBe(backstube);
	});

	it('bleibt, wenn die Stadt versorgt ist', async () => {
		const { geselle, backstube } = await lage(500);
		await BuildingStock.create({ BuildingId: backstube, itemId: 'BREAD', quantity: 500 });

		await npcService.ausfuehren(geselle, JETZT);

		expect((await employmentService.getJobOf(geselle))?.buildingId).not.toBe(backstube);
	});

	it('bleibt, wenn die Bäckerin ihn nicht bezahlen könnte', async () => {
		// Ein Wechsel in einen Betrieb, der nicht zahlt, ist ein Absturz.
		const { geselle, backstube } = await lage(5);

		await npcService.ausfuehren(geselle, JETZT);

		expect((await employmentService.getJobOf(geselle))?.buildingId).not.toBe(backstube);
	});
});
