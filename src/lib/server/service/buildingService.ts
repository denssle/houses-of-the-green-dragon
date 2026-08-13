import type { ActionFailureReason } from '$lib/game/actionFailure';
import { randomUUID } from 'node:crypto';
import { type Model, Op, type Transaction } from 'sequelize';
import type { Building } from '$lib/model/building';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import { sequelize } from '$lib/db/sequelize';
import { Building as BuildingModel } from '$lib/db/model/building';
import { Plot as PlotModel } from '$lib/db/model/plot';
import { convertToBuilding } from '$lib/db/attributes/building.attributes';
import { build as buildLogic } from '$lib/game/buildingAction.logic';
import {
	currentCondition,
	isRuin,
	purchase,
	renovate,
	RENOVATION_ACTION_POINT_COST,
	upgrade,
	UPGRADE_ACTION_POINT_COST
} from '$lib/game/building.logic';
import { Character as CharacterModel } from '$lib/db/model/character';
import type {
	BuildingAttributes,
	BuildingCreationAttributes
} from '$lib/db/attributes/building.attributes';
import * as characterService from '$lib/server/service/characterService';
import * as skillService from '$lib/server/service/skillService';
import * as worldService from '$lib/server/service/worldService';
import { seasonOf } from '$lib/game/time';

/**
 * Die Vorlagen bleiben Code und wandern nicht in die Datenbank: Preise, Aktionen und
 * Grenzen sollen sich ändern lassen, ohne dass Bestandsgebäude davon unberührt bleiben.
 */
export function getBuildingOptions(): BuildingTemplate[] {
	return [
		{
			optionId: 0,
			initialName: 'Rathaus',
			type: 'PUBLIC',
			description: 'Das Rathaus der Stadt',
			limited: true,
			limitedTo: 1,
			actions: [],
			levels: [{ price: 0, name: 'Rathaus' }]
		},
		{
			optionId: 1,
			initialName: 'Wohnhaus',
			type: 'RESIDENCE',
			description: 'Ein einfaches Wohnhaus',
			limited: false,
			limitedTo: 0,
			actions: [],
			// Die Leiter, an der die Bevölkerung hängt: Wer viele Kinder will, muss
			// zweimal ausbauen — und danach ein zweites Grundstück kaufen. Spürbare
			// Sprünge, aber kein Vervielfachen, damit knappes Bauland die härtere Grenze
			// bleibt.
			levels: [
				{ price: 100, name: 'Kate', residents: 4 },
				{ price: 150, name: 'Haus', residents: 6 },
				{ price: 400, name: 'Großhaus', residents: 9 }
			]
		},
		{
			optionId: 2,
			initialName: 'Schmiede',
			type: 'CRAFT',
			description: 'Ein bescheidener Handwerksbetrieb',
			limited: false,
			limitedTo: 0,
			actions: ['WORK'],
			skill: 'SMITHING',
			levels: [
				{ price: 250, name: 'Schmiede', wagePerActionPoint: 3 },
				{ price: 400, name: 'Werkstatt', wagePerActionPoint: 5 },
				{ price: 900, name: 'Betrieb', wagePerActionPoint: 8 }
			]
		}
	];
}

export function getBuildingOption(optionId: number): BuildingTemplate | undefined {
	return getBuildingOptions().find((option) => option.optionId === optionId);
}

/**
 * Ist das Limit für diese Gebäudeart erreicht?
 *
 * Gezählt wird **je Stadt**, nicht je Welt: Ein Rathaus gehört in jede Stadt, nicht
 * einmal in die ganze Welt. Die Region ergibt sich aus dem Grundstück, auf dem das
 * Gebäude steht — Bauwerke ohne Grundstück (eine Stadtmauer etwa) zählen nicht mit, sie
 * bekommen ihre eigene Regel, sobald es sie gibt.
 */
export async function limitReached(
	option: BuildingTemplate,
	regionId: string,
	transaction?: Transaction
): Promise<boolean> {
	if (!option.limited) return false;
	const vorhanden = await BuildingModel.count({
		where: { optionId: option.optionId },
		include: [{ model: PlotModel, as: 'plot', where: { RegionId: regionId }, required: true }],
		transaction
	});
	return vorhanden >= option.limitedTo;
}

export type BuildResult =
	| { ok: true; building: Building }
	| { ok: false; reason: ActionFailureReason };

/**
 * Errichtet ein Gebäude auf einem eigenen, freien Grundstück.
 *
 * Alles in **einer** Transaktion mit Sperre auf die Charakterzeile: Geld abziehen und
 * Gebäude anlegen, oder keins von beidem. Ohne sie könnten zwei gleichzeitige Requests
 * dieselben Münzen zweimal ausgeben — das klassische Loch in Browserspielen, und es
 * betrifft nicht nur den Gebäudekauf, sondern jede Handlung, die Ressourcen verbraucht.
 */
export async function build(
	option: BuildingTemplate,
	characterId: string,
	plotId: string
): Promise<BuildResult> {
	const tick = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const bauherr = await characterService.loadForAction(characterId, tick, t);
		if (!bauherr) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		const grundstück = await PlotModel.findByPk(plotId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!grundstück) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		const schonBebaut = await BuildingModel.count({ where: { PlotId: plotId }, transaction: t });
		const grenzeErreicht = await limitReached(option, grundstück.dataValues.RegionId, t);

		const ergebnis = buildLogic(
			{ id: characterId, money: bauherr.dataValues.money },
			{
				ownerCharacterId: grundstück.dataValues.OwnerCharacterId,
				regionId: grundstück.dataValues.RegionId,
				hasBuilding: schonBebaut > 0
			},
			option,
			grenzeErreicht
		);
		if (!ergebnis.ok) return ergebnis;

		const angelegt = await BuildingModel.create(
			{
				id: randomUUID(),
				name: option.initialName,
				optionId: option.optionId,
				lastConditionTick: tick,
				PlotId: plotId,
				ownerType: 'CHARACTER',
				OwnerCharacterId: characterId
			},
			{ transaction: t }
		);

		// Wer sein erstes Wohnhaus baut, zieht ein. Ohne diese Zeile stünde er mit einem
		// eigenen Haus in der Stadt und trotzdem als obdachlos auf seiner Seite — ein
		// Umzug als eigene Handlung lohnt erst, wenn es mehrere Häuser zur Wahl gibt.
		const ziehtEin: boolean = option.type === 'RESIDENCE' && !bauherr.dataValues.HomeBuildingId;
		await bauherr.update(
			{
				money: ergebnis.money,
				...(ziehtEin ? { HomeBuildingId: angelegt.dataValues.id } : {})
			},
			{ transaction: t }
		);

		return { ok: true, building: convertToBuilding(angelegt.dataValues) } as const;
	});
}

/**
 * Der Zustand, wie er jetzt ist — und die Ruine, falls er aufgebraucht ist.
 *
 * **Diese Prüfung muss an jeder Ladestelle greifen**, nicht nur auf der Gebäudeseite.
 * Sonst hinge es vom Zufall ab, wann ein Haus zusammenfällt: Ein Gebäude, das nur in
 * einer Liste auftaucht, bliebe ewig stehen, während dasselbe Gebäude beim direkten
 * Aufruf zur Ruine würde.
 *
 * Gibt `null` zurück, wenn das Gebäude dabei verschwunden ist.
 */
async function mitZustand(
	instanz: Model<BuildingAttributes, BuildingCreationAttributes>,
	tick: number
): Promise<Building | null> {
	const zustand: number = zustandVon(instanz, tick);

	if (isRuin(zustand)) {
		await zurRuineWerden(instanz);
		return null;
	}
	return { ...convertToBuilding(instanz.dataValues), condition: Math.round(zustand) };
}

/**
 * Der rechnerische Zustand einer Gebäudezeile.
 *
 * **Öffentliche Gebäude verfallen vorläufig nicht.** Ihre Instandhaltung ist eine
 * Amtshandlung aus der Stadtkasse, und die gibt es erst mit 4.7. Ohne diese Ausnahme
 * verfiele die städtische Schmiede in zwanzig Spieljahren zur Ruine — und mit ihr der
 * einzige Weg, auf dem ein Neuling überhaupt Geld verdienen kann.
 */
function zustandVon(
	instanz: Model<BuildingAttributes, BuildingCreationAttributes>,
	tick: number
): number {
	if (instanz.dataValues.ownerType === 'CITY') return instanz.dataValues.condition;
	return currentCondition(instanz.dataValues.condition, instanz.dataValues.lastConditionTick, tick);
}

/**
 * Am Ende des Verfalls: Das Haus ist weg, das Grundstück bleibt.
 *
 * Genau so gibt die Welt Bauland zurück, ohne dass jemand eingreifen muss — ohne Ruinen
 * blockierten aufgegebene Häuser die Stadt für immer. Die Bewohner stehen danach ohne
 * Dach da; ihre Zeile bleibt, nur das Zuhause ist keines mehr.
 */
async function zurRuineWerden(
	instanz: Model<BuildingAttributes, BuildingCreationAttributes>
): Promise<void> {
	await sequelize.transaction(async (t: Transaction) => {
		// Ausdrücklich und nicht über den Fremdschlüssel: `ON DELETE SET NULL` gilt nur,
		// wenn die Datenbank Fremdschlüssel überhaupt durchsetzt — SQLite tut das nur mit
		// eingeschaltetem Pragma. Wer hier auf die Datenbank vertraut, bekommt Bewohner,
		// die in einem Haus wohnen, das es nicht mehr gibt.
		await CharacterModel.update(
			{ HomeBuildingId: null },
			{ where: { HomeBuildingId: instanz.dataValues.id }, transaction: t }
		);
		await instanz.destroy({ transaction: t });
	});
}

export async function getBuilding(buildingId: string): Promise<Building | undefined> {
	const gefunden = await BuildingModel.findByPk(buildingId);
	if (!gefunden) return undefined;

	return (await mitZustand(gefunden, await worldService.currentTick())) ?? undefined;
}

/** In welcher Region ein Gebäude steht — über sein Grundstück. */
export async function getBuildingRegionId(buildingId: string): Promise<string | undefined> {
	const gefunden = await BuildingModel.findByPk(buildingId, {
		include: [{ model: PlotModel, as: 'plot' }]
	});
	const grundstück = gefunden?.get('plot') as { dataValues: { RegionId: string } } | undefined;
	return grundstück?.dataValues.RegionId;
}

/** Alle Gebäude einer Region — die Häuserzeile der Stadt. */
export async function getBuildingsInRegion(regionId: string): Promise<Building[]> {
	const alle = await BuildingModel.findAll({
		include: [{ model: PlotModel, as: 'plot', where: { RegionId: regionId }, required: true }]
	});
	return lebende(alle, await worldService.currentTick());
}

/** Was einem Charakter gehört. */
export async function getBuildingsOfCharacter(characterId: string): Promise<Building[]> {
	const alle = await BuildingModel.findAll({
		where: { OwnerCharacterId: characterId, ownerType: 'CHARACTER' }
	});
	return lebende(alle, await worldService.currentTick());
}

/** Wendet die Ruinen-Prüfung auf eine ganze Liste an. */
async function lebende(
	alle: Model<BuildingAttributes, BuildingCreationAttributes>[],
	tick: number
): Promise<Building[]> {
	const stehende: Building[] = [];
	for (const eintrag of alle) {
		const gebäude = await mitZustand(eintrag, tick);
		if (gebäude) stehende.push(gebäude);
	}
	return stehende;
}

// --- Instandhalten und ausbauen ------------------------------------------------------

export type MaintenanceResult =
	| { ok: true; spent: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Renovieren: Zustand auf Anfang, bezahlt nach dem, was fehlt.
 *
 * Wie jede Handlung mit Ressourcen: sperren, nachwachsen lassen, abrechnen. Nur der
 * Eigentümer darf — ein fremdes Haus zu renovieren wäre ein Geschenk, und Geschenke
 * gehören zu 4.6.
 */
export async function renovateBuilding(
	characterId: string,
	buildingId: string
): Promise<MaintenanceResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const gebäude = await BuildingModel.findByPk(buildingId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!gebäude || gebäude.dataValues.OwnerCharacterId !== characterId) {
			return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;
		}

		const eigentümer = await characterService.loadForAction(characterId, tick, t);
		if (!eigentümer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const ergebnis = renovate(
			{
				actionPoints: eigentümer.dataValues.actionPoints,
				money: eigentümer.dataValues.money,
				buildingSkill: await skillService.getLevel(characterId, 'CONSTRUCTION', t)
			},
			zustandVon(gebäude, tick),
			seasonOf(tick)
		);
		if (!ergebnis.ok) return ergebnis;

		await eigentümer.update(
			{ actionPoints: ergebnis.actionPoints, money: ergebnis.money },
			{ transaction: t }
		);
		// `lastConditionTick` mitschreiben: Ohne ihn liefe der Verfall ab dem alten
		// Stichtag weiter und die Renovierung wäre im selben Moment wieder verbraucht.
		await gebäude.update(
			{ condition: ergebnis.condition, lastConditionTick: tick },
			{ transaction: t }
		);
		// Renovieren schult das Bauen — vier Aktionspunkte, vier Uebungen.
		await skillService.addPractice(characterId, 'CONSTRUCTION', RENOVATION_ACTION_POINT_COST, t);
		return { ok: true, spent: ergebnis.spent } as const;
	});
}

/** Eine Ausbaustufe höher — aus der Kate ein Haus. */
export async function upgradeBuilding(
	characterId: string,
	buildingId: string
): Promise<MaintenanceResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const gebäude = await BuildingModel.findByPk(buildingId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!gebäude || gebäude.dataValues.OwnerCharacterId !== characterId) {
			return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;
		}
		const vorlage = getBuildingOption(gebäude.dataValues.optionId);
		if (!vorlage) return { ok: false, reason: 'NOTHING_TO_DO' } as const;

		const eigentümer = await characterService.loadForAction(characterId, tick, t);
		if (!eigentümer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const ergebnis = upgrade(
			{
				actionPoints: eigentümer.dataValues.actionPoints,
				money: eigentümer.dataValues.money
			},
			vorlage,
			gebäude.dataValues.level,
			seasonOf(tick)
		);
		if (!ergebnis.ok) return ergebnis;

		await eigentümer.update(
			{ actionPoints: ergebnis.actionPoints, money: ergebnis.money },
			{ transaction: t }
		);
		// Der Zustand bleibt, wie er war — ein Anbau macht das alte Gemäuer nicht neu.
		// Deshalb wird hier auch `lastConditionTick` nicht angefasst.
		await gebäude.update({ level: ergebnis.level }, { transaction: t });
		await skillService.addPractice(characterId, 'CONSTRUCTION', UPGRADE_ACTION_POINT_COST, t);
		return { ok: true, spent: ergebnis.spent } as const;
	});
}

// --- Handel --------------------------------------------------------------------------

/** Ein Preisschild anhängen — oder abnehmen, mit `null`. */
export async function setBuildingPrice(
	characterId: string,
	buildingId: string,
	price: number | null
): Promise<MaintenanceResult> {
	const gebäude = await BuildingModel.findByPk(buildingId);
	if (!gebäude || gebäude.dataValues.OwnerCharacterId !== characterId) {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}
	await gebäude.update({ forSalePrice: price });
	return { ok: true, spent: 0 };
}

/**
 * Ein Gebäude kaufen, das jemand zum Verkauf gestellt hat.
 *
 * Das Geld wechselt zwischen zwei Charakteren — anders als beim Erstverkauf von Bauland,
 * wo es an die Stadt geht. Das Grundstück darunter wechselt **mit**: Ein Haus auf
 * fremdem Boden wäre ein Pachtverhältnis, und das ist ein eigenes Ding (4.6).
 */
export async function buyBuilding(
	characterId: string,
	buildingId: string
): Promise<MaintenanceResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const gebäude = await BuildingModel.findByPk(buildingId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!gebäude) return { ok: false, reason: 'NOT_FOR_SALE' } as const;

		const käufer = await characterService.loadForAction(characterId, tick, t);
		if (!käufer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const ergebnis = purchase(
			{ id: characterId, money: käufer.dataValues.money },
			{
				ownerId: gebäude.dataValues.OwnerCharacterId,
				forSalePrice: gebäude.dataValues.forSalePrice
			}
		);
		if (!ergebnis.ok) return ergebnis;

		const verkäuferId: string | null = gebäude.dataValues.OwnerCharacterId;
		await käufer.update({ money: ergebnis.buyerMoney }, { transaction: t });
		if (verkäuferId) {
			await CharacterModel.increment('money', {
				by: ergebnis.price,
				where: { id: verkäuferId },
				transaction: t
			});
		}

		await gebäude.update(
			{ OwnerCharacterId: characterId, ownerType: 'CHARACTER', forSalePrice: null },
			{ transaction: t }
		);
		if (gebäude.dataValues.PlotId) {
			await PlotModel.update(
				{ OwnerCharacterId: characterId, ownerType: 'CHARACTER', forSalePrice: null },
				{ where: { id: gebäude.dataValues.PlotId }, transaction: t }
			);
		}
		return { ok: true, spent: ergebnis.price } as const;
	});
}

/** Was in dieser Stadt zum Verkauf steht. */
export async function getBuildingsForSale(regionId: string): Promise<Building[]> {
	const alle = await BuildingModel.findAll({
		where: { ownerType: 'CHARACTER', forSalePrice: { [Op.ne]: null } },
		include: [{ model: PlotModel, as: 'plot', where: { RegionId: regionId }, required: true }]
	});
	return lebende(alle, await worldService.currentTick());
}
