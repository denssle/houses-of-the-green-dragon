import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as regionService from '$lib/server/service/regionService';
import * as relationshipService from '$lib/server/service/relationshipService';
import * as worldService from '$lib/server/service/worldService';
import { actionMessage } from '$lib/actionMessage';
import { SOCIALIZE_ACTION_POINT_COST } from '$lib/game/relationship.logic';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	return {
		region: await regionService.getRegion(character.regionId),
		cost: SOCIALIZE_ACTION_POINT_COST,
		people: await relationshipService.getNeighbours(
			character.id,
			character.regionId,
			await worldService.currentTick()
		)
	};
};

export const actions = {
	visit: async ({ request, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der jemanden besuchen könnte' });
		}

		const otherId = (await request.formData()).get('personId')?.toString();
		if (!otherId) {
			return fail(400, { message: 'Wen denn?' });
		}

		const ergebnis = await relationshipService.spendTimeWith(locals.currentCharacter.id, otherId);
		if (!ergebnis.ok) {
			return fail(400, { message: actionMessage(ergebnis.reason) });
		}
		return { message: 'Ihr habt Zeit miteinander verbracht.' };
	}
} satisfies Actions;
