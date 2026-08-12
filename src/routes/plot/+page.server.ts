import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as plotService from '$lib/server/service/plotService';
import { actionMessage } from '$lib/actionMessage';
import { PLOT_PRICE } from '$lib/game/economy';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		return { freeLand: [], ownedPlots: [], price: PLOT_PRICE };
	}
	return {
		freeLand: await plotService.getFreeBuildingLand(character.regionId),
		ownedPlots: await plotService.getPlotsOfCharacter(character.id),
		price: PLOT_PRICE
	};
};

export const actions = {
	buy: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) {
			return fail(401, { message: 'Kein Charakter, der kaufen könnte' });
		}

		const data = await request.formData();
		const plotId = data.get('plotId')?.toString();
		if (!plotId) {
			return fail(400, { message: 'Kein Grundstück gewählt' });
		}

		const ergebnis = await plotService.buyPlot(plotId, character.id);
		if (!ergebnis.ok) {
			return fail(400, { message: actionMessage(ergebnis.reason) });
		}
		return { message: `${ergebnis.plot.address} gehört jetzt dir.` };
	}
} satisfies Actions;
