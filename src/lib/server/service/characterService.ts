import type { Character } from '$lib/model/character';

const characterMap: Map<number, Character> = new Map();

export function create(firstName: string, userId: number, dynastyId: number): Character {
	const character: Character = {
		id: Date.now(),
		firstName: firstName,
		title: getTitle(),
		belongsTo: userId,
		dynasty: dynastyId
	};
	characterMap.set(character.id, character);
	return character;
}

function getTitle() {
	return 'Newbie';
}

export function getCharacter(id: number): Character | undefined {
	return characterMap.get(id);
}

export function getCharacterForUser(id: number): Character | undefined {
	return characterMap.values().find((character) => character.belongsTo === id);
}
