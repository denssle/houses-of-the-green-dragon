import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Event } from '$lib/db/model/event';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { BuildingStock } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as hazardService from '$lib/server/service/hazardService';
import { CONDITION_MAX } from '$lib/game/building.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.8 gegen die Datenbank, seit 5.40 nur noch der Brand.
 *
 * Der Würfel ist hier immer gestellt: Geprüft wird nicht, **ob** ein Unglück eintritt —
 * das ist eine Wahrscheinlichkeit und in der Logik-Spec abgehandelt —, sondern **was es
 * anrichtet**, wenn es eintritt.
 *
 * Die Tests zum Raubzug und zur Wache sind mit den Räubern gegangen. Sie kommen mit ihnen
 * zurück; bis dahin behauptete grün, was es nicht mehr gibt.
 */

const JETZT = 10_000;
let stadtId: string;

/**
 * Ein gestellter Würfel: erst der Wurf über das Ob, dann der über das Wen.
 *
 * Der erste Wert muss unter der Wahrscheinlichkeit liegen, damit das Unglück überhaupt
 * eintritt; der zweite wählt das Ziel. Danach bleibt es beim letzten Wert.
 */
function wuerfel(...werte: number[]): () => number {
	let i = 0;
	return () => werte[Math.min(i++, werte.length - 1)];
}

async function person(name: string, geld: number): Promise<string> {
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
		RegionId: stadtId
	});
	return id;
}

async function gebaeude(optionId: number, extras: Record<string, unknown> = {}): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Brandgasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CITY'
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: 'Haus',
		optionId,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CITY',
		...extras
	});
	return id;
}

describe('Unglücke gegen die Datenbank', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Event.destroy({ where: {} });
		await BuildingStock.destroy({ where: {} });
		await Employment.destroy({ where: {} });
		await Building.destroy({ where: {} });
		await Plot.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	describe('der Brand', () => {
		/** Ein Wurf, der das Feuer trifft, und einer, der das Haus wählt. */
		function nurFeuer(): () => number {
			return wuerfel(0, 0.5);
		}

		it('senkt den Zustand, ohne das Haus zu vernichten', async () => {
			const haus = await gebaeude(5);

			const bericht = await hazardService.strike(stadtId, JETZT, nurFeuer());

			expect(bericht?.kind).toBe('FIRE');
			const danach = await Building.findByPk(haus);
			expect(danach).not.toBeNull();
			expect(danach!.dataValues.condition).toBeLessThan(CONDITION_MAX);
			expect(danach!.dataValues.condition).toBeGreaterThan(0);
			// Der Stichtag wandert mit: Sonst liefe der Verfall ab dem alten Datum weiter.
			expect(danach!.dataValues.lastConditionTick).toBe(JETZT);
		});

		it('steht in der Chronik', async () => {
			await gebaeude(5);
			await hazardService.strike(stadtId, JETZT, nurFeuer());

			const eintrag = await Event.findOne({ where: { kind: 'FIRE' } });
			expect(eintrag?.dataValues.value).toBeGreaterThan(0);
		});
	});

	describe('ein ruhiger Tick', () => {
		it('bleibt ohne Folgen', async () => {
			await person('Reiche', 400);

			// Ein hoher Wurf verfehlt die Wahrscheinlichkeit.
			expect(await hazardService.strike(stadtId, JETZT, wuerfel(0.99))).toBeUndefined();
			expect(await Event.count()).toBe(0);
		});
	});
});
