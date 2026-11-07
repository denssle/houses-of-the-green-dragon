import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Auction } from '$lib/db/model/auction';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Law } from '$lib/db/model/law';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { TICKS_PER_YEAR, yearsToTicks } from '$lib/game/time';
import * as auctionService from '$lib/server/service/auctionService';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as npcService from '$lib/server/service/npcService';
import * as plotService from '$lib/server/service/plotService';

const JETZT = 40_000;
let stadtId: string;
let zaehler = 0;

async function besitzer(money = 0): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: `Besitzer${++zaehler}`,
		role: 'NPC',
		gender: 'MALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money,
		RegionId: stadtId
	});
	return id;
}

async function grundstueck(ownerId: string): Promise<string> {
	const id = randomUUID();
	await Plot.create({
		id,
		address: `Brachweg ${++zaehler}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: ownerId,
		forSalePrice: 50
	});
	return id;
}

describe('Leeren Grund aufgeben (0.8.0)', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
	});

	it('gibt den Boden an die Stadt, und er kommt unter den Hammer', async () => {
		const id = await besitzer();
		const plotId = await grundstueck(id);

		expect(await plotService.giveUpPlot(id, plotId)).toEqual({ ok: true });

		const boden = (await Plot.findByPk(plotId))!.dataValues;
		expect(boden).toMatchObject({
			ownerType: 'CITY',
			OwnerCharacterId: null,
			forSalePrice: null,
			escheatedTick: JETZT
		});
		await auctionService.auctionEscheatedEstates(stadtId, JETZT);
		expect(await Auction.count({ where: { PlotId: plotId, closed: false } })).toBe(1);

		const chronik = await chronicleService.getChronicle({ characterId: id });
		expect(chronik.some((zeile) => zeile.kind === 'PLOT_GIVEN_UP')).toBe(true);
	});

	it('nimmt nur, was einem gehört', async () => {
		const plotId = await grundstueck(await besitzer());

		const ergebnis = await plotService.giveUpPlot(await besitzer(), plotId);

		expect(ergebnis).toEqual({ ok: false, reason: 'PLOT_NOT_OWNED' });
	});

	it('lässt bebauten Boden, wo er ist', async () => {
		const id = await besitzer();
		const plotId = await grundstueck(id);
		await Building.create({
			id: randomUUID(),
			name: 'Wohnhaus',
			optionId: 1,
			condition: 100,
			lastConditionTick: JETZT,
			PlotId: plotId,
			ownerType: 'CHARACTER',
			OwnerCharacterId: id
		});

		const ergebnis = await plotService.giveUpPlot(id, plotId);

		expect(ergebnis).toEqual({ ok: false, reason: 'PLOT_ALREADY_BUILT' });
		expect((await Plot.findByPk(plotId))!.dataValues.OwnerCharacterId).toBe(id);
	});

	it('ein NPC gibt vor dem Termin auf, wenn er nicht zahlen kann', async () => {
		await Law.create({
			id: randomUUID(),
			RegionId: stadtId,
			kind: 'PROPERTY_TAX',
			value: 10,
			enactedTick: JETZT,
			EnactedByCharacterId: null
		});
		await Region.update({ lastTaxTick: JETZT - TICKS_PER_YEAR + 2 }, { where: { id: stadtId } });
		const id = await besitzer(3);
		const plotId = await grundstueck(id);

		await npcService.actForNpcs(JETZT);

		expect((await Plot.findByPk(plotId))!.dataValues.ownerType).toBe('CITY');
	});

	it('und behält den Grund, solange der Termin fern ist', async () => {
		await Region.update({ lastTaxTick: JETZT - 1 }, { where: { id: stadtId } });
		const id = await besitzer(3);
		const plotId = await grundstueck(id);

		await npcService.actForNpcs(JETZT);

		expect((await Plot.findByPk(plotId))!.dataValues.OwnerCharacterId).toBe(id);
	});
});
