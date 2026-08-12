import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as plotService from '$lib/server/service/plotService';
import * as regionService from '$lib/server/service/regionService';
import * as worldService from '$lib/server/service/worldService';
import { ageInYears, MAX_ACTION_POINTS } from '$lib/game/time';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const eigeneGebäude = await buildingService.getBuildingsOfCharacter(character.id);
	const zuhause = character.homeBuildingId
		? await buildingService.getBuilding(character.homeBuildingId)
		: undefined;

	return {
		character,
		age: ageInYears(character.birthTick, await worldService.currentTick()),
		maxActionPoints: MAX_ACTION_POINTS,
		region: await regionService.getRegion(character.regionId),
		home: zuhause,
		plots: await plotService.getPlotsOfCharacter(character.id),
		buildings: eigeneGebäude
	};
};
