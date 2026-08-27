import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import type { Transaction } from 'sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as buildingService from '$lib/server/service/buildingService';
import * as tradeService from '$lib/server/service/tradeService';
import { CONDITION_MAX } from '$lib/game/building.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Der Holzberg (5.67).
 *
 * **Ernte, die niemand kaufen kann, ist kein Vermögen.** Seit 5.25 bleibt sie auf dem
 * Hof, und das ist richtig — aber der Marktstand griff bis hierher nur ins Inventar. Ein
 * Pächter, dessen Werkstatt zur Ruine gefallen war, erntete deshalb Tick für Tick auf
 * einen Haufen ohne Ausgang: Im Messlauf zu 5.66 lagen am Ende 3082 Stämme in einem Hof,
 * und ihr Besitzer hatte null Münzen.
 */

const JETZT = 10_000;
const MARKTPLATZ = 6;
let stadtId: string;
let marktId: string;

async function person(geld: number): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: 'Pächter',
		role: 'PLAYER',
		gender: 'MALE',
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

/** Ein Hof mit Ernte darin — das Gebäude, das die Falle stellte. */
async function hofMitErnte(besitzerId: string, holz: number): Promise<string> {
	const grund = randomUUID();
	await Plot.create({
		id: grund,
		address: 'Eichwald 1',
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});

	const id = randomUUID();
	await Building.create({
		id,
		name: 'Hof am Eichwald 1',
		optionId: buildingService.HOF_OPTION_ID,
		condition: CONDITION_MAX,
		lastConditionTick: JETZT,
		PlotId: grund,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	await sequelize.transaction(async (t: Transaction) => {
		await tradeService.changeBuildingStock(id, 'WOOD', holz, t);
	});
	return id;
}

describe('Der Holzberg', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
		const haeuser = await Building.findAll();
		marktId = haeuser.find((h) => h.dataValues.optionId === MARKTPLATZ)!.dataValues.id;
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await ShopOffer.destroy({ where: {} });
		await Character.destroy({ where: { role: 'PLAYER' } });
	});

	it('bietet am Markt an, was im eigenen Hof liegt', async () => {
		const paechter = await person(50);
		const hof = await hofMitErnte(paechter, 300);

		expect(await tradeService.placeOffer(paechter, marktId, 'WOOD', 200, 5)).toEqual({ ok: true });

		// Die Ware ist aus dem Hof heraus und hängt am Markt.
		const angebot = await ShopOffer.findOne({ where: { SellerCharacterId: paechter } });
		expect(angebot?.dataValues.quantity).toBe(200);
		const imHof = await BuildingStock.findOne({ where: { BuildingId: hof, itemId: 'WOOD' } });
		expect(imHof?.dataValues.quantity).toBe(100);
	});

	it('bietet nicht mehr an, als ihm insgesamt gehört', async () => {
		const paechter = await person(50);
		await hofMitErnte(paechter, 10);

		expect(await tradeService.placeOffer(paechter, marktId, 'WOOD', 11, 5)).toEqual({
			ok: false,
			reason: 'NOT_IN_STOCK'
		});
	});
});
