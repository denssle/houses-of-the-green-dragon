import type { PageServerLoad } from '../../../../.svelte-kit/types/src/routes/character/new/$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.currentCharacter) {
		return {
			character: locals.currentCharacter
		};
	}
};
