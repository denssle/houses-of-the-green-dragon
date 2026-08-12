import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	return {
		buildingsOptions: buildingService.getBuildingOptions()
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const optionId = Number(data.get('optionId'));
		const character = locals.currentCharacter;

		if (!character) {
			return fail(401, { message: 'Kein Charakter, der bauen könnte' });
		}

		const option = buildingService.getBuildingOption(optionId);
		if (!option) {
			return fail(400, { message: 'Bauoption nicht gefunden' });
		}
		// Die Prüfung ist im Prototyp invertiert und das Geld wird nie abgezogen; beides
		// richtet Phase 3.2 samt Transaktion und Grundstücksprüfung.
		if (option.price > character.money) {
			return fail(400, { message: 'Nicht genug Geld' });
		}
		if (await buildingService.limitReached(option)) {
			return fail(400, { message: 'Limit für dieses Gebäude erreicht' });
		}

		const building = await buildingService.build(option, character.id);
		redirect(303, `/building/${building.id}`);
	}
} satisfies Actions;
