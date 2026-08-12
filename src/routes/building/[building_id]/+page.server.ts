import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import * as buildingService from '$lib/server/service/buildingService';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import type { BuildingAction } from '$lib/model/buildingAction';

export const load: PageServerLoad = async ({ params }) => {
	const building = await buildingService.getBuilding(params.building_id);
	if (!building) {
		error(404, 'Not Found');
	}
	return {
		building,
		option: buildingService.getBuildingOption(building.optionId)
	};
};

export const actions = {
	default: async ({ request, params, locals }) => {
		const building = await buildingService.getBuilding(params.building_id);
		if (!building) {
			error(404, 'Not Found');
		}
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der handeln könnte' });
		}

		const data = await request.formData();
		const action = data.get('action')?.toString() as BuildingAction;
		const option = buildingService.getBuildingOption(building.optionId);

		if (!option?.actions.includes(action)) {
			return fail(403, { message: 'Diese Handlung ist hier nicht möglich' });
		}

		const ergebnis = await buildingActionService.doBuildingAction(
			action,
			locals.currentCharacter.id
		);
		if (!ergebnis.success) {
			return fail(400, { message: 'Die Handlung ist nicht gelungen' });
		}
		return { success: true };
	}
} satisfies Actions;
