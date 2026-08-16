import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import type { Transaction } from 'sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Law } from '$lib/db/model/law';
import { Region } from '$lib/db/model/region';
import { ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as needService from '$lib/server/service/needService';
import * as tradeService from '$lib/server/service/tradeService';
import { LAW_RULES } from '$lib/game/law.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Das Standgeld am Marktplatz (5.20).
 *
 * **Der Stand ist gemietet, nicht die Ware.** Das Gesetz nennt es „was ein Stand am Markt
 * je Angebot kostet" — ein aufgestocktes Schild ist dasselbe Angebot und kostet deshalb
 * nicht noch einmal.
 *
 * Ohne diese Unterscheidung war das Standgeld eine Falle für genau den, dem die Ware
 * liegen blieb: Im Messlauf zu 5.18 erntete ein Pächter Tick für Tick Holz, legte es nach
 * und zahlte jedes Mal. Nach vierzig Spieljahren lagen 2857 Stämme am Markt, und ihr
 * Besitzer war der ärmste Mann der Stadt.
 */

const JETZT = 10_000;
const MARKTPLATZ = 6;
let stadtId: string;
let marktId: string;

async function person(geld: number): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: 'Händlerin',
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

/** Vorrat anlegen — `changeStock` verlangt eine Transaktion. */
async function inDieKammer(id: string, itemId: string, menge: number): Promise<void> {
	await sequelize.transaction(async (t: Transaction) => {
		await needService.changeStock(id, itemId, menge, t);
	});
}

async function geldVon(id: string): Promise<number> {
	return (await Character.findByPk(id))!.dataValues.money;
}

describe('Standgeld am Marktplatz', () => {
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
		await Law.destroy({ where: {} });
		await Character.destroy({ where: { role: 'PLAYER' } });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	it('kostet beim ersten Aushängen', async () => {
		const haendlerin = await person(100);
		await inDieKammer(haendlerin, 'WOOD', 10);

		const ergebnis = await tradeService.placeOffer(haendlerin, marktId, 'WOOD', 4, 2);

		expect(ergebnis.ok).toBe(true);
		expect(await geldVon(haendlerin)).toBe(100 - LAW_RULES.STALL_FEE.fallback);
		// Was der Verkäufer verliert, bekommt die Stadt — Geld wechselt den Besitzer.
		expect((await Region.findByPk(stadtId))!.dataValues.treasury).toBe(
			LAW_RULES.STALL_FEE.fallback
		);
	});

	it('kostet beim Nachlegen nichts', async () => {
		// **Der Kern.** Dreimal nachlegen heißt nicht dreimal Standgeld.
		const haendlerin = await person(100);
		await inDieKammer(haendlerin, 'WOOD', 10);

		await tradeService.placeOffer(haendlerin, marktId, 'WOOD', 2, 2);
		const nachDemErsten: number = await geldVon(haendlerin);

		await tradeService.placeOffer(haendlerin, marktId, 'WOOD', 2, 2);
		await tradeService.placeOffer(haendlerin, marktId, 'WOOD', 2, 2);

		expect(await geldVon(haendlerin)).toBe(nachDemErsten);

		// Und es bleibt ein Schild, mit allem darauf.
		const angebote = await ShopOffer.findAll();
		expect(angebote).toHaveLength(1);
		expect(angebote[0].dataValues.quantity).toBe(6);
	});

	it('kostet wieder, wenn zu einem anderen Preis angeboten wird', async () => {
		// Ein anderer Preis ist eine andere Aussage und keine Nachlieferung — also ein
		// zweites Schild, und für das zahlt man.
		const haendlerin = await person(100);
		await inDieKammer(haendlerin, 'WOOD', 10);

		await tradeService.placeOffer(haendlerin, marktId, 'WOOD', 2, 2);
		const nachDemErsten: number = await geldVon(haendlerin);

		await tradeService.placeOffer(haendlerin, marktId, 'WOOD', 2, 3);

		expect(await geldVon(haendlerin)).toBe(nachDemErsten - LAW_RULES.STALL_FEE.fallback);
		expect(await ShopOffer.count()).toBe(2);
	});

	it('lässt niemanden aushängen, der das Standgeld nicht hat', async () => {
		const arm = await person(1);
		await inDieKammer(arm, 'WOOD', 10);

		const ergebnis = await tradeService.placeOffer(arm, marktId, 'WOOD', 2, 2);

		expect(ergebnis.ok).toBe(false);
		expect(await geldVon(arm)).toBe(1);
	});

	it('lässt den Mittellosen nachlegen, was er schon anbietet', async () => {
		// Die Folge aus der Regel: Wer den Stand einmal bezahlt hat, darf ihn weiter
		// benutzen — auch wenn die Kasse inzwischen leer ist. Sonst wäre der Ärmste
		// ausgerechnet von dem ausgeschlossen, was ihn aus der Armut brächte.
		const knapp = await person(LAW_RULES.STALL_FEE.fallback);
		await inDieKammer(knapp, 'WOOD', 10);

		await tradeService.placeOffer(knapp, marktId, 'WOOD', 2, 2);
		expect(await geldVon(knapp)).toBe(0);

		const nachgelegt = await tradeService.placeOffer(knapp, marktId, 'WOOD', 2, 2);

		expect(nachgelegt.ok).toBe(true);
		expect((await ShopOffer.findOne({}))!.dataValues.quantity).toBe(4);
	});
});
