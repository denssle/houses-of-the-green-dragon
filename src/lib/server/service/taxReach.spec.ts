import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import type { Transaction } from 'sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Law } from '$lib/db/model/law';
import { Lease } from '$lib/db/model/lease';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as productionService from '$lib/server/service/productionService';
import * as tradeService from '$lib/server/service/tradeService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Wen eine Steuer erreicht — und wo sie ankommt (5.94, Punkt 112).
 *
 * **Ein Betrieb im Umland stand außerhalb des Gesetzes.** Verkaufssteuer und Standgeld
 * wurden in der Region des Grundstücks nachgeschlagen, auf dem der Laden steht. Für eine
 * Werkstatt am Markt ist das die Stadt; für einen **Pachthof** ist es die Abbaufläche im
 * Umland, und dort hat nie jemand etwas erlassen. Der Satz fiel auf null zurück — wer aus
 * seinem Hof verkaufte, zahlte nichts, während dieselbe Ware aus einer Werkstatt in der
 * Stadt besteuert wurde.
 *
 * **Und die Buchung zeigte in dieselbe falsche Richtung.** Hätte je ein Satz im Umland
 * gegolten, wäre das Geld in einer Regionskasse gelandet, die weder Amt noch Ausgaben hat
 * — aus der Welt, ohne dass eine Buchung es gezeigt hätte (Punkt 102).
 *
 * Dieselbe Verwechslung wie in Punkt 65 beim Zehnt („An die Stadt, nicht an den Acker"),
 * und dieselbe Antwort: `cityOf`.
 */

const JETZT = 10_000;
const STEUERSATZ = 10;
let stadtId: string;

async function person(geld: number, name = 'Händlerin'): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
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

/** Alles Geld der Welt — Lebende und **alle** Kassen, auch die des Umlands. */
async function geldmenge(): Promise<number> {
	const leute = await Character.findAll({ where: { deathTick: null } });
	const kassen = await Region.findAll();
	return (
		leute.reduce((summe, person) => summe + person.dataValues.money, 0) +
		kassen.reduce((summe, ort) => summe + (ort.dataValues.treasury ?? 0), 0)
	);
}

/**
 * Ein Hof im Umland, mit Ware im Lager.
 *
 * Gepachtet wird auf dem echten Weg: `leasePlot` errichtet den Hof, und damit steht er
 * dort, wo ihn auch die laufende Welt hinstellt — auf einer Abbaufläche außerhalb der
 * Stadt.
 */
async function hofMitWare(
	besitzerId: string,
	itemId: string,
	menge: number
): Promise<{ buildingId: string; umlandId: string }> {
	const flaechen = await productionService.getAreas(besitzerId);
	const frei = flaechen.find((flaeche) => !flaeche.leased && flaeche.resourceType);
	await productionService.leasePlot(besitzerId, frei!.plotId);

	const hof = await Building.findOne({ where: { PlotId: frei!.plotId } });
	await sequelize.transaction(async (t: Transaction) => {
		await tradeService.changeBuildingStock(hof!.dataValues.id, itemId, menge, t);
	});

	const flaeche = await Plot.findByPk(frei!.plotId);
	return { buildingId: hof!.dataValues.id, umlandId: flaeche!.dataValues.RegionId };
}

async function kasse(regionId: string): Promise<number> {
	return (await Region.findByPk(regionId))!.dataValues.treasury ?? 0;
}

describe('Wohin eine Steuer reicht', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await ShopOffer.destroy({ where: {} });
		await Law.destroy({ where: {} });
		await Lease.destroy({ where: {} });
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 0 }, { where: {} });
		await Law.create({
			id: randomUUID(),
			RegionId: stadtId,
			kind: 'SALES_TAX',
			value: STEUERSATZ,
			enactedTick: JETZT,
			EnactedByCharacterId: null
		});
	});

	it('erreicht auch den Betrieb auf Pachtland', async () => {
		// **Das Schlupfloch**: Der Hof steht im Umland, das Gesetz gilt in der Stadt — und
		// bis 5.93 wurde der Satz dort nachgeschlagen, wo der Hof steht.
		const baeuerin = await person(100, 'Bäuerin');
		const { buildingId, umlandId } = await hofMitWare(baeuerin, 'WOOD', 10);
		expect(umlandId).not.toBe(stadtId);

		await tradeService.placeOffer(baeuerin, buildingId, 'WOOD', 10, 10);
		const kaeuferin = await person(100, 'Käuferin');

		// **Nach dem Pachten gemessen**, nicht davor: Die Pachtgebühr geht ebenfalls an die
		// Stadt, und der Test soll die Steuer zeigen und nicht sie.
		const kasseVorher = await kasse(stadtId);
		const vorher = await geldmenge();
		const gekauft = await tradeService.buyFromOffer(kaeuferin, await angebotId(), 2);

		expect(gekauft.ok).toBe(true);
		// Zwanzig Münzen Ware, zehn Prozent obendrauf — und die zwei Münzen liegen in der
		// **Stadtkasse**, nicht in der des Eichwalds.
		expect((await kasse(stadtId)) - kasseVorher).toBe(2);
		expect(await kasse(umlandId)).toBe(0);
		expect(await geldmenge()).toBe(vorher);
	});
});

/** Das eine Angebot, das in diesen Tests aushängt. */
async function angebotId(): Promise<string> {
	return (await ShopOffer.findOne({ where: { itemId: 'WOOD' } }))!.dataValues.id;
}
