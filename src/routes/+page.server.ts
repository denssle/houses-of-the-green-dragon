import type { PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		character: locals.currentCharacter,
		buildings: await buildingService.getBuildings()
	};
};
