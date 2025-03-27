import type { PageServerLoad } from '../../../../.svelte-kit/types/src/routes/character/new/$types';
import * as buildingService from '$lib/server/service/buildingService';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import { fail, redirect } from '@sveltejs/kit';
import type { Building } from '$lib/model/building';

export const load: PageServerLoad = async ({}) => {
	return {
		buildingsOptions: buildingService.getBuildingOptions()
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		request.json().then((value: BuildingTemplate) => {
			const option = buildingService.getBuildingOption(value.optionId);
			if (option && locals.currentCharacter) {
				if (option.price >= locals.currentCharacter.money) {
					return fail(400, { message: 'Nicht genug Geld' });
				}
				if (option.limited && buildingService.limitReached(option)) {
					return fail(400, { message: 'Limit für dieses Gebäude erreicht' });
				}
				const building: Building = buildingService.build(option, locals.currentCharacter.belongsTo);
				// redirect(303, '/building/' + building.id);
			} else {
				return fail(400, { message: 'Bauoption nicht gefunden' });
			}
		});
	}
};