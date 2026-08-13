import { base } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as plotService from '$lib/server/service/plotService';
import { actionMessage } from '$lib/actionMessage';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	const eigene = character ? await plotService.getPlotsOfCharacter(character.id) : [];
	return {
		buildingsOptions: buildingService.getBuildingOptions(),
		// Nur unbebaute eigene Grundstücke — auf ein besetztes passt kein zweites Haus.
		freePlots: eigene.filter((plot) => !plot.hasBuilding)
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) {
			return fail(401, { message: 'Kein Charakter, der bauen könnte' });
		}

		const data = await request.formData();
		const optionId = Number(data.get('optionId'));
		const plotId = data.get('plotId')?.toString();

		const option = buildingService.getBuildingOption(optionId);
		if (!option) {
			return fail(400, { message: 'Bauoption nicht gefunden' });
		}
		if (!plotId) {
			return fail(400, { message: 'Wähle zuerst ein Grundstück' });
		}

		const ergebnis = await buildingService.build(option, character.id, plotId);
		if (!ergebnis.ok) {
			return fail(400, { message: actionMessage(ergebnis.reason) });
		}
		redirect(303, `${base}/building/${ergebnis.building.id}`);
	}
} satisfies Actions;
