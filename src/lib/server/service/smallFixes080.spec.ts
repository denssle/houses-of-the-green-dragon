import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Plot } from '$lib/db/model/plot';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { yearsToTicks } from '$lib/game/time';
import * as buildingService from '$lib/server/service/buildingService';
import * as npcService from '$lib/server/service/npcService';
import * as tradeService from '$lib/server/service/tradeService';

/** Die kleinen Punkte aus 0.8.0: 94 (Rückweg ins Lager) und 88 (Zugreihenfolge). */

const JETZT = 60_000;
let stadtId: string;
let zaehler = 0;

async function person(role: 'PLAYER' | 'NPC' = 'PLAYER'): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: `Mensch${++zaehler}`,
		role,
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
		address: `Kleingasse ${++zaehler}`,
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

describe('0.8.0, die kleinen Punkte', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
	});

	describe('Punkt 94: ein zurückgezogenes Marktangebot', () => {
		it('kommt ins eigene Lager, wenn das Inventar es nicht fasst', async () => {
			const id = await person();
			const hof = await haus(id, 13);
			const markt = (await Building.findOne({ where: { optionId: 6 } }))!.dataValues.id;
			const angebot = randomUUID();
			await ShopOffer.create({
				id: angebot,
				BuildingId: markt,
				SellerCharacterId: id,
				itemId: 'WOOD',
				quantity: 2000,
				pricePerUnit: 2
			});

			expect(await tradeService.withdrawOffer(id, angebot)).toEqual({ ok: true });

			const lager = await BuildingStock.findOne({ where: { BuildingId: hof, itemId: 'WOOD' } });
			expect(lager?.dataValues.quantity).toBe(2000);
			expect(await ShopOffer.findByPk(angebot)).toBeNull();
		});

		it('bleibt hängen, wenn es gar keinen Platz gibt', async () => {
			const id = await person();
			const markt = (await Building.findOne({ where: { optionId: 6 } }))!.dataValues.id;
			const angebot = randomUUID();
			await ShopOffer.create({
				id: angebot,
				BuildingId: markt,
				SellerCharacterId: id,
				itemId: 'WOOD',
				quantity: 2000,
				pricePerUnit: 2
			});

			expect(await tradeService.withdrawOffer(id, angebot)).toEqual({
				ok: false,
				reason: 'INVENTORY_FULL'
			});
			expect(await ShopOffer.findByPk(angebot)).not.toBeNull();
		});

		it('nimmt weiter das Inventar, wo es reicht', async () => {
			const id = await person();
			await haus(id, 13);
			const markt = (await Building.findOne({ where: { optionId: 6 } }))!.dataValues.id;
			const angebot = randomUUID();
			await ShopOffer.create({
				id: angebot,
				BuildingId: markt,
				SellerCharacterId: id,
				itemId: 'WOOD',
				quantity: 2,
				pricePerUnit: 2
			});

			await tradeService.withdrawOffer(id, angebot);

			const kammer = await Inventory.findOne({ where: { CharacterId: id, itemId: 'WOOD' } });
			expect(kammer?.dataValues.quantity).toBe(2);
		});
	});

	describe('Punkt 88: die Zugreihenfolge', () => {
		async function reihenfolge(tick: number): Promise<string[]> {
			const folge: string[] = [];
			await npcService.actForNpcs(tick, async (id) => {
				folge.push(id);
				return { action: 'IDLE' };
			});
			return folge;
		}

		it('mischt je Tick anders, und derselbe Tick mischt gleich', async () => {
			for (let i = 0; i < 8; i++) await person('NPC');

			const eins = await reihenfolge(JETZT);
			const nochmal = await reihenfolge(JETZT);
			const andererTick = await reihenfolge(JETZT + 1);

			expect(nochmal).toEqual(eins);
			expect(andererTick).not.toEqual(eins);
			expect([...andererTick].sort()).toEqual([...eins].sort());
		});
	});

	describe('Punkt 87: Boden nur für eine erreichbare Werkstatt', () => {
		it('verneint die Bäckerei ohne Bretter, Quader und Eisen, und bejaht sie mit', async () => {
			await ShopOffer.destroy({ where: {} });
			const reich = await person('NPC');
			const handwerke = buildingService
				.getBuildingOptions()
				.filter((vorlage) => vorlage.type === 'CRAFT' && vorlage.optionId !== 5);
			for (const vorlage of handwerke) await haus(reich, vorlage.optionId);
			const jemand = await person('NPC');

			expect(await npcService.werkstattErreichbarFuer(jemand, stadtId)).toBe(false);

			const markt = (await Building.findOne({ where: { optionId: 6 } }))!.dataValues.id;
			for (const itemId of ['PLANK', 'BLOCK', 'IRON']) {
				await ShopOffer.create({
					id: randomUUID(),
					BuildingId: markt,
					SellerCharacterId: reich,
					itemId,
					quantity: 500,
					pricePerUnit: 1
				});
			}

			expect(await npcService.werkstattErreichbarFuer(jemand, stadtId)).toBe(true);
		});
	});
});
