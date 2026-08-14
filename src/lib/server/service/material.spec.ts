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
import * as buildingService from '$lib/server/service/buildingService';
import * as needService from '$lib/server/service/needService';
import { CONDITION_MAX, materialFor, YEARS_TO_RUIN } from '$lib/game/building.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.10: Ein Haus besteht nicht aus Münzen.
 *
 * Das ist die Wirkung, die die ganze Baukette trägt — ohne sie wären Bretter nur eine
 * Zahl im Lager. Geprüft wird deshalb vor allem, dass ohne Material **nichts** geht und
 * dass das Material auch wirklich verschwindet.
 */

const WOHNHAUS = 1;
const ZIMMEREI = 9;
const JETZT = 10_000;
let stadtId: string;

async function person(geld = 5000): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: 'Bauherrin',
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

async function material(characterId: string, menge: number): Promise<void> {
	for (const ware of ['PLANK', 'BLOCK', 'IRON']) {
		await Inventory.create({ CharacterId: characterId, itemId: ware, quantity: menge });
	}
}

async function eigenerGrund(characterId: string): Promise<string> {
	const id = randomUUID();
	await Plot.create({
		id,
		address: `Bauplatz ${id.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: characterId
	});
	return id;
}

async function vorrat(characterId: string, itemId: string): Promise<number> {
	const alle = await needService.getStock(characterId);
	return alle.find((posten) => posten.itemId === itemId)?.quantity ?? 0;
}

describe('Baumaterial', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Inventory.destroy({ where: {} });
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await Plot.destroy({ where: { ownerType: 'CHARACTER' } });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	describe('beim Bauen', () => {
		it('geht nichts ohne Bretter', async () => {
			// Die Wirkung, die die Kette trägt: Wer keine hat, kauft sie beim Zimmerer.
			const bauherrin = await person();
			const grund = await eigenerGrund(bauherrin);
			const vorlage = buildingService.getBuildingOption(WOHNHAUS)!;

			const ergebnis = await buildingService.build(vorlage, bauherrin, grund);

			expect(ergebnis).toMatchObject({ ok: false, reason: 'NOT_IN_STOCK' });
			// Und das Geld bleibt, wo es war.
			expect((await Character.findByPk(bauherrin))!.dataValues.money).toBe(5000);
			expect(await Building.count({ where: { PlotId: grund } })).toBe(0);
		});

		it('verbraucht es, wenn es da ist', async () => {
			const bauherrin = await person();
			await material(bauherrin, 50);
			const grund = await eigenerGrund(bauherrin);
			const vorlage = buildingService.getBuildingOption(WOHNHAUS)!;
			const bedarf = materialFor(vorlage.levels[0].price, vorlage.type);

			expect((await buildingService.build(vorlage, bauherrin, grund)).ok).toBe(true);

			for (const posten of bedarf) {
				expect(await vorrat(bauherrin, posten.itemId)).toBe(50 - posten.quantity);
			}
		});

		it('verlangt für ein Wohnhaus nur Holz', async () => {
			// Eine Kate ist Fachwerk, keine Festung. Ohne diese Ausnahme hinge das Wachstum
			// der Bevölkerung an einer Erzgrube, einer Schmiede und dem Zufall, dass jemand
			// beides betreibt — im Selbsterhaltungstest baute deshalb kein NPC ein Haus.
			expect(materialFor(100, 'RESIDENCE').map((posten) => posten.itemId)).toEqual(['PLANK']);
			expect(materialFor(100, 'CRAFT').map((posten) => posten.itemId)).toEqual([
				'PLANK',
				'BLOCK',
				'IRON'
			]);
		});

		it('verlangt vom größeren Haus mehr', async () => {
			// Am Preis bemessen statt je Vorlage aufgezählt: Jede neue Gebäudeart bringt
			// ihren Bedarf von selbst mit.
			const kate = materialFor(100);
			const grosshaus = materialFor(400);

			expect(grosshaus[0].quantity).toBeGreaterThan(kate[0].quantity);
		});

		/**
		 * Die Ausnahme, ohne die die Kette nie anliefe: Für die erste Zimmerei gäbe es
		 * keine Bretter, weil Bretter nur aus der Zimmerei kommen.
		 */
		it('lässt die Werkstätten der Kette selbst ohne Material errichten', async () => {
			const bauherrin = await person();
			const grund = await eigenerGrund(bauherrin);
			const zimmerei = buildingService.getBuildingOption(ZIMMEREI)!;

			expect((await buildingService.build(zimmerei, bauherrin, grund)).ok).toBe(true);
		});
	});

	describe('beim Herrichten', () => {
		async function verfallenesHaus(besitzerId: string): Promise<string> {
			const grund = await eigenerGrund(besitzerId);
			const id = randomUUID();
			await Building.create({
				id,
				name: 'Wohnhaus',
				optionId: WOHNHAUS,
				condition: CONDITION_MAX,
				lastConditionTick: JETZT,
				PlotId: grund,
				ownerType: 'CHARACTER',
				OwnerCharacterId: besitzerId
			});
			await World.update(
				{ currentTick: JETZT + yearsToTicks(YEARS_TO_RUIN / 2) },
				{ where: { id: WORLD_ID } }
			);
			return id;
		}

		it('braucht Holz — weniger als ein Neubau, aber nicht nichts', async () => {
			const besitzerin = await person();
			const haus = await verfallenesHaus(besitzerin);

			expect(await buildingService.renovateBuilding(besitzerin, haus)).toMatchObject({
				ok: false,
				reason: 'NOT_IN_STOCK'
			});

			await material(besitzerin, 50);
			expect((await buildingService.renovateBuilding(besitzerin, haus)).ok).toBe(true);
			// Nur Bretter, kein Stein und kein Eisen: Wer sein Haus pflegt, kommt billig weg.
			expect(await vorrat(besitzerin, 'PLANK')).toBeLessThan(50);
			expect(await vorrat(besitzerin, 'BLOCK')).toBe(50);
		});
	});

	describe('die öffentliche Hand', () => {
		it('baut ohne Material', async () => {
			// Die Stadt hat kein Lager — sie vergibt Aufträge und bezahlt sie. Ein
			// Stadtvorrat wäre ein eigenes System, und für die Wirkung der Kette braucht es
			// ihn nicht: Der Bedarf der Spieler reicht als Nachfrage.
			const grund = randomUUID();
			await Plot.create({
				id: grund,
				address: 'Ratsplatz 1',
				type: 'BUILDING_LAND',
				RegionId: stadtId,
				ownerType: 'CITY'
			});
			await Region.update({ treasury: 1000 }, { where: { id: stadtId } });

			const frei = await buildingService.getFreeCityPlots(stadtId);
			expect(frei.some((flaeche) => flaeche.id === grund)).toBe(true);
		});
	});
});
