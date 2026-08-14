import { base } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as plotService from '$lib/server/service/plotService';
import * as needService from '$lib/server/service/needService';
import { actionMessage } from '$lib/actionMessage';
import { materialFor, producesBuildingMaterial } from '$lib/game/building.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	const eigene = character ? await plotService.getPlotsOfCharacter(character.id) : [];
	return {
		buildingsOptions: buildingService.getBuildingOptions().map((vorlage) => ({
			...vorlage,
			// Seit 4.10 kostet ein Bau auch Material. Wer es erst beim Fehlschlag erfährt,
			// hat die Hälfte des Spiels erraten müssen.
			material: vorlage.recipes?.some((rezept) => producesBuildingMaterial(rezept.outputItemId))
				? []
				: materialFor(vorlage.levels[0].price).map((posten) => ({
						...posten,
						name: getItemTemplate(posten.itemId)?.name ?? posten.itemId
					}))
		})),
		// Was in der eigenen Kammer liegt — daneben liest sich der Bedarf von selbst.
		stock: character ? await needService.getStock(character.id) : [],
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
			// Beim fehlenden Material sagen, **was** fehlt: „Das hast du nicht" ist keine
			// Auskunft, wenn drei Waren gebraucht werden.
			const fehlt = 'missing' in ergebnis ? ergebnis.missing : undefined;
			const nachsatz: string = fehlt
				? ' Es fehlen: ' +
					fehlt
						.map(
							(posten) =>
								posten.quantity + ' ' + (getItemTemplate(posten.itemId)?.name ?? posten.itemId)
						)
						.join(', ') +
					'.'
				: '';
			return fail(400, { message: actionMessage(ergebnis.reason) + nachsatz });
		}
		redirect(303, `${base}/building/${ergebnis.building.id}`);
	}
} satisfies Actions;
