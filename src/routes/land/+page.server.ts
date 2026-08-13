import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as productionService from '$lib/server/service/productionService';
import * as worldService from '$lib/server/service/worldService';
import { actionMessage } from '$lib/actionMessage';
import { SEASON_NAMES, seasonOf } from '$lib/game/time';
import { getItemTemplate } from '$lib/model/itemTemplate';

/** Das Umland: Flächen pachten und abernten. */
export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const jetzt: number = await worldService.currentTick();
	const flaechen = await productionService.getAreas(character.id);

	return {
		season: SEASON_NAMES[seasonOf(jetzt)],
		fee: productionService.LEASE_FEE,
		areas: flaechen.map((flaeche) => {
			const rezept = productionService.harvestRecipe(flaeche.resourceType);
			return {
				...flaeche,
				yields: rezept ? (getItemTemplate(rezept.outputItemId)?.name ?? '—') : '—',
				// Was hier nicht wächst, soll auch keinen Knopf haben.
				inSeason: rezept ? !rezept.seasons || rezept.seasons.includes(seasonOf(jetzt)) : false
			};
		})
	};
};

export const actions = {
	lease: async ({ request, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const plotId = (await request.formData()).get('plotId')?.toString();
		if (!plotId) return fail(400, { message: 'Welche Fläche?' });

		const ergebnis = await productionService.leasePlot(locals.currentCharacter.id, plotId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Die Fläche ist gepachtet.' };
	},

	harvest: async ({ request, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const plotId = (await request.formData()).get('plotId')?.toString();
		if (!plotId) return fail(400, { message: 'Welche Fläche?' });

		const ergebnis = await productionService.harvest(locals.currentCharacter.id, plotId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message:
				`${ergebnis.produced} ${getItemTemplate(ergebnis.itemId)?.name ?? ''} geerntet` +
				(ergebnis.tithe ? ` — ${ergebnis.tithe} als Zehnt an die Stadt.` : '.')
		};
	}
} satisfies Actions;
