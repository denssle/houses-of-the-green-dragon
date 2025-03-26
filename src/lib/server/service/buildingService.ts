import * as fileService from '$lib/server/service/fileService';
import type { Building } from '$lib/model/building';

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
