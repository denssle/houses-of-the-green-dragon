import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Lease } from '$lib/db/model/lease';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { Law } from '$lib/db/model/law';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as productionService from '$lib/server/service/productionService';
import * as regionService from '$lib/server/service/regionService';
import * as tradeService from '$lib/server/service/tradeService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Geld wechselt den Besitzer — es entsteht nicht und vergeht nicht (5.83, Punkt 108).
 *
 * **Punkt 66 hat die eine Richtung 2026 festgehalten**, Punkt 102 die andere: Geld darf
 * weder aus dem Nichts kommen noch ins Nichts verschwinden. Beides ließ sich lange nicht
 * prüfen, weil die Bürger beim Bauen so viel vernichteten, dass alles darin unterging.
 * Erst nachdem 5.78 und 5.80 diese Quelle geschlossen hatten, traten zwei Lecks hervor —
 * und sie zeigten in **entgegengesetzte** Richtungen, weshalb sie sich im Messbericht
 * teilweise aufhoben:
 *
 * - Der **Zehnt** nahm dem Bauern Ware und schrieb der Stadt Münzen gut, die niemand
 *   gezahlt hatte.
 * - **Marktangebote Verstorbener** blieben stehen; der Erlös ging per `increment` an eine
 *   Leiche, und die zählt keine Geldmenge mehr.
 *
 * **Geprüft wird deshalb die Erhaltung selbst**, nicht die einzelne Buchung: vorher und
 * nachher zählen, was alle Lebenden und die Stadtkasse zusammen haben.
 */

const JETZT = 30_000;
let stadtId: string;

/** Alles Geld der Welt — Lebende plus Stadtkasse. Genau die Größe aus der Messbilanz. */
async function geldmenge(): Promise<number> {
	const leute = await Character.findAll({ where: { deathTick: null } });
	const summe = leute.reduce((zahl, person) => zahl + person.dataValues.money, 0);
	const kassen = await Region.findAll();
	return summe + kassen.reduce((zahl, ort) => zahl + (ort.dataValues.treasury ?? 0), 0);
}

/**
 * Ein Zehntsatz, ohne den Umweg über Amt und Wahl.
 *
 * **Erlassen wird in der Stadt der Fläche, nicht in der Startstadt.** Die Ernte schlägt
 * den Satz dort nach, wo er beschlossen wurde (`regionService.cityOf`) — legt man ihn
 * irgendwo anders ab, gilt still der Rückfallwert, und der Test prüft die Regel eines
 * Gesetzes, das er gar nicht gesetzt hat. Genau so ist er beim ersten Anlauf
 * durchgerutscht.
 */
async function zehntsatz(plotId: string, wert: number): Promise<void> {
	const flaeche = await Plot.findByPk(plotId);
	await Law.create({
		id: randomUUID(),
		RegionId: await regionService.cityOf(flaeche!.dataValues.RegionId),
		kind: 'TITHE',
		value: wert,
		enactedTick: JETZT,
		EnactedByCharacterId: null
	});
}

async function person(name: string, geld: number, extras: Record<string, unknown> = {}) {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: geld,
		RegionId: stadtId,
		...extras
	});
	return id;
}

describe('Geld entsteht nicht und vergeht nicht', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await Law.destroy({ where: {} });
		await ShopOffer.destroy({ where: {} });
		await Lease.destroy({ where: {} });
		// **Auch die Höfe abräumen.** Sonst findet der zweite Test eine andere freie Fläche
		// als der erste — mit einem anderen Rohstoff, einem anderen Ertrag und am Ende einem
		// Zehnt von null. Genau daran ist er beim ersten Anlauf vorbeigelaufen.
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await Inventory.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Region.update({ treasury: 500 }, { where: { id: stadtId } });
	});

	it('lässt beim Zehnt kein Geld entstehen', async () => {
		// **Der Bauer behält die Ernte und zahlt aus dem Beutel.** Vorher verlor er die
		// Ware, und die Stadt bekam trotzdem Münzen: rund tausend je Messlauf aus dem
		// Nichts.
		// **Ein Satz, bei dem wirklich etwas anfällt.** Bei zehn Prozent auf eine kleine
		// Ernte ist der Zehnt aufgerundet null, und der Test prüfte nichts — genau daran
		// ist er beim ersten Anlauf vorbeigelaufen. Deshalb steht unten die Zusicherung,
		// dass überhaupt verzehntet wurde.
		const bäuerin = await person('Bäuerin', 200);
		const flächen = await productionService.getAreas(bäuerin);
		const frei = flächen.find((fläche) => !fläche.leased && fläche.resourceType);
		await zehntsatz(frei!.plotId, 30);
		await productionService.leasePlot(bäuerin, frei!.plotId);

		const vorher = await geldmenge();
		const ergebnis = await productionService.harvest(bäuerin, frei!.plotId);
		const nachher = await geldmenge();

		expect(ergebnis.ok && ergebnis.tithe).toBeGreaterThan(0);
		expect(nachher).toBe(vorher);
	});

	it('nimmt dem zahlungsunfähigen Bauern nicht mehr, als er hat', async () => {
		// Dieselbe Regel wie bei der Grundsteuer: Uneintreibbares wird nicht erzwungen.
		// Ohne sie stünde ein mittelloser Bauer mit negativem Beutel da.
		// Mit Geld pachten, dann verarmen: Die Pacht selbst kostet, und darum geht es hier
		// nicht.
		const arm = await person('Arme', 100);
		const flächen = await productionService.getAreas(arm);
		const frei = flächen.find((fläche) => !fläche.leased && fläche.resourceType);
		await zehntsatz(frei!.plotId, 30);
		await productionService.leasePlot(arm, frei!.plotId);
		await Character.update({ money: 0 }, { where: { id: arm } });

		const vorher = await geldmenge();
		const geerntet = await productionService.harvest(arm, frei!.plotId);

		expect(geerntet.ok && geerntet.tithe).toBeGreaterThan(0);
		expect((await Character.findByPk(arm))!.dataValues.money).toBe(0);
		expect(await geldmenge()).toBe(vorher);
	});

	it('lässt beim Kauf von einem Verstorbenen kein Geld verschwinden', async () => {
		// **Das zweite Leck** (5.83): Die Preisschilder blieben am Toten hängen, und
		// `buyFromOffer` schrieb den Erlös einer Leiche gut. Geliefert wurde ordentlich —
		// die Ware lag ja im Haus des Erben —, nur kam das Geld nie an.
		const erblasserin = await person('Erblasserin', 50);
		const erbin = await person('Erbin', 10, {
			motherId: undefined,
			birthTick: JETZT - yearsToTicks(20)
		});
		await Character.update({ motherId: erblasserin }, { where: { id: erbin } });
		const käuferin = await person('Käuferin', 100);

		const marktplatz = await Building.findOne({ where: { optionId: 6 } });
		await sequelize.transaction(async (t) => {
			await tradeService.changeBuildingStock(marktplatz!.dataValues.id, 'WOOD', 10, t);
		});
		await ShopOffer.create({
			id: randomUUID(),
			BuildingId: marktplatz!.dataValues.id,
			SellerCharacterId: erblasserin,
			itemId: 'WOOD',
			quantity: 10,
			pricePerUnit: 3
		});

		await lifecycleService.die(erblasserin, JETZT);
		const vorher = await geldmenge();

		const angebot = await ShopOffer.findOne({ where: { itemId: 'WOOD' } });
		if (angebot) await tradeService.buyFromOffer(käuferin, angebot.dataValues.id, 5);

		// Entweder ist das Angebot mit dem Erbe an die Erbin gegangen (dann bekommt sie das
		// Geld), oder es hing an niemandem mehr und wurde abgeräumt. Beides erhält die
		// Geldmenge — vorher verschwanden fünfzehn Münzen.
		expect(await geldmenge()).toBe(vorher);
	});
});
