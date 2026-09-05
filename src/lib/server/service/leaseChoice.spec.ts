import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Lease } from '$lib/db/model/lease';
import { Plot } from '$lib/db/model/plot';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import * as npcService from '$lib/server/service/npcService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Welche Fläche einer pachtet (5.84, Punkt 103).
 *
 * **Die Sperre der ganzen Wirtschaft saß hier.** Ein Pachtwilliger nahm die **erste** freie
 * Fläche mit einem Rohstoff — und im Messlauf lagen dreimal Eichwald und Erzgrube unter
 * Pacht, während das Mühlenfeld mit drei freien Flächen und der Steinbruch unberührt
 * blieben. Ohne Stein keine Quader, ohne Quader **keine Werkstatt überhaupt**:
 * `materialFor` verlangt für jeden Betrieb Bretter, Quader und Eisen. Der Steinmetz
 * pachtete einen Acker und stand weiter ohne Stein da, vier Bauern und zwei Bäcker
 * warteten auf ein Feld, das frei danebenlag, und kein Backhaus entstand in vierzig
 * Spieljahren.
 *
 * **Was die Werkstatt verarbeiten kann, bestimmt jetzt die Wahl.** Wer keine hat, nimmt
 * weiter die nächstbeste — für ihn ist jede Ernte gleich viel wert.
 */

const JETZT = 40_000;
const STEINMETZHUETTE = 10;
let stadtId: string;

async function steinmetzin(): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: 'Steinmetzin',
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 300,
		// Ehrgeizig und fleißig: Nur wen sein Wesen dazu drängt, unternimmt überhaupt etwas.
		ambition: 60,
		diligence: 60,
		RegionId: stadtId
	});

	const grundstueck = await Plot.findOne({
		where: { RegionId: stadtId, type: 'BUILDING_LAND', ownerType: 'NONE' }
	});
	await grundstueck!.update({ ownerType: 'CHARACTER', OwnerCharacterId: id });
	await Building.create({
		id: randomUUID(),
		name: 'Steinmetzhütte',
		optionId: STEINMETZHUETTE,
		lastConditionTick: JETZT,
		PlotId: grundstueck!.dataValues.id,
		ownerType: 'CHARACTER',
		OwnerCharacterId: id
	});
	return id;
}

describe('Wer eine Fläche pachtet, pachtet die passende', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld(seededRoll(103));
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await Lease.destroy({ where: {} });
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await Character.destroy({ where: {} });
		await Plot.update(
			{ ownerType: 'NONE', OwnerCharacterId: null },
			{ where: { type: 'BUILDING_LAND' } }
		);
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
	});

	it('führt die Steinmetzin zum Steinbruch und nicht zum erstbesten Acker', async () => {
		const wer = await steinmetzin();

		// **Ein paar Stunden, nicht eine.** Vor der Entfaltung liegt die Sicherheit: Der
		// erste Tick geht für den Einzug in die städtische Unterkunft drauf.
		for (let i = 0; i < 5; i++) await npcService.actForNpcs(JETZT + i);

		const pacht = await Lease.findOne({ where: { CharacterId: wer } });
		expect(pacht).not.toBeNull();

		const flaeche = await Plot.findByPk(pacht!.dataValues.PlotId);
		// **Der Kern von 5.84**: Ihre Hütte verarbeitet Stein, also pachtet sie Stein.
		// Vorher stand hier Holz — die erste freie Fläche der Liste.
		expect(flaeche!.dataValues.resourceType).toBe('STONE');
	});
});
