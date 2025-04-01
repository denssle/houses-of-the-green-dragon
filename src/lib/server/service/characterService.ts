import type { Character } from '$lib/model/character';
import * as fileService from '$lib/server/service/fileService';

let characters: Character[] = [];

load();

function load() {
	fileService.read('CHARACTER', (err, data) => {
		if (err) {
			return console.error(err);
		}
		characters = JSON.parse(data.toString());
	});
}

function write() {
	fileService.write('CHARACTER', JSON.stringify(characters));
}

export function create(firstName: string, userId: bigint, dynastyId: bigint): Character {
	const character: Character = {
		id: BigInt(Date.now()),
		firstName: firstName,
		title: getTitle(),
		belongsTo: userId,
		dynasty: dynastyId,
		age: BigInt(10),
		money: BigInt(10)
	};
	characters.push(character);
	write();
	return character;
}

function getTitle() {
	return 'Newbie';
}

export function getCharacterForUser(id: bigint): Character | undefined {
	return characters.find((character) => character.belongsTo === id);
}
