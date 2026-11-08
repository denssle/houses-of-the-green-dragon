import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Plot } from '$lib/db/model/plot';
import { Skill } from '$lib/db/model/skill';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import { yearsToTicks } from '$lib/game/time';
import * as npcService from '$lib/server/service/npcService';

/**
 * Der Kreditbedarf (0.8.6, Punkt 43) — ehe es eine Leihstube gibt, wird gezählt, ob sie
 * Kunden hätte. Hier der Fall, der die Frage aufgeworfen hat: Ein Arbeitgeber mit Betrieb
 * und leerem Beutel kann den Lohn nicht zahlen, hätte aber etwas zu verpfänden.
 */

const JETZT = 20_000;
let stadtId: string;

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

describe('Kreditbedarf', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld(seededRoll(43));
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await Character.destroy({ where: { role: 'NPC' } });
		await Skill.destroy({ where: {} });
		await Employment.destroy({ where: {} });
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
	});

	it('zählt den Arbeitgeber, der nicht zahlen kann, mit seinem Pfand', async () => {
		const meisterin = await person('Meisterin', 0);
		// Keine Kraft: Sie soll nicht selbst handeln, nur Arbeitgeberin sein.
		await Character.update({ actionPoints: 0 }, { where: { id: meisterin } });
		const plotId = randomUUID();
		await Plot.create({
			id: plotId,
			address: `Schmiedgasse ${plotId.slice(0, 4)}`,
			type: 'BUILDING_LAND',
			RegionId: stadtId,
			ownerType: 'CHARACTER',
			OwnerCharacterId: meisterin
		});
		const schmiede = randomUUID();
		await Building.create({
			id: schmiede,
			name: 'Schmiede',
			optionId: 2,
			condition: 100,
			underConstruction: false,
			lastConditionTick: JETZT,
			PlotId: plotId,
			ownerType: 'CHARACTER',
			OwnerCharacterId: meisterin
		});
		const geselle = await person('Geselle', 0);
		await Employment.create({
			EmployeeCharacterId: geselle,
			BuildingId: schmiede,
			wagePerActionPoint: 3,
			sinceTick: JETZT - 10
		});

		const stunde = await npcService.actForNpcs(JETZT);

		expect(stunde.byFailure['WORK/EMPLOYER_BROKE:Schmiede']).toBeGreaterThan(0);
		const lohn = stunde.byCredit['Lohn: Schmiede'];
		expect(lohn).toBeDefined();
		expect(lohn.faelle).toBeGreaterThan(0);
		// Grundstück und fertige Schmiede decken drei Münzen Lohn um ein Vielfaches.
		expect(lohn.mitPfand).toBe(lohn.faelle);
		expect(lohn.koepfe).toEqual([geselle]);
	});
});
