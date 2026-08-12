import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import * as worldService from '$lib/server/service/worldService';
import { ageInYears } from '$lib/game/time';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}
	return {
		character,
		age: ageInYears(character.birthTick, await worldService.currentTick())
	};
};
