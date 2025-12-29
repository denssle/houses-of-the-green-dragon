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

export function create(firstName: string, userId: number, dynastyId: number): Character {
	const character: Character = {
		id: Date.now(),
		firstName: firstName,
		title: getTitle(),
		belongsTo: userId,
		dynasty: dynastyId,
		money: 0,
		age: 10,
		energy: 10,
		maxEnergy: 10
	};
	characters.push(character);
	write();
	return character;
}

function getTitle() {
	return 'Newbie';
}

export function getCharacterForUser(id: number): Character | undefined {
	return characters.find((character) => character.belongsTo === id);
}

export function getCharacter(id: number) {
	return characters.find(value => value.id === id);
}

export function update(character: Character) {
	characters[characters.findIndex(value => value.id === character.id)] = character;
}