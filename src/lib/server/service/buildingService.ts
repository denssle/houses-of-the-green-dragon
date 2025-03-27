import * as fileService from '$lib/server/service/fileService';
import type { Building } from '$lib/model/building';
import type { BuildingOption } from '$lib/model/buildingOption';

let buildings: Building[] = [];

load();

function load() {
	fileService.read('BUILDING', (err, data) => {
		if (err) {
			return console.error(err);
		}
		buildings = JSON.parse(data.toString());
	});
}

function write() {
	fileService.write('BUILDING', JSON.stringify(buildings));
}

export function getBuildingOptions(): BuildingOption[] {
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