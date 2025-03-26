import type { PageServerLoad } from './$types';
import * as dynastyService from '$lib/server/service/dynastyService';
import * as characterService from '$lib/server/service/characterService';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.currentUser) {
		return {
			dynasty: dynastyService.getDynastyForUser(locals.currentUser.id)
		};
	} else {
		// TODO
		redirect(303, '/');
	}
};

export const actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const firstName = data.get('firstName');
		const userID = locals.currentUser?.id;
		// TODO Fehler Handling
		if (firstName) {
			if (userID) {
				const dynastyForUser = dynastyService.getDynastyForUser(userID);
				if (dynastyForUser) {
					locals.currentCharacter = characterService.create(
						firstName.toString(),
						userID,
						dynastyForUser.id
					);
				}
			}
		}
	}
};
