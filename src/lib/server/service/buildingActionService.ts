import type { BuildingAction } from '$lib/model/buildingAction';
import * as characterService from '$lib/server/service/characterService';

export function doBuildingAction(
	action: BuildingAction,
	charakterId: number
): { success: boolean } {
	const character = characterService.getCharacter(charakterId);
	if (!character) {
		return { success: false };
	}
	switch (action) {
		case 'BECOME_CITIZEN':
			return { success: false };
		case 'SLEEP':
			return { success: false };
		case 'WORK':
			character.energy -= 1;
			character.money += 1;
			characterService.update(character);
			return { success: true };
		default:
			console.error('Action missing', action);
			return { success: false };
	}
}
