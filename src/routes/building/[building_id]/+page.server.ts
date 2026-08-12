import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import * as plotService from '$lib/server/service/plotService';
import type { BuildingAction } from '$lib/model/buildingAction';
import { actionMessage } from '$lib/actionMessage';

export const load: PageServerLoad = async ({ params }) => {
	const building = await buildingService.getBuilding(params.building_id);
	if (!building) {
		error(404, 'Not Found');
	}
	return {
		building,
		option: buildingService.getBuildingOption(building.optionId),
		plot: building.plotId ? await plotService.getPlot(building.plotId) : undefined
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
			locals.currentCharacter.id,
			building.id
		);
		if (!ergebnis.ok) {
			return fail(400, { message: actionMessage(ergebnis.reason) });
		}
		return { message: `Feierabend. ${ergebnis.earned} Münzen verdient.` };
	}
} satisfies Actions;
