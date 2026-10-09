import { beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import {
	findStartRegionId,
	seedWorld,
	STADTKASSE_BEI_WELTBEGINN,
	WORLD_STARTS_AT_TICK
} from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { FOUNDER_PROVISIONS } from '$lib/game/need.logic';
import { CARRIED_CAPACITY } from '$lib/game/inventory.logic';
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
		// **Nicht mehr leer** (5.27): Eine Stadt, die schon steht, hat Rücklagen — und sie
		// braucht sie, seit sie ihre Instandsetzung an Menschen zahlt statt an niemanden
		// (5.26). Mit leerer Kasse gäbe es keine Lohnarbeit, und ein neuer Spieler stünde
		// ohne Verdienst da.
		expect(stadt?.dataValues.treasury).toBe(STADTKASSE_BEI_WELTBEGINN);
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

	it('gibt jedem Gründer Proviant mit (5.103)', async () => {
		// **Punkt 85.** Ohne Kornspeicher verhungerte die Gründergeneration, ehe die erste
		// Bäckerei stand — elf Tote bis Tick 250 im Messlauf. Mit Proviant überlebte sie.
		const leute = await Character.findAll();
		expect(leute.length).toBeGreaterThan(0);
		for (const person of leute) {
			const brot = await Inventory.findOne({
				where: { CharacterId: person.dataValues.id, itemId: 'BREAD' }
			});
			expect(brot?.dataValues.quantity).toBe(FOUNDER_PROVISIONS);
		}
	});

	it('und nicht mehr, als einer tragen kann', () => {
		// Ohne eigenes Dach fasst die Kammer `CARRIED_CAPACITY`; mehr Proviant wäre einer
		// Kammer zugebucht, die ihn gar nicht hält.
		expect(FOUNDER_PROVISIONS).toBeLessThanOrEqual(CARRIED_CAPACITY);
	});

	// Der Weltaufbau läuft bei jedem Serverstart. Wäre er nicht wiederholbar, hätte die
	// Welt nach dem zweiten Start zwei Städte.
	it('legt beim zweiten Aufruf nichts erneut an', async () => {
		const vorher = await Region.count();

		await expect(seedWorld()).resolves.toBe(false);

		expect(await Region.count()).toBe(vorher);
	});
});

describe('Der Würfel des Weltaufbaus', () => {
	/**
	 * **Punkt 54.** Zwei Größen werden hier gewürfelt: das Startkapital der Gründer und
	 * ihre Anlagen. Beide entscheiden mit, ob in den ersten Ticks jemand unternimmt — und
	 * damit über den Ausgang von Tests, die genau das prüfen. Seit 5.55 nimmt `seedWorld`
	 * den Würfel entgegen; dieser Test hält fest, dass er auch wirklich durchgereicht wird.
	 */
	async function abdruck(): Promise<string> {
		const leute = await Character.findAll({ order: [['firstName', 'ASC']] });
		return leute
			.map((p) => `${p.dataValues.firstName} ${p.dataValues.money} ${p.dataValues.greed}`)
			.join('|');
	}

	it('ergibt bei gleichem Wurf dieselbe Welt', async () => {
		await sequelize.sync();
		await Character.destroy({ where: {} });
		await World.destroy({ where: { id: WORLD_ID } });
		await seedWorld(seededRoll(54));
		const erste: string = await abdruck();

		await Character.destroy({ where: {} });
		await World.destroy({ where: { id: WORLD_ID } });
		await seedWorld(seededRoll(54));

		expect(await abdruck()).toBe(erste);
	}, 120_000);

	it('ergibt bei anderem Wurf eine andere Welt', async () => {
		// Sonst wäre der Würfel eine Attrappe: Eine Welt, die immer gleich anfängt, ist
		// keine Probe für ein Spiel, das von Unterschieden lebt.
		await Character.destroy({ where: {} });
		await World.destroy({ where: { id: WORLD_ID } });
		await seedWorld(seededRoll(54));
		const eine: string = await abdruck();

		await Character.destroy({ where: {} });
		await World.destroy({ where: { id: WORLD_ID } });
		await seedWorld(seededRoll(4711));

		expect(await abdruck()).not.toBe(eine);
	}, 120_000);
});
