import type { PageServerLoad } from './$types';
import * as dynastyService from '$lib/server/service/dynastyService';
import * as userService from '$lib/server/service/userService';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.currentUser) {
		const dynastyForUser = dynastyService.getDynastyForUser(locals.currentUser.id);
		if (dynastyForUser) {
			const user = userService.getUser(dynastyForUser.foundedBy);
			return {
				dynasty: dynastyForUser,
				founder: user
			};
		}
	}
};
