import type { Character } from '$lib/model/character';

const userMap: Map<number, Character> = new Map();


export function getCharacter(id: number): Character | undefined {
	return userMap.get(id);
}

export function getCharacterForUser(id: number): Character | undefined {
	return userMap.values().find((character) => character.belongsTo === id);
}