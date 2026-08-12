import { randomUUID } from 'node:crypto';
import type { Building } from '$lib/model/building';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import { Building as BuildingModel } from '$lib/db/model/building';
import { convertToBuilding } from '$lib/db/attributes/building.attributes';
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
			actions: ['BECOME_CITIZEN']
		},
		{
			optionId: 1,
			price: 100,
			initialName: 'Wohnhaus',
			type: 'RESIDENCE',
			description: 'Ein einfaches Wohnhaus',
			limited: false,
			limitedTo: 0,
			actions: ['SLEEP']
		},
		{
			optionId: 2,
			price: 250,
			initialName: 'Schmiede',
			type: 'CRAFT',
			description: 'Ein bescheidener Handwerksbetrieb',
			limited: false,
			limitedTo: 0,
			actions: ['WORK']
		}
	];
}

export function getBuildingOption(optionId: number): BuildingTemplate | undefined {
	return getBuildingOptions().find((option) => option.optionId === optionId);
}

export async function limitReached(option: BuildingTemplate): Promise<boolean> {
	if (!option.limited) return false;
	return (await BuildingModel.count({ where: { optionId: option.optionId } })) >= option.limitedTo;
}

export async function build(option: BuildingTemplate, ownerCharacterId: string): Promise<Building> {
	const angelegt = await BuildingModel.create({
		id: randomUUID(),
		name: option.initialName,
		optionId: option.optionId,
		lastConditionTick: await worldService.currentTick(),
		ownerType: 'CHARACTER',
		OwnerCharacterId: ownerCharacterId
	});
	return convertToBuilding(angelegt.dataValues);
}

export async function getBuilding(buildingId: string): Promise<Building | undefined> {
	const gefunden = await BuildingModel.findByPk(buildingId);
	return gefunden ? convertToBuilding(gefunden.dataValues) : undefined;
}

export async function getBuildings(): Promise<Building[]> {
	const alle = await BuildingModel.findAll();
	return alle.map((eintrag) => convertToBuilding(eintrag.dataValues));
}
