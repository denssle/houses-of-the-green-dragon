import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { ALMOSEN_UNTER, armengeld, UNTERKUNFT_OPTION_ID } from '$lib/game/alms.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';
import { yearsToTicks } from '$lib/game/time';
import * as almsService from '$lib/server/service/almsService';
import { stadtRuecklage } from '$lib/server/service/mayorService';
import * as needService from '$lib/server/service/needService';

/**
 * Die Armenspeisung (0.11.0, Punkt 122): Die Stadt kauft Brot am Markt und gibt es an die
 * aus, die hungern und sich nicht selbst helfen können. Das Geld geht an den Verkäufer.
 */

const JETZT = 30_000;
const HUNGRIG = ALMOSEN_UNTER - 10;
let stadtId: string;
let unterkunftId: string;
let ladenId: string;
let zaehler = 0;

async function mensch(extras: Record<string, unknown> = {}): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: `Arme${++zaehler}`,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: HUNGRIG,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 0,
		RegionId: stadtId,
		...extras
	});
	return id;
}

async function brotAmMarkt(menge: number, preis = 4): Promise<string> {
	const sellerId = await mensch({ satiety: 100, money: 0 });
	await ShopOffer.create({
		id: randomUUID(),
		BuildingId: ladenId,
		SellerCharacterId: sellerId,
		itemId: 'BREAD',
		quantity: menge,
		pricePerUnit: preis
	});
	return sellerId;
}

async function werte(id: string) {
	return (await Character.findByPk(id))!.dataValues;
}

async function kasse(): Promise<number> {
	return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
}

describe('Armenspeisung (0.11.0)', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
		unterkunftId = (await Building.findOne({ where: { optionId: UNTERKUNFT_OPTION_ID } }))!
			.dataValues.id;

		const plotId = randomUUID();
		await Plot.create({
			id: plotId,
			address: 'Brotgasse 1',
			type: 'BUILDING_LAND',
			RegionId: stadtId,
			ownerType: 'CITY'
		});
		ladenId = randomUUID();
		await Building.create({
			id: ladenId,
			name: 'Laden',
			optionId: 1,
			condition: 100,
			lastConditionTick: JETZT,
			PlotId: plotId,
			ownerType: 'CITY'
		});
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await ShopOffer.destroy({ where: {} });
		await BuildingStock.destroy({ where: { BuildingId: unterkunftId } });
		await Inventory.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: stadtRuecklage() + 100 }, { where: { id: stadtId } });
	});

	it('speist den Armen und bezahlt den Bäcker', async () => {
		const baecker = await brotAmMarkt(5);
		const arme = await mensch();

		const bericht = await almsService.feedThePoor(stadtId, JETZT);

		expect(bericht).toEqual({ meals: 1, unfed: 0, spent: 4, relieved: 0, paid: 0 });
		expect((await werte(arme)).satiety).toBeGreaterThan(HUNGRIG);
		// Das Geld ist nicht weg, es ist beim Bäcker.
		expect((await werte(baecker)).money).toBe(4);
		expect(await kasse()).toBe(stadtRuecklage() + 96);
	});

	it('lässt aus, wer sich selbst Brot kaufen kann', async () => {
		await brotAmMarkt(5);
		await mensch({ money: 50 });

		expect((await almsService.feedThePoor(stadtId, JETZT)).meals).toBe(0);
	});

	it('lässt aus, wer Brot daheim hat', async () => {
		await brotAmMarkt(5);
		const arme = await mensch();
		await sequelize.transaction((t) => needService.changeStock(arme, 'BREAD', 1, t));

		expect((await almsService.feedThePoor(stadtId, JETZT)).meals).toBe(0);
	});

	it('lässt aus, wer noch nicht geschwächt ist', async () => {
		await brotAmMarkt(5);
		await mensch({ satiety: ALMOSEN_UNTER });

		expect((await almsService.feedThePoor(stadtId, JETZT)).meals).toBe(0);
	});

	it('greift die Rücklage nicht an — und speist dann die Hungrigsten zuerst', async () => {
		// Hundert über der Rücklage, das Brot kostet vierzig: Es reicht für zwei.
		await brotAmMarkt(5, 40);
		const sehr = await mensch({ satiety: 2 });
		const etwas = await mensch({ satiety: HUNGRIG });
		const ziemlich = await mensch({ satiety: 5 });

		const bericht = await almsService.feedThePoor(stadtId, JETZT);

		// Der Dritte bekäme Armengeld — aber drei Laibe zu vierzig sprengen den Rest von
		// zwanzig Münzen.
		expect(bericht).toEqual({ meals: 2, unfed: 1, spent: 80, relieved: 0, paid: 0 });
		expect(await kasse()).toBe(stadtRuecklage() + 20);
		expect((await werte(sehr)).satiety).toBeGreaterThan(2);
		expect((await werte(ziemlich)).satiety).toBeGreaterThan(5);
		expect((await werte(etwas)).satiety).toBe(HUNGRIG);
	});

	it('gibt nichts, wenn die Kasse nur die Rücklage hält', async () => {
		await Region.update({ treasury: stadtRuecklage() }, { where: { id: stadtId } });
		await brotAmMarkt(5);
		await mensch();

		expect(await almsService.feedThePoor(stadtId, JETZT)).toEqual({
			meals: 0,
			unfed: 1,
			spent: 0,
			relieved: 0,
			paid: 0
		});
	});

	it('zahlt Armengeld, wenn am Markt kein Brot liegt', async () => {
		// Im Nachbau ging die Speisung über tausendmal leer aus, obwohl die Kasse voll war:
		// Es gab nichts zu kaufen. Münzen machen aus dem Hungernden einen Kunden.
		const arme = await mensch();
		const preis: number = getItemTemplate('BREAD')!.basePrice;

		const bericht = await almsService.feedThePoor(stadtId, JETZT);

		expect(bericht).toEqual({
			meals: 0,
			unfed: 0,
			spent: 0,
			relieved: 1,
			paid: armengeld(preis)
		});
		expect((await werte(arme)).money).toBe(armengeld(preis));
		expect(await kasse()).toBe(stadtRuecklage() + 100 - armengeld(preis));

		// Und nur einmal: Wer jetzt Geld für Brot hat, hilft sich selbst.
		expect((await almsService.feedThePoor(stadtId, JETZT)).relieved).toBe(0);
	});

	it('gibt das Armengeld eines Kindes dem, der es versorgt', async () => {
		const mutter = await mensch({ satiety: 100 });
		const kind = await mensch({ birthTick: JETZT - yearsToTicks(6), motherId: mutter });

		await almsService.feedThePoor(stadtId, JETZT);

		expect((await werte(kind)).money).toBe(0);
		expect((await werte(mutter)).money).toBe(armengeld(getItemTemplate('BREAD')!.basePrice));
	});
});
