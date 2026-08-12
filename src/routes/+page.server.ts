import type { PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as regionService from '$lib/server/service/regionService';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		return { character, region: undefined, buildings: [] };
	}
	return {
		character,
		// Die Stadt, in der man steht — nicht die ganze Welt. Sobald es zwei Städte gibt,
		// wäre eine Liste über alle Gebäude sinnlos.
		region: await regionService.getRegion(character.regionId),
		buildings: await buildingService.getBuildingsInRegion(character.regionId)
	};
};
