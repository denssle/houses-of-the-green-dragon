import type { PageServerLoad } from '../../../../.svelte-kit/types/src/routes/character/new/$types';
import { error } from '@sveltejs/kit';
import * as buildingService from '$lib/server/service/buildingService';

export const load: PageServerLoad = async ({ params }) => {
	const id: string = params.building_id;
	if (id) {
		const converted = BigInt(id);
		return {
			building: buildingService.getBuilding(converted)
		};
	}
	error(404, 'Not Found');
};