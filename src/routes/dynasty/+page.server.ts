import type { PageServerLoad } from './$types';
import * as dynastyService from '$lib/server/service/dynastyService';
import * as userService from '$lib/server/service/userService';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.currentUser) {
		const dynastyForUser = await dynastyService.getDynastyForUser(locals.currentUser.id);
		if (dynastyForUser) {
			return {
				dynasty: dynastyForUser,
				founder: await userService.getUser(dynastyForUser.foundedBy)
			};
		}
	}
	error(404, 'Not Found');
};
