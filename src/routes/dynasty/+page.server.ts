import { base } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as dynastyService from '$lib/server/service/dynastyService';
import * as familyService from '$lib/server/service/familyService';
import * as userService from '$lib/server/service/userService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Das Haus — oder, wenn es erloschen ist, der Weg zu einem neuen.
 *
 * Bewusst kein 404 mehr, wenn kein lebendes Haus da ist: Genau das ist der Zustand nach
 * einem Tod ohne Erben, und dann braucht der Spieler hier eine Tür und keine
 * Fehlerseite.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.currentUser) {
		redirect(303, `${base}/login`);
	}

	const lebend = await dynastyService.getDynastyForUser(locals.currentUser.id);
	return {
		dynasty: lebend,
		founder: lebend ? await userService.getUser(lebend.foundedBy) : undefined,
		tree: lebend
			? await familyService.getFamilyTree(lebend.id, await worldService.currentTick())
			: [],
		// Die Ahnengalerie: erloschene Häuser desselben Spielers.
		former: (await dynastyService.getDynastiesForUser(locals.currentUser.id)).filter(
			(haus) => haus.isExtinct
		)
	};
};

export const actions = {
	/**
	 * Ein neues Haus gründen.
	 *
	 * Nur, wenn kein lebendes da ist — sonst hätte ein Spieler zwei, und die Regel „ein
	 * sterblicher Charakter im Mittelpunkt" wäre umgangen.
	 */
	found: async ({ request, locals }) => {
		if (!locals.currentUser) {
			return fail(401, { message: 'Nicht angemeldet' });
		}

		const name = (await request.formData()).get('name')?.toString().trim();
		if (!name) {
			return fail(400, { message: 'Ein Hausname wird gebraucht' });
		}
		if (await dynastyService.getDynastyForUser(locals.currentUser.id)) {
			return fail(400, { message: 'Dein Haus lebt noch' });
		}

		await dynastyService.create(name, locals.currentUser.id);
		redirect(303, `${base}/character/new`);
	}
} satisfies Actions;
