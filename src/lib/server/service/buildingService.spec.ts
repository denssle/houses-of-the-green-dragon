import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building as BuildingModel } from '$lib/db/model/building';
import { Character as CharacterModel } from '$lib/db/model/character';
import { Plot as PlotModel } from '$lib/db/model/plot';
import { Region as RegionModel } from '$lib/db/model/region';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as buildingService from '$lib/server/service/buildingService';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import * as plotService from '$lib/server/service/plotService';
import { PLOT_PRICE } from '$lib/game/economy';

/**
 * Phase 3.2 und 3.3 gegen eine echte Datenbank: Was die Logik entscheidet, muss auch
 * geschrieben werden — vollständig oder gar nicht.
 */

const SCHMIEDE = 2;
const WOHNHAUS = 1;
const RATHAUS = 0;

let stadtId: string;

/** Ein Spielercharakter in der Startstadt mit dem gegebenen Vermögen. */
async function charakterMitGeld(money: number): Promise<string> {
	const id = randomUUID();
	await CharacterModel.create({
		id,
		firstName: 'Adelbert',
		role: 'PLAYER',
		gender: 'MALE',
		birthTick: 0,
		lastTickProcessed: 0,
		actionPoints: 48,
		money,
		RegionId: stadtId
	});
	return id;
}

async function geld(characterId: string): Promise<number> {
	const gefunden = await CharacterModel.findByPk(characterId);
	return gefunden!.dataValues.money;
}

/** Ein freies Baugrundstück, das dem Charakter gehört. */
async function eigenesGrundstueck(characterId: string): Promise<string> {
	const frei = await PlotModel.findOne({
		where: { RegionId: stadtId, type: 'BUILDING_LAND', ownerType: 'NONE' }
	});
	await frei!.update({ ownerType: 'CHARACTER', OwnerCharacterId: characterId });
	return frei!.dataValues.id;
}

describe('Bauen und Arbeiten', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await BuildingModel.destroy({ where: {} });
		await PlotModel.update(
			{ ownerType: 'NONE', OwnerCharacterId: null },
			{ where: { type: 'BUILDING_LAND' } }
		);
		await CharacterModel.destroy({ where: { role: 'PLAYER' } });
		await RegionModel.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	describe('Grundstückskauf', () => {
		it('macht den Käufer zum Eigentümer und füllt die Stadtkasse', async () => {
			const adelbert = await charakterMitGeld(100);
			const frei = await plotService.getFreeBuildingLand(stadtId);

			const ergebnis = await plotService.buyPlot(frei[0].id, adelbert);

			expect(ergebnis.ok).toBe(true);
			expect(await geld(adelbert)).toBe(100 - PLOT_PRICE);
			const stadt = await RegionModel.findByPk(stadtId);
			expect(stadt!.dataValues.treasury).toBe(PLOT_PRICE);
			const gekauft = await plotService.getPlot(frei[0].id);
			expect(gekauft).toMatchObject({ ownerType: 'CHARACTER', ownerCharacterId: adelbert });
		});

		it('lässt bei zu wenig Geld alles, wie es war', async () => {
			const arm = await charakterMitGeld(PLOT_PRICE - 1);
			const frei = await plotService.getFreeBuildingLand(stadtId);

			const ergebnis = await plotService.buyPlot(frei[0].id, arm);

			expect(ergebnis).toEqual({ ok: false, reason: 'NOT_ENOUGH_MONEY' });
			expect(await geld(arm)).toBe(PLOT_PRICE - 1);
			const stadt = await RegionModel.findByPk(stadtId);
			expect(stadt!.dataValues.treasury).toBe(0);
			expect((await plotService.getPlot(frei[0].id))?.ownerType).toBe('NONE');
		});

		it('vergibt dasselbe Grundstück kein zweites Mal', async () => {
			const adelbert = await charakterMitGeld(100);
			const bertram = await charakterMitGeld(100);
			const frei = await plotService.getFreeBuildingLand(stadtId);

			await plotService.buyPlot(frei[0].id, adelbert);
			const zweiter = await plotService.buyPlot(frei[0].id, bertram);

			expect(zweiter).toEqual({ ok: false, reason: 'PLOT_NOT_OWNED' });
			expect(await geld(bertram)).toBe(100);
		});
	});

	describe('Bauen', () => {
		it('zieht das Geld ab und stellt das Haus aufs Grundstück', async () => {
			const adelbert = await charakterMitGeld(300);
			const grundstück = await eigenesGrundstueck(adelbert);
			const option = buildingService.getBuildingOption(SCHMIEDE)!;

			const ergebnis = await buildingService.build(option, adelbert, grundstück);

			expect(ergebnis.ok).toBe(true);
			expect(await geld(adelbert)).toBe(50);
			const gebaut = ergebnis.ok ? await buildingService.getBuilding(ergebnis.building.id) : null;
			expect(gebaut).toMatchObject({ plotId: grundstück, ownerCharacterId: adelbert });
		});

		it('lässt den Bauherrn in sein erstes Wohnhaus einziehen', async () => {
			const adelbert = await charakterMitGeld(300);
			const grundstück = await eigenesGrundstueck(adelbert);
			const wohnhaus = buildingService.getBuildingOption(WOHNHAUS)!;

			const ergebnis = await buildingService.build(wohnhaus, adelbert, grundstück);

			const bewohner = await CharacterModel.findByPk(adelbert);
			expect(bewohner!.dataValues.HomeBuildingId).toBe(ergebnis.ok && ergebnis.building.id);
		});

		it('lässt eine Schmiede kein Zuhause werden', async () => {
			const adelbert = await charakterMitGeld(300);
			const grundstück = await eigenesGrundstueck(adelbert);
			const schmiede = buildingService.getBuildingOption(SCHMIEDE)!;

			await buildingService.build(schmiede, adelbert, grundstück);

			const bewohner = await CharacterModel.findByPk(adelbert);
			expect(bewohner!.dataValues.HomeBuildingId).toBeNull();
		});

		it('nimmt bei zu wenig Geld weder Münze noch Grundstück', async () => {
			const adelbert = await charakterMitGeld(249);
			const grundstück = await eigenesGrundstueck(adelbert);
			const option = buildingService.getBuildingOption(SCHMIEDE)!;

			const ergebnis = await buildingService.build(option, adelbert, grundstück);

			expect(ergebnis).toEqual({ ok: false, reason: 'NOT_ENOUGH_MONEY' });
			expect(await geld(adelbert)).toBe(249);
			expect(await BuildingModel.count()).toBe(0);
		});

		it('baut nicht auf fremdem Grund', async () => {
			const adelbert = await charakterMitGeld(300);
			const bertram = await charakterMitGeld(300);
			const grundstück = await eigenesGrundstueck(bertram);
			const option = buildingService.getBuildingOption(SCHMIEDE)!;

			const ergebnis = await buildingService.build(option, adelbert, grundstück);

			expect(ergebnis).toEqual({ ok: false, reason: 'PLOT_NOT_OWNED' });
			expect(await geld(adelbert)).toBe(300);
		});

		it('stellt kein zweites Haus auf dasselbe Grundstück', async () => {
			const adelbert = await charakterMitGeld(500);
			const grundstück = await eigenesGrundstueck(adelbert);
			const wohnhaus = buildingService.getBuildingOption(WOHNHAUS)!;
			await buildingService.build(wohnhaus, adelbert, grundstück);

			const zweites = await buildingService.build(wohnhaus, adelbert, grundstück);

			expect(zweites).toEqual({ ok: false, reason: 'PLOT_ALREADY_BUILT' });
			expect(await BuildingModel.count()).toBe(1);
		});

		it('lässt das Rathaus nur einmal je Stadt zu', async () => {
			const adelbert = await charakterMitGeld(100);
			const erstes = await eigenesGrundstueck(adelbert);
			const rathaus = buildingService.getBuildingOption(RATHAUS)!;
			await buildingService.build(rathaus, adelbert, erstes);
			const zweites = await eigenesGrundstueck(adelbert);

			const ergebnis = await buildingService.build(rathaus, adelbert, zweites);

			expect(ergebnis).toEqual({ ok: false, reason: 'LIMIT_REACHED' });
		});
	});

	describe('Arbeiten', () => {
		async function schmiede(besitzerId: string): Promise<string> {
			const grundstück = await eigenesGrundstueck(besitzerId);
			const option = buildingService.getBuildingOption(SCHMIEDE)!;
			const gebaut = await buildingService.build(option, besitzerId, grundstück);
			if (!gebaut.ok) throw new Error('Die Schmiede ließ sich nicht bauen');
			return gebaut.building.id;
		}

		it('schreibt Lohn und verbrauchte Aktionspunkte fort', async () => {
			const adelbert = await charakterMitGeld(300);
			const werkstatt = await schmiede(adelbert);
			const vorher = await CharacterModel.findByPk(adelbert);

			const ergebnis = await buildingActionService.doBuildingAction('WORK', adelbert, werkstatt);

			expect(ergebnis).toEqual({ ok: true, earned: 3 });
			const nachher = await CharacterModel.findByPk(adelbert);
			expect(nachher!.dataValues.money).toBe(vorher!.dataValues.money + 3);
			expect(nachher!.dataValues.actionPoints).toBe(vorher!.dataValues.actionPoints - 1);
		});

		it('weist ab, wem die Aktionspunkte fehlen — ohne Lohn', async () => {
			const adelbert = await charakterMitGeld(300);
			const werkstatt = await schmiede(adelbert);
			await CharacterModel.update({ actionPoints: 0 }, { where: { id: adelbert } });
			const vorher = await geld(adelbert);

			const ergebnis = await buildingActionService.doBuildingAction('WORK', adelbert, werkstatt);

			expect(ergebnis).toEqual({ ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' });
			expect(await geld(adelbert)).toBe(vorher);
		});

		it('gibt im Wohnhaus keine Arbeit', async () => {
			const adelbert = await charakterMitGeld(300);
			const grundstück = await eigenesGrundstueck(adelbert);
			const wohnhaus = buildingService.getBuildingOption(WOHNHAUS)!;
			const gebaut = await buildingService.build(wohnhaus, adelbert, grundstück);

			const ergebnis = await buildingActionService.doBuildingAction(
				'WORK',
				adelbert,
				gebaut.ok ? gebaut.building.id : ''
			);

			expect(ergebnis).toEqual({ ok: false, reason: 'NOT_A_WORKPLACE' });
		});
	});
});
