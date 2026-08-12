import { redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import type { Actions, PageServerLoad } from './$types';

/**
 * Abmelden ist eine eigene Route statt eines Sonderfalls im Hook — und ausdrücklich ein
 * POST: Die App lädt Links beim Überfahren vor (`data-sveltekit-preload-data="hover"`).
 * Läge das Abmelden in einem `load`, genügte die Maus über dem Menüpunkt, um die Sitzung
 * zu beenden. Aus demselben Grund ist es auch nicht per fremder Seite auslösbar.
 */
export const load: PageServerLoad = () => {
	redirect(303, '/');
};

export const actions = {
	default: async ({ cookies, locals }) => {
		await userService.logout(locals, cookies);
		redirect(303, '/login');
	}
} satisfies Actions;
