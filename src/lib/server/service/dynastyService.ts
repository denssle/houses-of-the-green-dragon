import type { Dynasty } from '$lib/model/dynasty';
import * as fileService from '$lib/server/service/fileService';

let dynasties: Dynasty[] = [];

load();

function load() {
	fileService.read('DYNASTY', (err, data) => {
		if (err) {
			return console.error(err);
		}
		dynasties = JSON.parse(data.toString());
	});
}

function write() {
	fileService.write('DYNASTY', JSON.stringify(dynasties));
}

export function create(name: string, userId: bigint): void {
	const newDynasty: Dynasty = {
		id: BigInt(Date.now()),
		name: name,
		foundedBy: userId
	};
	dynasties.push(newDynasty);
	write();
}

export function getDynastyForUser(userIDd: bigint): Dynasty | undefined {
	return dynasties.find((value) => value.foundedBy === userIDd);
}
