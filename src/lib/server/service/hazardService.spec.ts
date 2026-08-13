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
import { loot } from '$lib/game/hazard.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.8 gegen die Datenbank.
 *
 * Der Würfel ist hier immer gestellt: Geprüft wird nicht, **ob** ein Unglück eintritt —
 * das ist eine Wahrscheinlichkeit und in der Logik-Spec abgehandelt —, sondern **was es
 * anrichtet**, wenn es eintritt.
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

/** Sicherer Raubzug, Ziel nach Gewicht. */
function raubMitZiel(zielwurf: number): () => number {
	return wuerfel(0, zielwurf);
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

async function kasse(): Promise<number> {
	return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
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

	describe('der Raubzug', () => {
		it('nimmt dem, bei dem am meisten zu holen ist', async () => {
			const arm = await person('Arme', 4);
			const reich = await person('Reiche', 400);

			// Ein Wurf von 0.5 liegt im Gewicht der Reichen — sie hat 99 % des Vermögens.
			const bericht = await hazardService.strike(stadtId, JETZT, raubMitZiel(0.5));

			expect(bericht?.kind).toBe('RAID');
			expect((await Character.findByPk(reich))!.dataValues.money).toBe(400 - loot(400));
			expect((await Character.findByPk(arm))!.dataValues.money).toBe(4);
		});

		it('plündert auch die Stadtkasse', async () => {
			await Region.update({ treasury: 1000 }, { where: { id: stadtId } });

			const bericht = await hazardService.strike(stadtId, JETZT, raubMitZiel(0.5));

			expect(bericht).toEqual({ kind: 'RAID', what: 'die Stadtkasse', value: loot(1000) });
			expect(await kasse()).toBe(1000 - loot(1000));
		});

		it('räumt ein Betriebslager', async () => {
			const betrieb = await gebaeude(5);
			await BuildingStock.create({ BuildingId: betrieb, itemId: 'BREAD', quantity: 40 });

			const bericht = await hazardService.strike(stadtId, JETZT, raubMitZiel(0.5));

			expect(bericht?.kind).toBe('RAID');
			const rest = await BuildingStock.findOne({ where: { BuildingId: betrieb } });
			expect(rest!.dataValues.quantity).toBe(40 - loot(40));
		});

		it('lässt den persönlichen Vorrat unangetastet', async () => {
			// Das Brot in der Kammer ist das, was zwischen einem Charakter und dem
			// Verhungern steht. Es zu nehmen wäre ein Todesurteil mit Umweg.
			const arm = await person('Arme', 0);

			const bericht = await hazardService.strike(stadtId, JETZT, raubMitZiel(0.5));

			// Ohne Münzen und ohne Lager gibt es kein lohnendes Ziel.
			expect(bericht).toBeUndefined();
			expect((await Character.findByPk(arm))!.dataValues.money).toBe(0);
		});

		it('steht in der Chronik', async () => {
			await person('Reiche', 400);
			await hazardService.strike(stadtId, JETZT, raubMitZiel(0.5));

			const eintrag = await Event.findOne({ where: { kind: 'RAID' } });
			expect(eintrag?.dataValues.detail).toBe('MONEY');
			expect(eintrag?.dataValues.value).toBe(loot(400));
		});
	});

	describe('die Wache', () => {
		it('wird gezählt, wie sie angestellt ist', async () => {
			const wachhaus = await gebaeude(hazardService.GUARDHOUSE_OPTION_ID, { offeredWage: 4 });
			expect(await hazardService.countGuards(stadtId)).toBe(0);

			const waechter = await person('Wächterin', 10);
			await Employment.create({
				EmployeeCharacterId: waechter,
				BuildingId: wachhaus,
				wagePerActionPoint: 4,
				sinceTick: JETZT
			});

			expect(await hazardService.countGuards(stadtId)).toBe(1);
		});

		it('senkt die ausgewiesene Gefahr', async () => {
			const ohne = await hazardService.getSafety(stadtId);
			const wachhaus = await gebaeude(hazardService.GUARDHOUSE_OPTION_ID, { offeredWage: 4 });
			const waechter = await person('Wächterin', 10);
			await Employment.create({
				EmployeeCharacterId: waechter,
				BuildingId: wachhaus,
				wagePerActionPoint: 4,
				sinceTick: JETZT
			});

			const mit = await hazardService.getSafety(stadtId);
			expect(mit.raidChancePerYear).toBeLessThan(ohne.raidChancePerYear);
		});
	});

	describe('der Brand', () => {
		/** Ein Wurf, der den Raub verfehlt und das Feuer trifft. */
		function nurFeuer(): () => number {
			return wuerfel(0.99, 0, 0.5);
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

			// Ein hoher Wurf verfehlt beide Wahrscheinlichkeiten.
			expect(await hazardService.strike(stadtId, JETZT, wuerfel(0.99))).toBeUndefined();
			expect(await Event.count()).toBe(0);
		});
	});
});
