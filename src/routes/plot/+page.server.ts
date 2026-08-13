import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as plotService from '$lib/server/service/plotService';
import { actionMessage } from '$lib/actionMessage';
import { PLOT_PRICE } from '$lib/game/economy';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		return {
			freeLand: [],
			ownedPlots: [],
			plotsForSale: [],
			buildingsForSale: [],
			price: PLOT_PRICE
		};
	}
	return {
		freeLand: await plotService.getFreeBuildingLand(character.regionId),
		ownedPlots: await plotService.getPlotsOfCharacter(character.id),
		// Was andere abgeben: Boden ohne Haus und Haus samt Boden.
		plotsForSale: await plotService.getPlotsForSale(character.regionId),
		buildingsForSale: await buildingService.getBuildingsForSale(character.regionId),
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
	},

	sell: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Kein Charakter, der verkaufen könnte' });

		const data = await request.formData();
		const plotId = data.get('plotId')?.toString();
		const roh = data.get('price')?.toString();
		if (!plotId) return fail(400, { message: 'Kein Grundstück gewählt' });

		const preis: number | null = roh ? Number(roh) : null;
		if (preis !== null && (!Number.isInteger(preis) || preis < 0)) {
			return fail(400, { message: 'Der Preis muss eine ganze Zahl sein.' });
		}

		const ergebnis = await plotService.setPlotPrice(character.id, plotId, preis);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: preis === null ? 'Das Grundstück steht nicht mehr zum Verkauf.' : 'Preis gesetzt.'
		};
	},

	buyFrom: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Kein Charakter, der kaufen könnte' });

		const plotId = (await request.formData()).get('plotId')?.toString();
		if (!plotId) return fail(400, { message: 'Kein Grundstück gewählt' });

		const ergebnis = await plotService.buyFromOwner(character.id, plotId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Der Boden gehört jetzt dir.' };
	}
} satisfies Actions;
