import { randomUUID } from 'node:crypto';
import { type Transaction } from 'sequelize';
import type { Building } from '$lib/model/building';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import { sequelize } from '$lib/db/sequelize';
import { Building as BuildingModel } from '$lib/db/model/building';
import { Character as CharacterModel } from '$lib/db/model/character';
import { Plot as PlotModel } from '$lib/db/model/plot';
import { convertToBuilding } from '$lib/db/attributes/building.attributes';
import { build as buildLogic, type ActionFailureReason } from '$lib/game/buildingAction.logic';
import * as worldService from '$lib/server/service/worldService';

/**
 * Die Vorlagen bleiben Code und wandern nicht in die Datenbank: Preise, Aktionen und
 * Grenzen sollen sich ändern lassen, ohne dass Bestandsgebäude davon unberührt bleiben.
 */
export function getBuildingOptions(): BuildingTemplate[] {
	return [
		{
			optionId: 0,
			price: 0,
			initialName: 'Rathaus',
			type: 'PUBLIC',
			description: 'Das Rathaus der Stadt',
			limited: true,
			limitedTo: 1,
			actions: []
		},
		{
			optionId: 1,
			price: 100,
			initialName: 'Wohnhaus',
			type: 'RESIDENCE',
			description: 'Ein einfaches Wohnhaus',
			limited: false,
			limitedTo: 0,
			actions: []
		},
		{
			optionId: 2,
			price: 250,
			initialName: 'Schmiede',
			type: 'CRAFT',
			description: 'Ein bescheidener Handwerksbetrieb',
			limited: false,
			limitedTo: 0,
			actions: ['WORK'],
			wagePerActionPoint: 3
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
	return sequelize.transaction(async (t: Transaction) => {
		const bauherr = await CharacterModel.findByPk(characterId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
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
				lastConditionTick: await worldService.currentTick(),
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

export async function getBuilding(buildingId: string): Promise<Building | undefined> {
	const gefunden = await BuildingModel.findByPk(buildingId);
	return gefunden ? convertToBuilding(gefunden.dataValues) : undefined;
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
	return alle.map((eintrag) => convertToBuilding(eintrag.dataValues));
}

/** Was einem Charakter gehört. */
export async function getBuildingsOfCharacter(characterId: string): Promise<Building[]> {
	const alle = await BuildingModel.findAll({
		where: { OwnerCharacterId: characterId, ownerType: 'CHARACTER' }
	});
	return alle.map((eintrag) => convertToBuilding(eintrag.dataValues));
}
