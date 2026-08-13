import type { PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as familyService from '$lib/server/service/familyService';
import * as regionService from '$lib/server/service/regionService';
import * as worldService from '$lib/server/service/worldService';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		return { character, region: undefined, buildings: [], population: undefined };
	}
	return {
		character,
		// Die Stadt, in der man steht — nicht die ganze Welt. Sobald es zwei Städte gibt,
		// wäre eine Liste über alle Gebäude sinnlos.
		region: await regionService.getRegion(character.regionId),
		buildings: await buildingService.getBuildingsInRegion(character.regionId),
		// Ohne Zahlen faellt erst auf, dass die Stadt ausstirbt, wenn sie leer ist.
		population: await familyService.getPopulation(
			character.regionId,
			await worldService.currentTick()
		)
	};
};
