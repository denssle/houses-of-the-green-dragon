import { beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { findStartRegionId, seedWorld, WORLD_STARTS_AT_TICK } from '$lib/db/seed';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { RegionLink } from '$lib/db/model/regionLink';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { ageInYears } from '$lib/game/time';

describe('Weltaufbau', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
	});

	it('setzt die Weltzeit auf hundert Spieljahre', async () => {
		const welt = await World.findByPk(WORLD_ID);

		expect(welt?.dataValues.currentTick).toBe(WORLD_STARTS_AT_TICK);
	});

	it('legt eine Stadt mit Kasse und sechs Umlandflächen an', async () => {
		const stadt = await Region.findOne({ where: { type: 'CITY' } });
		const umland = await Region.count({ where: { type: ['FOREST', 'QUARRY', 'FIELD', 'MINE'] } });

		expect(stadt?.dataValues.name).toBe('Grünau');
		expect(stadt?.dataValues.treasury).toBe(0);
		// Wald, Steinbruch, Acker, Erzgrube (4.10), Schafweide und Kräuterwiese (4.11).
		expect(umland).toBe(6);
	});

	it('verbindet jeden Ort des Umlands in beide Richtungen mit der Stadt', async () => {
		const stadtId = await findStartRegionId();

		const hin = await RegionLink.count({ where: { fromRegionId: stadtId } });
		const zurueck = await RegionLink.count({ where: { toRegionId: stadtId } });

		expect(hin).toBe(6);
		expect(zurueck).toBe(6);
	});

	it('legt freies Bauland in der Stadt und Abbauflächen im Umland an', async () => {
		const bauland = await Plot.findAll({ where: { type: 'BUILDING_LAND' } });
		const abbau = await Plot.findAll({ where: { type: 'RESOURCE' } });

		expect(bauland).toHaveLength(12);
		// Acht nie vergeben — wer bauen will, muss erst eines erwerben. Die vier übrigen
		// trägt die Stadt selbst: Rathaus, Schmiede, Unterkunft und Marktplatz.
		expect(bauland.filter((p) => p.dataValues.ownerType === 'NONE')).toHaveLength(8);
		expect(bauland.filter((p) => p.dataValues.ownerType === 'CITY')).toHaveLength(4);
		// Umland gehört der Stadt und wird verpachtet, nicht verkauft.
		expect(abbau.every((p) => p.dataValues.ownerType === 'CITY')).toBe(true);
		expect(abbau.map((p) => p.dataValues.resourceType).sort()).toEqual([
			'GRAIN',
			'GRAIN',
			'GRAIN',
			'HERBS',
			'ORE',
			'STONE',
			'WOOD',
			'WOOD',
			'WOOL',
			'WOOL'
		]);
	});

	it('gibt der Stadt Rathaus, Betrieb, Dach und Marktplatz', async () => {
		const städtisch = await Building.findAll({ where: { ownerType: 'CITY' } });

		expect(städtisch.map((b) => b.dataValues.name).sort()).toEqual([
			'Marktplatz',
			'Rathaus',
			'Städtische Schmiede',
			'Städtische Unterkunft'
		]);
		// Alle vier stehen auf einem Grundstück — sie belegen knappen Platz wie jedes andere
		// Haus auch.
		expect(städtisch.every((b) => b.dataValues.PlotId !== null)).toBe(true);
	});

	it('bevölkert die Stadt mit erwachsenen Einwohnern, jeder mit eigenem Haus', async () => {
		const leute = await Character.findAll({ where: { role: 'NPC' } });

		expect(leute).toHaveLength(8);
		// **Seit 5.10 gehört jeder zu einem Haus** — der Hausname ist der Nachname, und
		// die Ausnahme für Fremd-NPCs ist gefallen. Eigene Häuser und keine geteilten:
		// Zwei Fremde mit demselben Nachnamen wären eine Verwandtschaft, die es nicht gibt.
		const haeuser = leute.map((c) => c.dataValues.DynastyId);
		expect(haeuser.every((id) => id !== null)).toBe(true);
		expect(new Set(haeuser).size).toBe(8);
		// Die Geburtstage müssen zum Weltalter passen: lauter Erwachsene, niemand älter
		// als die Welt selbst.
		for (const person of leute) {
			const alter = ageInYears(person.dataValues.birthTick, WORLD_STARTS_AT_TICK);
			expect(alter).toBeGreaterThanOrEqual(16);
			expect(alter).toBeLessThan(100);
		}
	});

	// Der Weltaufbau läuft bei jedem Serverstart. Wäre er nicht wiederholbar, hätte die
	// Welt nach dem zweiten Start zwei Städte.
	it('legt beim zweiten Aufruf nichts erneut an', async () => {
		const vorher = await Region.count();

		await expect(seedWorld()).resolves.toBe(false);

		expect(await Region.count()).toBe(vorher);
	});
});
