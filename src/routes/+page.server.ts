import type { PageServerLoad } from '../../.svelte-kit/types/src/routes/character/new/$types';
import * as buildingService from '$lib/server/service/buildingService';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		character: locals.currentCharacter,
		buildings: buildingService.getBuildings()
	};
};