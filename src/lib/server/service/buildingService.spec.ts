import { Inventory } from '$lib/db/model/inventory';
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
import * as chronicleService from '$lib/server/service/chronicleService';
import * as plotService from '$lib/server/service/plotService';
import { PLOT_PRICE } from '$lib/game/economy';
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
	await materialGeben(id);
	return id;
}

/**
 * Seit 4.10 kostet Bauen auch Material.
 *
 * Die Testfiguren bekommen reichlich davon in die Kammer: Geprüft wird hier, was der Bau
 * mit Geld und Grundstück macht — dass ohne Bretter nichts geht, steht in
 * `material.spec.ts`.
 */
async function materialGeben(characterId: string): Promise<void> {
	for (const ware of ['PLANK', 'BLOCK', 'IRON']) {
		await Inventory.create({ CharacterId: characterId, itemId: ware, quantity: 200 });
	}
}

/** Ein Gebäude auf eigenem Grund, mit dem angegebenen Stand. */
/**
 * Ein Haus — privat mit Besitzer, städtisch ohne.
 *
 * **Städtisch heißt nicht heimgefallen** (Punkt 79): Was der Stadt aus einem erbenlosen
 * Nachlass zufiel, trägt seit 5.42 einen `escheatedTick`; ohne ihn gehört das Haus ihr
 * von jeher und ist ihre Aufgabe. Wer den Nachlass braucht, gibt ihn über `extras` mit.
 */
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
	await materialGeben(id);
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

		it('schreibt den Kauf in die Chronik', async () => {
			// Beim Zuschlag einer Versteigerung stand er längst; beim Kauf zum Festpreis
			// bis 5.3 nicht — dabei ist ein Grundstück der Anfang von allem, was ein Haus
			// je baut.
			const adelbert = await charakterMitGeld(100);
			const frei = await plotService.getFreeBuildingLand(stadtId);

			await plotService.buyPlot(frei[0].id, adelbert);

			const seins = await chronicleService.getChronicle({ characterId: adelbert });
			const kauf = seins.find((eintrag) => eintrag.kind === 'PLOT_BOUGHT');
			expect(kauf).toBeDefined();
			expect(kauf!.value).toBe(PLOT_PRICE);
			expect(kauf!.detail).toBe(frei[0].address);
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

		// Öffentliche Bauten gehören der Stadt und entstehen aus ihrer Kasse. Ohne diese
		// Schranke kaufte sich ein reiches Haus das einzige Rathaus der Stadt — und die
		// Allgemeinheit müsste es fragen, wo sie wählt. Dass es je Stadt nur eines geben
		// darf, prüft `publicWorks.spec.ts` auf dem Weg, den es dafür gibt.
		it('lässt niemanden ein öffentliches Gebäude auf eigene Rechnung bauen', async () => {
			const adelbert = await charakterMitGeld(100);
			const grundstück = await eigenesGrundstueck(adelbert);
			const rathaus = buildingService.getBuildingOption(RATHAUS)!;

			const ergebnis = await buildingService.build(rathaus, adelbert, grundstück);

			expect(ergebnis).toEqual({ ok: false, reason: 'NOT_IN_OFFICE' });
			expect(await BuildingModel.count()).toBe(0);
			expect(await geld(adelbert)).toBe(100);
		});
	});

	describe('Für Lohn herrichten', () => {
		/**
		 * **Der Ersatz für die Tagelöhnerei** (5.26). Die bestand darin, in die städtische
		 * Schmiede zu gehen und drei Münzen mitzunehmen; niemand bekam etwas dafür. Jetzt
		 * arbeitet man an öffentlichen Bauten, hebt ihren Zustand, und die Stadt zahlt aus
		 * derselben Kasse, aus der sie die Instandhaltung ohnehin bezahlt hat.
		 */
		it('hebt den Zustand und zahlt aus der Stadtkasse', async () => {
			const adelbert = await charakterMitGeld(50);
			// Ein Bau, für den die Stadt einsteht — `beforeEach` räumt die Welt leer, also
			// wird er hier gestellt. Ohne `escheatedTick` gehört er ihr von jeher, und genau
			// das unterscheidet ihn seit Punkt 79 vom heimgefallenen Nachlass.
			const rathausId: string = await haus(null, { optionId: RATHAUS, condition: 40 });
			await RegionModel.update({ treasury: 500 }, { where: { id: stadtId } });

			const ergebnis = await buildingActionService.doBuildingAction(
				'REPAIR_FOR_HIRE',
				adelbert,
				rathausId
			);

			expect(ergebnis.ok).toBe(true);
			expect(await geld(adelbert)).toBeGreaterThan(50);
			// Und was er bekommt, fehlt der Stadt.
			const kasse = (await RegionModel.findByPk(stadtId))!.dataValues.treasury ?? 0;
			expect(kasse).toBeLessThan(500);
			const nachher = await buildingService.getBuilding(rathausId);
			expect(nachher!.condition).toBeGreaterThan(40);
		});

		it('weist ab, wo nichts zu richten ist', async () => {
			const adelbert = await charakterMitGeld(50);
			const rathausId: string = await haus(null, { optionId: RATHAUS, condition: CONDITION_MAX });

			const ergebnis = await buildingActionService.doBuildingAction(
				'REPAIR_FOR_HIRE',
				adelbert,
				rathausId
			);

			expect(ergebnis).toEqual({ ok: false, reason: 'NOTHING_TO_DO' });
		});

		it('gibt an einem heimgefallenen Haus keine Arbeit auf Stadtkosten', async () => {
			// **Punkt 79.** Wer ohne Erben stirbt, dessen Kate fällt an die Stadt — sie wird
			// dadurch aber kein öffentlicher Bau. Bis 5.42 zahlte die Stadtkasse jedem, der
			// daran arbeiten wollte, für ein Haus, das ihr nur bis zur nächsten Versteigerung
			// gehört.
			const adelbert = await charakterMitGeld(50);
			const kate: string = await haus(null, { name: 'Kate', condition: 40, escheatedTick: JETZT });
			await RegionModel.update({ treasury: 500 }, { where: { id: stadtId } });

			const ergebnis = await buildingActionService.doBuildingAction(
				'REPAIR_FOR_HIRE',
				adelbert,
				kate
			);

			expect(ergebnis).toEqual({ ok: false, reason: 'NO_JOB_OFFERED' });
			expect(await geld(adelbert)).toBe(50);
		});

		it('zählt eine heimgefallene Kate nicht zu den öffentlichen Bauten', async () => {
			await haus(null, { name: 'Kate', escheatedTick: JETZT });
			const rathaus: string = await haus(null, { optionId: RATHAUS });

			const oeffentlich = await buildingService.getPublicBuildings(stadtId);
			const heimgefallen = await buildingService.getEscheatedBuildings(stadtId);

			expect(oeffentlich.map((h) => h.id)).toEqual([rathaus]);
			expect(heimgefallen).toHaveLength(1);
			expect(heimgefallen[0].name).toBe('Kate');
		});

		it('gibt an einem privaten Haus keine Arbeit', async () => {
			// **Ohne Auftrag keine Arbeit** (5.27, Punkt 74): Sonst richtete jeder ungefragt
			// fremde Häuser her und schickte die Rechnung. Der Grund ist seither präzise —
			// nicht 'kein Arbeitsplatz', sondern 'kein Angebot': Es liegt am fehlenden
			// Auftrag und nicht an der Art des Hauses.
			const adelbert = await charakterMitGeld(300);
			const grundstueck = await eigenesGrundstueck(adelbert);
			const gebaut = await buildingService.build(
				buildingService.getBuildingOption(SCHMIEDE)!,
				adelbert,
				grundstueck
			);
			const werkstatt: string = gebaut.ok ? gebaut.building.id : '';

			const ergebnis = await buildingActionService.doBuildingAction(
				'REPAIR_FOR_HIRE',
				adelbert,
				werkstatt
			);

			expect(ergebnis).toEqual({ ok: false, reason: 'NO_JOB_OFFERED' });
		});

		it('gibt an einem privaten Haus Arbeit, sobald ein Auftrag aushängt', async () => {
			// **Die andere Hälfte von Punkt 74.** Wer sein Haus nicht selbst richten kann,
			// bietet Lohn — und dann ist es ein Geschäft zwischen zwei Seiten.
			const eigentuemer = await charakterMitGeld(300);
			const arbeiter = await charakterMitGeld(10);
			const hausId: string = await haus(eigentuemer, { condition: 50 });
			await buildingService.offerRepair(eigentuemer, hausId, 4);

			const ergebnis = await buildingActionService.doBuildingAction(
				'REPAIR_FOR_HIRE',
				arbeiter,
				hausId
			);

			expect(ergebnis.ok).toBe(true);
			// Der Eigentümer zahlt, der Arbeiter bekommt — und das Haus steht besser da.
			expect(await geld(arbeiter)).toBeGreaterThan(10);
			expect(await geld(eigentuemer)).toBeLessThan(300);
			const nachher = await buildingService.getBuilding(hausId);
			expect(nachher!.condition).toBeGreaterThan(50);
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

			expect(await buildingService.freierWohnraum(id)).toBe(4);

			expect(await buildingService.upgradeBuilding(besitzer, id)).toMatchObject({ ok: true });

			// Genau hier hängt die Bevölkerungsgrenze aus 4.4: Wer wachsen will, baut aus.
			expect(await buildingService.freierWohnraum(id)).toBe(6);
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

	describe('einziehen', () => {
		it('nimmt einen Obdachlosen in die städtische Unterkunft auf', async () => {
			// Bis 5.6 konnte das nur, wer selbst baute oder heiratete — NPCs zogen längst
			// ein, für Spieler gab es keinen Weg.
			const heimatlos = await person('Heimatlos');
			const unterkunft = await haus(null);

			const ergebnis = await buildingService.moveInto(heimatlos, unterkunft);

			expect(ergebnis.ok).toBe(true);
			expect((await CharacterModel.findByPk(heimatlos))!.dataValues.HomeBuildingId).toBe(
				unterkunft
			);
		});

		it('lässt niemanden in ein fremdes Privathaus', async () => {
			// Miete und Untermiete sind ein eigenes Thema; ungefragt zieht niemand ein.
			const eigentümer = await person('Eigentümer');
			const fremder = await person('Fremder');
			const privat = await haus(eigentümer);

			expect(await buildingService.moveInto(fremder, privat)).toEqual({
				ok: false,
				reason: 'PLOT_NOT_OWNED'
			});
		});

		it('weist ab, wenn kein Platz mehr frei ist', async () => {
			const unterkunft = await haus(null);
			// Die Kate fasst vier — vier Bewohner machen sie voll.
			for (const name of ['Eins', 'Zwei', 'Drei', 'Vier']) {
				const bewohner = await person(name);
				await buildingService.moveInto(bewohner, unterkunft);
			}
			const zuspaet = await person('Zuspät');

			expect(await buildingService.moveInto(zuspaet, unterkunft)).toEqual({
				ok: false,
				reason: 'NO_ROOM'
			});
		});

		it('schreibt den Einzug in die Chronik', async () => {
			const heimatlos = await person('Heimatlos');
			const unterkunft = await haus(null);

			await buildingService.moveInto(heimatlos, unterkunft);

			const seins = await chronicleService.getChronicle({ characterId: heimatlos });
			expect(seins.some((eintrag) => eintrag.kind === 'MOVED_IN')).toBe(true);
		});

		it('zieht einen frischen Charakter von selbst unter das Dach der Stadt', async () => {
			// Ohne das beginnt ein Neuling obdachlos: keine Erholung, keine Kinder — das
			// Ende der Dynastie, bevor sie anfängt.
			//
			// Welches der städtischen Häuser es wird, ist offen: Die Welt bringt mehrere
			// mit. Geprüft wird, dass es überhaupt eines ist und dass es der Stadt gehört.
			await haus(null);
			const neuling = await person('Neuling', { HomeBuildingId: null });

			await buildingService.moveIntoFreeShelter(neuling);

			const dach = (await CharacterModel.findByPk(neuling))!.dataValues.HomeBuildingId;
			expect(dach).not.toBeNull();
			expect((await BuildingModel.findByPk(dach!))!.dataValues.ownerType).toBe('CITY');
		});
	});

	describe('benennen', () => {
		it('nimmt einen Namen vom Eigentümer an', async () => {
			const wirt = await person('Wirt');
			const id = await haus(wirt);

			const ergebnis = await buildingService.renameBuilding(wirt, id, '  Zum goldenen  Weck ');

			expect(ergebnis).toEqual({ ok: true, name: 'Zum goldenen Weck' });
			expect((await BuildingModel.findByPk(id))!.dataValues.name).toBe('Zum goldenen Weck');
		});

		it('lässt fremde Häuser in Ruhe', async () => {
			const eigentümer = await person('Eigentümer');
			const fremder = await person('Fremder');
			const id = await haus(eigentümer);

			expect(await buildingService.renameBuilding(fremder, id, 'Meins')).toEqual({
				ok: false,
				reason: 'NOT_YOURS'
			});
		});

		it('lässt städtische Bauten unbenannt', async () => {
			// Über das Rathaus verfügt auch der Bürgermeister nicht: Sein Name ist der der
			// Stadt, nicht seiner.
			const bürger = await person('Bürger');
			const id = await haus(null);

			expect(await buildingService.renameBuilding(bürger, id, 'Mein Rathaus')).toEqual({
				ok: false,
				reason: 'NOT_YOURS'
			});
		});

		it('weist einen zu kurzen Namen ab', async () => {
			const wirt = await person('Wirt');
			const id = await haus(wirt);

			expect(await buildingService.renameBuilding(wirt, id, ' x ')).toEqual({
				ok: false,
				reason: 'TOO_SHORT'
			});
			expect((await BuildingModel.findByPk(id))!.dataValues.name).toBe('Wohnhaus');
		});
	});
});
