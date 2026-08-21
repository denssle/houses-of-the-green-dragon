import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as needService from '$lib/server/service/needService';
import * as tradeService from '$lib/server/service/tradeService';
import { CARRIED_CAPACITY } from '$lib/game/inventory.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 5.33: **die Kammer hat einen Boden bekommen.**
 *
 * Bis hierher war der persönliche Vorrat unbegrenzt — und damit das bequemste Lager der
 * Welt: kostenlos, unverderblich und bei Raubzügen verschont. Wer dreihundert Bretter mit
 * sich herumtrug, hatte keinen Grund, je ein Betriebslager anzurühren.
 *
 * Jetzt hängt die Grenze am Dach über dem Kopf. Das ist der zweite handfeste Grund, ein
 * Haus zu besitzen, statt irgendwo unterzukommen — der erste war der Kraftvorrat.
 */

const JETZT = 10_000;
/** Das Wohnhaus: Kate, Haus, Großhaus — 20, 40, 80 Stück Vorrat. */
const WOHNHAUS = 1;
let stadtId: string;

async function person(geld: number = 1000): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: 'Vorrätige',
		role: 'PLAYER',
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

/** Ein Wohnhaus auf eigenem Grund, mit Bezug. */
async function wohntIn(
	characterId: string,
	level: number = 1,
	condition: number = 100
): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Wohngasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: characterId
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: 'Kate',
		optionId: WOHNHAUS,
		level,
		condition,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: characterId
	});
	await Character.update({ HomeBuildingId: id }, { where: { id: characterId } });
	return id;
}

async function inDerKammer(characterId: string, itemId: string): Promise<number> {
	return (
		(await needService.getStock(characterId)).find((posten) => posten.itemId === itemId)
			?.quantity ?? 0
	);
}

describe('Die Kammer', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Inventory.destroy({ where: {} });
		await Building.destroy({ where: { optionId: WOHNHAUS } });
		await Character.destroy({ where: { role: 'PLAYER' } });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	describe('wie viel hineingeht', () => {
		it('ist ohne Dach das, was man am Leib trägt', async () => {
			const obdachlos = await person();

			expect(await needService.chamberCapacityOf(obdachlos)).toBe(CARRIED_CAPACITY);
		});

		it('wächst mit dem Haus und seinem Ausbau', async () => {
			const kate = await person();
			await wohntIn(kate, 1);
			const grosshaus = await person();
			await wohntIn(grosshaus, 3);

			expect(await needService.chamberCapacityOf(kate)).toBe(CARRIED_CAPACITY + 20);
			expect(await needService.chamberCapacityOf(grosshaus)).toBe(CARRIED_CAPACITY + 80);
		});

		it('schrumpft mit dem Verfall', async () => {
			// Was durch ein undichtes Dach regnet, verdirbt — der dritte Grund zu
			// renovieren.
			const jemand = await person();
			await wohntIn(jemand, 3, 50);

			expect(await needService.chamberCapacityOf(jemand)).toBe(CARRIED_CAPACITY + 40);
		});
	});

	describe('einkaufen', () => {
		it('geht, solange es hineinpasst', async () => {
			const jemand = await person();

			expect(await needService.buyFromGranary(jemand, 'BREAD', 20)).toEqual({ ok: true });
			expect(await needService.chamberUsed(jemand)).toBe(20);
		});

		/** Der Kern von 5.33: Irgendwann ist die Kammer voll, und dann ist sie voll. */
		it('scheitert an der vollen Kammer — und kostet dann nichts', async () => {
			const jemand = await person(1000);
			await needService.buyFromGranary(jemand, 'BREAD', 20);

			expect(await needService.buyFromGranary(jemand, 'BREAD', 1)).toEqual({
				ok: false,
				reason: 'CHAMBER_FULL'
			});
			// **Kein Geld für nichts.** Die Ware kommt zuerst, das Geld danach — sonst
			// wäre die Transaktion mit einer Fehlermeldung festgeschrieben und der Käufer
			// um seine Münzen ärmer.
			expect((await Character.findByPk(jemand))!.dataValues.money).toBe(1000 - 20 * 4);
			expect(await inDerKammer(jemand, 'BREAD')).toBe(20);
		});

		it('geht wieder, sobald ein Dach dazukommt', async () => {
			const jemand = await person();
			await needService.buyFromGranary(jemand, 'BREAD', 20);
			await wohntIn(jemand, 2);

			expect(await needService.buyFromGranary(jemand, 'BREAD', 40)).toEqual({ ok: true });
			expect(await needService.chamberUsed(jemand)).toBe(60);
		});
	});

	describe('wer schon darüber liegt', () => {
		/**
		 * Der Fall, den ein Umzug in eine kleinere Bleibe und ein verfallendes Dach
		 * herbeiführen — und den es in jeder bestehenden Welt schon gibt, denn bis 5.33
		 * war die Kammer unbegrenzt.
		 */
		it('behält alles, nimmt aber nichts mehr auf', async () => {
			const jemand = await person();
			await Inventory.create({ CharacterId: jemand, itemId: 'PLANK', quantity: 300 });

			expect(await inDerKammer(jemand, 'PLANK')).toBe(300);
			expect(await needService.buyFromGranary(jemand, 'BREAD', 1)).toEqual({
				ok: false,
				reason: 'CHAMBER_FULL'
			});
		});

		it('kommt durch Einlagern wieder heraus', async () => {
			// Der Ausweg, der neben der Grenze stehen muss: Ein Betriebslager fasst
			// unbegrenzt.
			const jemand = await person();
			const haus = await wohntIn(jemand, 1);
			await Inventory.create({ CharacterId: jemand, itemId: 'PLANK', quantity: 300 });

			expect(await tradeService.moveToStock(jemand, haus, 'PLANK', 290)).toEqual({ ok: true });

			expect(await inDerKammer(jemand, 'PLANK')).toBe(10);
			expect(await needService.buyFromGranary(jemand, 'BREAD', 5)).toEqual({ ok: true });
		});

		it('geht den ganzen Weg hin und zurück', async () => {
			// **Der Punkt von 5.34**: Ein Lager fasst unbegrenzt, die Kammer nicht — also
			// liegt dort das Meiste, und geholt wird, was man gerade braucht. Ein Weg, der
			// nur hineinführt, wäre eine Einbahn.
			const jemand = await person();
			const haus = await wohntIn(jemand, 1);
			await needService.buyFromGranary(jemand, 'BREAD', 30);

			expect(await tradeService.moveToStock(jemand, haus, 'BREAD', 25)).toEqual({ ok: true });
			expect(await inDerKammer(jemand, 'BREAD')).toBe(5);

			expect(await tradeService.moveToStock(jemand, haus, 'BREAD', -10)).toEqual({ ok: true });
			expect(await inDerKammer(jemand, 'BREAD')).toBe(15);
			const lager = await tradeService.getBuildingStock(haus);
			expect(lager.find((posten) => posten.itemId === 'BREAD')?.quantity).toBe(15);
		});

		it('holt nichts aus dem Lager eines anderen', async () => {
			// Ein fremdes Lager zu leeren wäre Diebstahl — geprüft wird der Eigentümer,
			// nicht die Nachbarschaft.
			const jemand = await person();
			const nachbarin = await person();
			const ihrHaus = await wohntIn(nachbarin, 1);
			await sequelize.transaction((t) => tradeService.changeBuildingStock(ihrHaus, 'PLANK', 10, t));

			expect(await tradeService.moveToStock(jemand, ihrHaus, 'PLANK', -5)).toEqual({
				ok: false,
				reason: 'PLOT_NOT_OWNED'
			});
			expect(await inDerKammer(jemand, 'PLANK')).toBe(0);
		});

		it('lagert nicht mehr aus, als hineinpasst', async () => {
			const jemand = await person();
			const haus = await wohntIn(jemand, 1);
			await sequelize.transaction((t) => tradeService.changeBuildingStock(haus, 'PLANK', 100, t));

			// 40 gehen (20 am Leib, 20 aus der Kate), 41 nicht.
			expect(await tradeService.moveToStock(jemand, haus, 'PLANK', -41)).toEqual({
				ok: false,
				reason: 'CHAMBER_FULL'
			});
			// Nichts angerührt: Die Ware liegt noch im Lager, nicht halb hier und halb dort.
			expect(await inDerKammer(jemand, 'PLANK')).toBe(0);

			expect(await tradeService.moveToStock(jemand, haus, 'PLANK', -40)).toEqual({ ok: true });
			expect(await inDerKammer(jemand, 'PLANK')).toBe(40);
		});
	});
});
