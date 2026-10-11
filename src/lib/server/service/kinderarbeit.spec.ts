import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { Inventory } from '$lib/db/model/inventory';
import { Lease } from '$lib/db/model/lease';
import { Plot } from '$lib/db/model/plot';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as npcService from '$lib/server/service/npcService';
import * as productionService from '$lib/server/service/productionService';
import { AGE_OF_WORK, isOfWorkingAge, yearsToTicks } from '$lib/game/time';

/**
 * Punkt 84 (0.6.0) — gearbeitet wird ab zwölf, und wer jünger ist, lebt aus dem Haushalt.
 *
 * Bis hierher verdiente sich jedes NPC-Kind sein Brot selbst, vom ersten Tag an: Ein
 * Neugeborenes kam satt, aber mit null Münzen zur Welt, und wenn es hungrig wurde, ging es
 * arbeiten. Jetzt isst es aus der Kammer der Eltern, und die Eltern kaufen nach.
 */

const JETZT = 20_000;
let stadtId: string;

async function mensch(name: string, alter: number, extras: Record<string, unknown> = {}) {
	const hausId = randomUUID();
	await Dynasty.create({ id: hausId, name: `Haus ${name}`, foundedAtTick: 0 });
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(alter),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 0,
		DynastyId: hausId,
		RegionId: stadtId,
		...extras
	});
	return id;
}

async function brotBei(id: string): Promise<number> {
	return (
		(await Inventory.findOne({ where: { CharacterId: id, itemId: 'BREAD' } }))?.dataValues
			.quantity ?? 0
	);
}

describe('Arbeit ab zwölf, und wer jünger ist, lebt aus dem Haushalt (Punkt 84)', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
	});

	it('zieht die Grenze bei zwölf vollen Jahren', () => {
		expect(isOfWorkingAge(JETZT - yearsToTicks(AGE_OF_WORK), JETZT)).toBe(true);
		expect(isOfWorkingAge(JETZT - yearsToTicks(AGE_OF_WORK) + 1, JETZT)).toBe(false);
	});

	it('ein hungriges Kind isst aus der Kammer der Mutter', async () => {
		const mutter = await mensch('Mutter', 30);
		await Inventory.create({ CharacterId: mutter, itemId: 'BREAD', quantity: 3 });
		const kind = await mensch('Kind', 8, { motherId: mutter, satiety: 5 });

		const ausgang = await npcService.ausfuehren(kind, JETZT);

		expect(ausgang).toEqual({ action: 'EAT' });
		expect(await brotBei(mutter)).toBe(2);
		expect((await Character.findByPk(kind))!.dataValues.satiety).toBeGreaterThan(5);
	});

	it('und geht nicht arbeiten, wenn dort nichts ist', async () => {
		const mutter = await mensch('Mutter', 30);
		const kind = await mensch('Kind', 8, { motherId: mutter, satiety: 5 });

		const ausgang = await npcService.ausfuehren(kind, JETZT);

		expect(ausgang.action).not.toBe('WORK');
	});

	it('dann kauft die Mutter, auch wenn sie selbst satt ist', async () => {
		const mutter = await mensch('Mutter', 30, { money: 200 });
		await mensch('Kind', 8, { motherId: mutter, satiety: 5 });

		const ausgang = await npcService.ausfuehren(mutter, JETZT);

		expect(ausgang.action).toBe('BUY_FOOD');
		expect(await brotBei(mutter)).toBeGreaterThan(0);
	});

	it('eine Waise ohne jeden Haushalt darf weiter für ihr Brot arbeiten', async () => {
		// Der Ausweg: Sonst verhungerte sie zwangsläufig. Ob gerade Arbeit da ist, hängt an
		// der Welt — geprüft wird, dass sie nicht am Alter scheitert.
		const waise = await mensch('Waise', 8, { satiety: 5 });

		const ausgang = await npcService.ausfuehren(waise, JETZT);

		expect(ausgang.failure).not.toBe('TOO_YOUNG');
	});

	it('und die Ernte weist einen Elfjährigen ab, einen Zwölfjährigen nicht', async () => {
		const flaeche = (await Plot.findOne({ where: { type: 'RESOURCE' } }))!.dataValues.id;
		await Lease.destroy({ where: { PlotId: flaeche } });

		const elf = await mensch('Elf', 11, { motherId: await mensch('Mutter', 35) });
		await Lease.create({ PlotId: flaeche, CharacterId: elf, sinceTick: JETZT });
		expect(await productionService.harvest(elf, flaeche)).toEqual({
			ok: false,
			reason: 'TOO_YOUNG'
		});

		await Lease.destroy({ where: { PlotId: flaeche } });
		const zwoelf = await mensch('Zwölf', 12);
		await Lease.create({ PlotId: flaeche, CharacterId: zwoelf, sinceTick: JETZT });
		const ergebnis = await productionService.harvest(zwoelf, flaeche);
		expect(ergebnis.ok || ergebnis.reason !== 'TOO_YOUNG').toBe(true);
	});

	it('eine Waise darf auch ernten — die Ausführung prüft dasselbe wie die Entscheidung', async () => {
		const flaeche = (await Plot.findOne({ where: { type: 'RESOURCE' } }))!.dataValues.id;
		await Lease.destroy({ where: { PlotId: flaeche } });
		const waise = await mensch('Waise', 9);
		await Lease.create({ PlotId: flaeche, CharacterId: waise, sinceTick: JETZT });

		const ergebnis = await productionService.harvest(waise, flaeche);

		expect(ergebnis.ok || ergebnis.reason !== 'TOO_YOUNG').toBe(true);
	});
});
