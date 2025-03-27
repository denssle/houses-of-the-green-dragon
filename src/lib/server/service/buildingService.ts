import * as fileService from '$lib/server/service/fileService';
import type { Building } from '$lib/model/building';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';

let buildings: Building[] = [];

load();

function load() {
	try {
		fileService.read('BUILDING', (err, data) => {
			if (err) {
				return console.error(err);
			}
			if (data.byteLength) {
				buildings = JSON.parse(data.toString());
			}
		});
	} catch {
		console.log('Reading Building failed');
	}
}

function write() {
	fileService.write('BUILDING', JSON.stringify(buildings));
}

export function getBuildingOptions(): BuildingTemplate[] {
	return [
		{
			optionId: 0,
			price: 0,
			initialName: 'Rathaus',
			type: 'PUBLIC',
			description: 'Das Rathaus der Stadt',
			limited: true,
			limitedTo: 1
		},
		{
			optionId: 1,
			price: 100,
			initialName: 'Wohnhaus',
			type: 'RESIDENCE',
			description: 'Ein einfaches Wohnhaus',
			limited: false,
			limitedTo: 0
		},
		{
			optionId: 2,
			price: 250,
			initialName: 'Schmiede',
			type: 'CRAFT',
			description: 'Ein bescheidener Handwerksbetrieb',
			limited: false,
			limitedTo: 0
		}
	];
}

export function getBuildingOption(optionId: number): BuildingTemplate | undefined {
	return getBuildingOptions().find(value => value.optionId === optionId);
}

export function limitReached(option: BuildingTemplate): boolean {
	return buildings.filter(value => value.optionId === option.optionId).length >= option.limitedTo;
}

export function build(option: BuildingTemplate, userId: number) {
	const building: Building = {
		id: Date.now(),
		belongsTo: userId,
		name: option.initialName,
		...option
	};
	buildings.push(building);
	write();
	return building;
}

export function getBuilding(id: number): Building | undefined {
	return buildings.find(value => value.id === id);
}

export function getBuildings(): Building[] {
	return buildings;
}