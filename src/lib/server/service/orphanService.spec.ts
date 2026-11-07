import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Inventory } from '$lib/db/model/inventory';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { WAISENHAUS_OPTION_ID } from '$lib/game/guardianship.logic';
import { yearsToTicks } from '$lib/game/time';
import * as buildingService from '$lib/server/service/buildingService';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as householdService from '$lib/server/service/householdService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as npcService from '$lib/server/service/npcService';
import * as orphanService from '$lib/server/service/orphanService';

/**
 * 0.7.0 — die Lehren aus der Hungersnot von Grünau: Waisen kommen zur Familie oder ins
 * Waisenhaus, die Stadt bezahlt dort ihr Brot, und Tote geben ihre Stelle zurück.
 */

const JETZT = 30_000;
let stadtId: string;
let waisenhausId: string;
let dachId: string;
let backstubeId: string;
let zaehler = 0;

async function haus(residents = 'Wohnhaus'): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Waisenweg ${++zaehler}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CITY'
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: residents,
		optionId: 1,
		condition: 100,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CITY'
	});
	return id;
}

async function mensch(alter: number, extras: Record<string, unknown> = {}): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: `Mensch${++zaehler}`,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(alter),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 0,
		RegionId: stadtId,
		...extras
	});
	return id;
}

/** Tote Eltern, wie sie eine Waise hat. */
async function toteEltern(extras: Record<string, unknown> = {}) {
	const motherId = await mensch(40, { deathTick: JETZT - 10, ...extras });
	const fatherId = await mensch(40, { deathTick: JETZT - 10, ...extras });
	return { motherId, fatherId };
}

async function frisch(id: string) {
	return (await Character.findByPk(id))!.dataValues;
}

async function brotAmMarkt(menge: number, preis = 4): Promise<string> {
	const sellerId = await mensch(40, { HomeBuildingId: dachId });
	await ShopOffer.create({
		id: randomUUID(),
		BuildingId: backstubeId,
		SellerCharacterId: sellerId,
		itemId: 'BREAD',
		quantity: menge,
		pricePerUnit: preis
	});
	return sellerId;
}

describe('Waisen (0.7.0)', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
		waisenhausId = (await Building.findOne({ where: { optionId: WAISENHAUS_OPTION_ID } }))!
			.dataValues.id;
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await ShopOffer.destroy({ where: {} });
		await BuildingStock.destroy({ where: { BuildingId: waisenhausId } });
		await Inventory.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 1000 }, { where: { id: stadtId } });
		dachId = await haus();
		backstubeId = await haus('Laden');
	});

	it('das Waisenhaus steht in jeder neuen Welt, und Erwachsene ziehen dort nicht ein', async () => {
		expect(await buildingService.freierWohnraum(waisenhausId)).toBeNull();

		const obdachlos = await mensch(30);
		const versuch = await buildingService.moveInto(obdachlos, waisenhausId);
		expect(versuch.ok).toBe(false);
	});

	it('lässt ein Kind mit einem lebenden Elternteil in Ruhe', async () => {
		const mutter = await mensch(30, { HomeBuildingId: dachId });
		const kind = await mensch(5, { motherId: mutter, HomeBuildingId: dachId });

		await orphanService.careForOrphans(stadtId, JETZT);

		expect((await frisch(kind)).guardianId).toBeNull();
		expect((await frisch(kind)).HomeBuildingId).toBe(dachId);
	});

	it('gibt eine Waise zur Tante, und die sorgt für sie', async () => {
		const oma = await mensch(70, { deathTick: JETZT - 100 });
		const eltern = await toteEltern({ motherId: oma });
		const tante = await mensch(38, { motherId: oma, HomeBuildingId: dachId, money: 100 });
		await Inventory.create({ CharacterId: tante, itemId: 'BREAD', quantity: 3 });
		const kind = await mensch(5, eltern);

		const bericht = await orphanService.careForOrphans(stadtId, JETZT);

		expect(bericht.fostered).toEqual([{ child: kind, guardian: tante }]);
		expect(await frisch(kind)).toMatchObject({ guardianId: tante, HomeBuildingId: dachId });

		const haushalt = await householdService.haushaltVon(await frisch(kind), JETZT);
		expect(haushalt.brotBei).toBe(tante);
		expect(await householdService.darfArbeiten(await frisch(kind), JETZT)).toBe(false);
	});

	it('nimmt keinen Verwandten ohne Platz, dann eben das Waisenhaus', async () => {
		const voll = await haus();
		for (let i = 0; i < 4; i++) await mensch(30, { HomeBuildingId: voll });
		const eltern = await toteEltern();
		const bruder = await mensch(20, { ...eltern, HomeBuildingId: voll });
		await mensch(5, { ...eltern });
		await mensch(5, { ...eltern });

		const bericht = await orphanService.careForOrphans(stadtId, JETZT);

		expect(bericht.fostered).toEqual([]);
		expect(bericht.admitted).toHaveLength(2);
		expect((await frisch(bruder)).guardianId).toBeNull();
	});

	it('nimmt eine Dreizehnjährige auf, wie die, die im November verhungert ist', async () => {
		const kind = await mensch(13, await toteEltern());

		await orphanService.careForOrphans(stadtId, JETZT);

		expect((await frisch(kind)).HomeBuildingId).toBe(waisenhausId);
	});

	it('die Stadt kauft Brot, und das Geld kommt beim Bäcker an', async () => {
		const kind = await mensch(6, { ...(await toteEltern()), satiety: 30 });
		const baecker = await brotAmMarkt(5);

		const bericht = await orphanService.careForOrphans(stadtId, JETZT);

		expect(bericht).toMatchObject({ bought: 2, spent: 8, meals: 1, unfed: 0 });
		expect((await frisch(kind)).satiety).toBe(70);
		expect((await frisch(baecker)).money).toBe(8);
		expect((await Region.findByPk(stadtId))!.dataValues.treasury).toBe(992);
		expect(
			(await ShopOffer.findOne({ where: { SellerCharacterId: baecker } }))!.dataValues.quantity
		).toBe(3);
	});

	it('meldet, wenn am Markt kein Brot liegt, statt es zu verschweigen', async () => {
		await mensch(6, { ...(await toteEltern()), satiety: 30 });

		const bericht = await orphanService.careForOrphans(stadtId, JETZT);

		expect(bericht).toMatchObject({ bought: 0, meals: 0, unfed: 1 });
	});

	it('kauft nicht über die Kasse hinaus', async () => {
		await Region.update({ treasury: 5 }, { where: { id: stadtId } });
		await mensch(6, { ...(await toteEltern()), satiety: 30 });
		await brotAmMarkt(5);

		const bericht = await orphanService.careForOrphans(stadtId, JETZT);

		expect(bericht).toMatchObject({ bought: 1, spent: 4 });
		expect((await Region.findByPk(stadtId))!.dataValues.treasury).toBe(1);
	});

	it('holt ein Mündel ins Waisenhaus, wenn beim Vormund nichts zu essen ist', async () => {
		const vormund = await mensch(30, { HomeBuildingId: dachId });
		const kind = await mensch(6, {
			...(await toteEltern()),
			guardianId: vormund,
			HomeBuildingId: dachId,
			satiety: 20
		});

		const bericht = await orphanService.careForOrphans(stadtId, JETZT);

		expect(bericht.admitted).toEqual([kind]);
		expect(await frisch(kind)).toMatchObject({ guardianId: null, HomeBuildingId: waisenhausId });
	});

	it('lässt ein hungriges Mündel beim Vormund, solange dort Brot liegt', async () => {
		const vormund = await mensch(30, { HomeBuildingId: dachId });
		await Inventory.create({ CharacterId: vormund, itemId: 'BREAD', quantity: 1 });
		const kind = await mensch(6, {
			...(await toteEltern()),
			guardianId: vormund,
			HomeBuildingId: dachId,
			satiety: 20
		});

		await orphanService.careForOrphans(stadtId, JETZT);

		expect((await frisch(kind)).guardianId).toBe(vormund);
	});

	it('sucht neu, wenn der Vormund stirbt', async () => {
		const oma = await mensch(70, { deathTick: JETZT - 100 });
		const eltern = await toteEltern({ motherId: oma });
		const tot = await mensch(50, { motherId: oma, deathTick: JETZT - 1 });
		const onkel = await mensch(45, { motherId: oma, HomeBuildingId: dachId });
		const kind = await mensch(6, { ...eltern, guardianId: tot });

		await orphanService.careForOrphans(stadtId, JETZT);

		expect((await frisch(kind)).guardianId).toBe(onkel);
	});

	it('entlässt mit sechzehn aus Waisenhaus und Vormundschaft', async () => {
		const eltern = await toteEltern();
		const ausDemHeim = await mensch(16, { ...eltern, HomeBuildingId: waisenhausId });
		const vormund = await mensch(40, { HomeBuildingId: dachId });
		const beimVormund = await mensch(16, {
			...eltern,
			guardianId: vormund,
			HomeBuildingId: dachId
		});

		await orphanService.careForOrphans(stadtId, JETZT);

		expect(await frisch(ausDemHeim)).toMatchObject({ guardianId: null, HomeBuildingId: null });
		expect(await frisch(beimVormund)).toMatchObject({ guardianId: null, HomeBuildingId: dachId });
	});

	it('ein Kind im Waisenhaus muss nicht für sein Brot arbeiten', async () => {
		const kind = await mensch(8, { ...(await toteEltern()), HomeBuildingId: waisenhausId });

		expect(await householdService.darfArbeiten(await frisch(kind), JETZT)).toBe(false);
	});

	it('der Vormund kauft Brot für sein Mündel', async () => {
		await brotAmMarkt(5, 1);
		const vormund = await mensch(30, { HomeBuildingId: dachId, money: 200, satiety: 100 });
		await mensch(6, {
			...(await toteEltern()),
			guardianId: vormund,
			HomeBuildingId: dachId,
			satiety: 10
		});

		await npcService.actForNpcs(JETZT);

		const kammer = await Inventory.findOne({ where: { CharacterId: vormund, itemId: 'BREAD' } });
		expect(kammer?.dataValues.quantity ?? 0).toBeGreaterThan(0);
	});
});

describe('Die Stelle eines Toten wird frei (0.7.0)', () => {
	it('beendet den Vertrag und schreibt es in die Chronik', async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		const betrieb = await haus();
		const arbeiterin = await mensch(40);
		await Employment.create({
			EmployeeCharacterId: arbeiterin,
			BuildingId: betrieb,
			wagePerActionPoint: 3,
			sinceTick: JETZT - 10
		});

		await lifecycleService.die(arbeiterin, JETZT);

		expect(await Employment.count({ where: { BuildingId: betrieb } })).toBe(0);
		const chronik = await chronicleService.getChronicle({ characterId: arbeiterin });
		expect(chronik.some((zeile) => zeile.kind === 'JOB_ENDED' && zeile.detail === 'DEATH')).toBe(
			true
		);
	});
});
