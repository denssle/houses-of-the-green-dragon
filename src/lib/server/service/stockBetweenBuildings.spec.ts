import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Plot } from '$lib/db/model/plot';
import { BuildingStock } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { acceptedGoods } from '$lib/game/building.logic';
import { yearsToTicks } from '$lib/game/time';
import * as buildingService from '$lib/server/service/buildingService';
import * as tradeService from '$lib/server/service/tradeService';

/**
 * 0.8.0 — Ware liegt dort, wo sie gebraucht wird: Holz in der Zimmerei, nicht Brot.
 */

const JETZT = 50_000;
const ZIMMEREI = 9;
let stadtId: string;
let zaehler = 0;

async function person(): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: `Handwerker${++zaehler}`,
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

async function haus(ownerId: string, optionId: number): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Werkgasse ${++zaehler}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: ownerId
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: `Haus${zaehler}`,
		optionId,
		condition: 100,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: ownerId
	});
	return id;
}

async function imLager(buildingId: string, itemId: string): Promise<number> {
	return (
		(await BuildingStock.findOne({ where: { BuildingId: buildingId, itemId } }))?.dataValues
			.quantity ?? 0
	);
}

describe('Was ein Betrieb einlagert (0.8.0)', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
	});

	it('folgt den Rezepten: Die Zimmerei nimmt Holz und Bretter', () => {
		const vorlage = buildingService.getBuildingOption(ZIMMEREI)!;

		expect(acceptedGoods(vorlage)).toEqual(['WOOD', 'PLANK']);
	});

	it('legt Wohnhäusern und Höfen keine Beschränkung auf', () => {
		expect(acceptedGoods(buildingService.getBuildingOption(1)!)).toBeNull();
		expect(
			acceptedGoods(buildingService.getBuildingOption(buildingService.HOF_OPTION_ID)!)
		).toBeNull();
	});

	it('nimmt kein Brot in die Zimmerei, aber Holz', async () => {
		const id = await person();
		const zimmerei = await haus(id, ZIMMEREI);
		await Inventory.create({ CharacterId: id, itemId: 'BREAD', quantity: 3 });
		await Inventory.create({ CharacterId: id, itemId: 'WOOD', quantity: 3 });

		expect(await tradeService.moveToStock(id, zimmerei, 'BREAD', 1)).toEqual({
			ok: false,
			reason: 'WRONG_GOODS'
		});
		expect(await tradeService.moveToStock(id, zimmerei, 'WOOD', 2)).toEqual({ ok: true });
		expect(await imLager(zimmerei, 'WOOD')).toBe(2);
	});

	it('lässt herausnehmen, was schon im Lager liegt, auch Brot', async () => {
		const id = await person();
		const zimmerei = await haus(id, ZIMMEREI);
		await BuildingStock.create({ BuildingId: zimmerei, itemId: 'BREAD', quantity: 2 });

		expect(await tradeService.moveToStock(id, zimmerei, 'BREAD', -2)).toEqual({ ok: true });
	});

	it('holt Holz aus dem eigenen Hof herüber', async () => {
		const id = await person();
		const hof = await haus(id, buildingService.HOF_OPTION_ID);
		const zimmerei = await haus(id, ZIMMEREI);
		await BuildingStock.create({ BuildingId: hof, itemId: 'WOOD', quantity: 35 });

		expect(await tradeService.moveBetweenBuildings(id, hof, zimmerei, 'WOOD', 30)).toEqual({
			ok: true
		});

		expect(await imLager(hof, 'WOOD')).toBe(5);
		expect(await imLager(zimmerei, 'WOOD')).toBe(30);
	});

	it('zeigt der Zimmerei das Holz im Hof, nicht das Brot im Haus', async () => {
		const id = await person();
		const hof = await haus(id, buildingService.HOF_OPTION_ID);
		const wohnhaus = await haus(id, 1);
		const zimmerei = await haus(id, ZIMMEREI);
		await BuildingStock.create({ BuildingId: hof, itemId: 'WOOD', quantity: 35 });
		await BuildingStock.create({ BuildingId: wohnhaus, itemId: 'BREAD', quantity: 9 });

		const anderswo = await tradeService.getStockElsewhere(id, zimmerei);

		expect(anderswo.map((posten) => [posten.buildingId, posten.itemId])).toEqual([[hof, 'WOOD']]);
	});

	it('bringt nichts in fremde Häuser und holt nichts aus ihnen', async () => {
		const ich = await person();
		const fremd = await person();
		const meins = await haus(ich, ZIMMEREI);
		const seins = await haus(fremd, buildingService.HOF_OPTION_ID);
		await BuildingStock.create({ BuildingId: seins, itemId: 'WOOD', quantity: 5 });

		expect(await tradeService.moveBetweenBuildings(ich, seins, meins, 'WOOD', 1)).toEqual({
			ok: false,
			reason: 'PLOT_NOT_OWNED'
		});
		expect(await imLager(seins, 'WOOD')).toBe(5);
	});

	it('kann nicht mehr bewegen, als da ist', async () => {
		const id = await person();
		const hof = await haus(id, buildingService.HOF_OPTION_ID);
		const zimmerei = await haus(id, ZIMMEREI);
		await BuildingStock.create({ BuildingId: hof, itemId: 'WOOD', quantity: 2 });

		expect(await tradeService.moveBetweenBuildings(id, hof, zimmerei, 'WOOD', 3)).toEqual({
			ok: false,
			reason: 'NOT_IN_STOCK'
		});
		expect(await imLager(hof, 'WOOD')).toBe(2);
		expect(await imLager(zimmerei, 'WOOD')).toBe(0);
	});
});
