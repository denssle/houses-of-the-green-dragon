import { base } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as userService from '$lib/server/service/userService';

/**
 * Das Konto — und der Weg hinaus.
 *
 * Bewusst eine eigene Seite und kein Anhängsel der Dynastie: Was hier steht, betrifft den
 * Menschen und nicht sein Haus.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.currentUser) {
		redirect(303, `${base}/login`);
	}

	return {
		nickname: locals.currentUser.nickname,
		email: locals.currentUser.email ?? null
	};
};

export const actions = {
	/**
	 * Kontolöschung als Anonymisierung.
	 *
	 * **Der Nickname muss abgetippt werden.** Ein Knopf allein wäre zu wenig für etwas,
	 * das sich nicht rückgängig machen lässt — und eine Sicherheitsabfrage, die man
	 * wegklickt, ist keine.
	 */
	delete: async ({ request, locals, cookies }) => {
		if (!locals.currentUser) {
			return fail(401, { message: 'Nicht angemeldet' });
		}

		const bestaetigung = (await request.formData()).get('nickname')?.toString().trim();
		if (bestaetigung !== locals.currentUser.nickname) {
			return fail(400, {
				message: 'Zum Bestätigen bitte den eigenen Nickname genau so eintragen, wie er oben steht.'
			});
		}

		await userService.anonymizeAccount(locals.currentUser.id);
		// Die Sitzung ist serverseitig schon fort; das Cookie muss trotzdem weg, sonst
		// zeigt der Browser bis zum Ablauf auf eine Sitzung, die es nicht mehr gibt.
		await userService.logout(locals, cookies);

		redirect(303, `${base}/login`);
	}
} satisfies Actions;
