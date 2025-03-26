import type { PageServerLoad } from '../../.svelte-kit/types/src/routes/character/new/$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		character: locals.currentCharacter
	};
};