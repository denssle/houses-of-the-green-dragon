import type { PageServerLoad } from '../../../../.svelte-kit/types/src/routes/character/new/$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.currentCharacter) {
		return {
			character: locals.currentCharacter
		};
	} else {
		error(404, 'Not Found');
	}
};
