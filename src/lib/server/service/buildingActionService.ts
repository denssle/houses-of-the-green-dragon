import type { BuildingAction } from '$lib/model/buildingAction';
import * as characterService from '$lib/server/service/characterService';

/**
 * Die Gebäudeaktionen — noch in der Fassung des Prototyps, nur auf die neue Persistenz
 * gehoben. Ausformuliert werden sie in Phase 3.3, dann als reine Funktionen mit eigenen
 * Specs, weil sich an genau diesen Regeln das Balancing abspielt.
 */
export async function doBuildingAction(
	action: BuildingAction,
	characterId: string
): Promise<{ success: boolean }> {
	const character = await characterService.getCharacter(characterId);
	if (!character) {
		return { success: false };
	}

	switch (action) {
		case 'WORK':
			if (character.actionPoints < 1) {
				return { success: false };
			}
			character.actionPoints -= 1;
			character.money += 1;
			await characterService.update(character);
			return { success: true };
		case 'BECOME_CITIZEN':
		case 'SLEEP':
			// Noch nicht ausformuliert — siehe Phase 3.3.
			return { success: false };
		default:
			console.error('Unbekannte Aktion', action);
			return { success: false };
	}
}
