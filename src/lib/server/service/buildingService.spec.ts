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
import * as familyService from '$lib/server/service/familyService';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { CONDITION_MAX, YEARS_TO_RUIN } from '$lib/game/building.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 3.2 und 3.3 gegen eine echte Datenbank: Was die Logik entscheidet, muss auch
 * geschrieben werden — vollständig oder gar nicht.
 */

const JETZT = 10_000;
let stadtId: string;

async function person(name: string, extras: Record<string, unknown> = {}): Promise<string> {
	const id = randomUUID();
	await CharacterModel.create({
		id,
		firstName: name,
		role: 'PLAYER',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 5000,
		RegionId: stadtId,
		...extras
	});
	return id;
}

/** Ein Gebäude auf eigenem Grund, mit dem angegebenen Stand. */
async function haus(
	besitzerId: string | null,
	extras: Record<string, unknown> = {}
): Promise<string> {
	const plotId = randomUUID();
	await PlotModel.create({
		id: plotId,
		address: `Baugasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: besitzerId ? 'CHARACTER' : 'CITY',
		OwnerCharacterId: besitzerId
	});
	const id = randomUUID();
	await BuildingModel.create({
		id,
		name: 'Wohnhaus',
		optionId: 1,
		condition: CONDITION_MAX,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: besitzerId ? 'CHARACTER' : 'CITY',
		OwnerCharacterId: besitzerId,
		...extras
	});
	return id;
}

async function weltzeit(tick: number): Promise<void> {
	await World.update({ currentTick: tick }, { where: { id: WORLD_ID } });
}

const SCHMIEDE = 2;
const WOHNHAUS = 1;
const RATHAUS = 0;

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

describe('Gebäude über die Zeit', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await weltzeit(JETZT);
		await BuildingModel.destroy({ where: { ownerType: 'CHARACTER' } });
		await PlotModel.destroy({ where: { ownerType: 'CHARACTER' } });
		await CharacterModel.destroy({ where: {} });
	});

	describe('der Verfall', () => {
		it('zeigt beim Lesen den gealterten Zustand', async () => {
			const besitzer = await person('Besitzer');
			const id = await haus(besitzer);
			await weltzeit(JETZT + yearsToTicks(YEARS_TO_RUIN / 2));

			expect((await buildingService.getBuilding(id))?.condition).toBe(50);
		});

		it('schreibt beim Lesen nichts fort', async () => {
			// Wie bei der Zuneigung: Wer oft nachsieht, findet dasselbe vor.
			const besitzer = await person('Besitzer');
			const id = await haus(besitzer);
			await weltzeit(JETZT + yearsToTicks(5));

			for (let i = 0; i < 3; i++) await buildingService.getBuilding(id);

			const zeile = await BuildingModel.findByPk(id);
			expect(zeile!.dataValues.condition).toBe(CONDITION_MAX);
			expect(zeile!.dataValues.lastConditionTick).toBe(JETZT);
		});

		it('lässt öffentliche Gebäude verfallen, aber nicht einstürzen', async () => {
			// Seit 4.7c gilt für sie dieselbe Regel wie für private — der Zustand senkt den
			// Ertrag, und der Bürgermeister hat eine Aufgabe. Einstürzen dürfen sie
			// trotzdem nicht: Ein eingestürztes Rathaus nähme der Stadt die Wahl, eine
			// eingestürzte Unterkunft setzte alle Obdachlosen auf die Straße — und neu
			// bauen kann keiner von beidem.
			const id = await haus(null);
			await weltzeit(JETZT + yearsToTicks(YEARS_TO_RUIN * 3));

			expect((await buildingService.getBuilding(id))?.condition).toBe(0);
			expect(await BuildingModel.findByPk(id)).not.toBeNull();
		});
	});

	describe('die Ruine', () => {
		it('lässt das Gebäude verschwinden, das Grundstück bleibt', async () => {
			const besitzer = await person('Besitzer');
			const id = await haus(besitzer);
			await weltzeit(JETZT + yearsToTicks(YEARS_TO_RUIN));

			expect(await buildingService.getBuilding(id)).toBeUndefined();
			expect(await BuildingModel.findByPk(id)).toBeNull();
			// Genau so gibt die Welt Bauland zurück.
			expect(await PlotModel.count({ where: { OwnerCharacterId: besitzer } })).toBe(1);
		});

		it('greift auch, wenn nur die Liste geladen wird', async () => {
			// Sonst hinge es vom Zufall ab, wann ein Haus zusammenfällt.
			const besitzer = await person('Besitzer');
			await haus(besitzer);
			await weltzeit(JETZT + yearsToTicks(YEARS_TO_RUIN));

			expect(await buildingService.getBuildingsOfCharacter(besitzer)).toHaveLength(0);
			expect(await BuildingModel.count({ where: { ownerType: 'CHARACTER' } })).toBe(0);
		});

		it('lässt die Bewohner ohne Dach zurück', async () => {
			const besitzer = await person('Besitzer');
			const id = await haus(besitzer);
			await CharacterModel.update({ HomeBuildingId: id }, { where: { id: besitzer } });
			await weltzeit(JETZT + yearsToTicks(YEARS_TO_RUIN));

			await buildingService.getBuilding(id);

			const danach = await CharacterModel.findByPk(besitzer);
			expect(danach!.dataValues.HomeBuildingId).toBeNull();
		});
	});

	describe('renovieren', () => {
		it('setzt den Zustand zurück und den Stichtag mit', async () => {
			const besitzer = await person('Besitzer');
			const id = await haus(besitzer);
			const spaeter: number = JETZT + yearsToTicks(10);
			await weltzeit(spaeter);

			expect(await buildingService.renovateBuilding(besitzer, id)).toMatchObject({ ok: true });

			// Ohne den Stichtag liefe der Verfall ab dem alten Datum weiter — die
			// Renovierung wäre im selben Moment wieder verbraucht.
			expect((await buildingService.getBuilding(id))?.condition).toBe(CONDITION_MAX);
		});

		it('gehört dem Eigentümer', async () => {
			const besitzer = await person('Besitzer');
			const fremder = await person('Fremder');
			const id = await haus(besitzer);
			await weltzeit(JETZT + yearsToTicks(10));

			expect(await buildingService.renovateBuilding(fremder, id)).toEqual({
				ok: false,
				reason: 'PLOT_NOT_OWNED'
			});
		});
	});

	describe('ausbauen', () => {
		it('hebt die Stufe und damit den Wohnraum', async () => {
			const besitzer = await person('Besitzer');
			const id = await haus(besitzer);

			expect(await familyService.freierWohnraum(id)).toBe(4);

			expect(await buildingService.upgradeBuilding(besitzer, id)).toMatchObject({ ok: true });

			// Genau hier hängt die Bevölkerungsgrenze aus 4.4: Wer wachsen will, baut aus.
			expect(await familyService.freierWohnraum(id)).toBe(6);
		});

		it('macht das alte Gemäuer nicht neu', async () => {
			const besitzer = await person('Besitzer');
			const id = await haus(besitzer);
			await weltzeit(JETZT + yearsToTicks(YEARS_TO_RUIN / 2));

			await buildingService.upgradeBuilding(besitzer, id);

			expect((await buildingService.getBuilding(id))?.condition).toBe(50);
		});
	});

	describe('verkaufen', () => {
		it('lässt Geld, Gebäude und Grundstück auf einmal wechseln', async () => {
			const verkäufer = await person('Verkäufer');
			const käufer = await person('Käufer');
			const id = await haus(verkäufer);
			await buildingService.setBuildingPrice(verkäufer, id, 300);

			expect(await buildingService.buyBuilding(käufer, id)).toMatchObject({ ok: true });

			const gebäude = await BuildingModel.findByPk(id);
			expect(gebäude!.dataValues.OwnerCharacterId).toBe(käufer);
			expect(gebäude!.dataValues.forSalePrice).toBeNull();
			// Das Grundstück wandert mit — ein Haus auf fremdem Boden wäre eine Pacht.
			expect(await PlotModel.count({ where: { OwnerCharacterId: käufer } })).toBe(1);
			expect((await CharacterModel.findByPk(verkäufer))!.dataValues.money).toBe(5300);
			expect((await CharacterModel.findByPk(käufer))!.dataValues.money).toBe(4700);
		});

		it('geht nicht ohne Preisschild', async () => {
			const verkäufer = await person('Verkäufer');
			const käufer = await person('Käufer');
			const id = await haus(verkäufer);

			expect(await buildingService.buyBuilding(käufer, id)).toEqual({
				ok: false,
				reason: 'NOT_FOR_SALE'
			});
		});
	});
});
