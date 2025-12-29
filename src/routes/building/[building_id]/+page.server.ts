import type { PageServerLoad } from '../../../../.svelte-kit/types/src/routes/character/new/$types';
import { error } from '@sveltejs/kit';
import * as buildingService from '$lib/server/service/buildingService';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import type { BuildingAction } from '$lib/model/buildingAction';

export const load: PageServerLoad = async ({ params }) => {
	// @ts-ignore
	const id: string = params.building_id;
	if (id) {
		const converted = Number.parseInt(id);
		return {
			building: buildingService.getBuilding(converted)
		};
	}
	error(404, 'Not Found');
};

export const actions = {
	default: async ({ request, params, locals }) => {
		// @ts-ignore
		const id: number = Number(params.building_id);
		const building = buildingService.getBuilding(id);
		if (building) {
			request.text().then((value: string) => {
				const buildingAction: BuildingAction = <BuildingAction>value;
				if (building?.actions.includes(buildingAction) && locals.currentCharacter?.id) {
					buildingActionService.doBuildingAction(buildingAction, locals.currentCharacter.id);
				} else {
					console.error(403, 'Action not allowed');
				}
			});
		}
		error(404, 'Not Found');
	}
};