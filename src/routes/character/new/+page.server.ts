import { base } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';
import * as dynastyService from '$lib/server/service/dynastyService';
import * as characterService from '$lib/server/service/characterService';
import { fail, redirect } from '@sveltejs/kit';
import { GENDERS, type Gender } from '$lib/db/attributes/enums';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.currentUser) {
		redirect(303, `${base}/login`);
	}
	// Wer schon einen Charakter führt, hat hier nichts zu suchen: Das Formular würde
	// beim Absenden ohnehin abgewiesen. Also zurück zu dem, der lebt.
	const bestehend = await characterService.getCharacterForUser(locals.currentUser.id);
	if (bestehend) {
		redirect(303, `${base}/character/${bestehend.id}`);
	}

	return {
		dynasty: await dynastyService.getDynastyForUser(locals.currentUser.id)
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const firstName = data.get('firstName')?.toString().trim();
		const gender = data.get('gender')?.toString();

		if (!locals.currentUser) {
			return fail(401, { message: 'Nicht angemeldet' });
		}
		if (!firstName) {
			return fail(400, { message: 'Ein Vorname wird gebraucht' });
		}
		if (!gender || !GENDERS.includes(gender as Gender)) {
			return fail(400, { message: 'Bitte ein Geschlecht wählen' });
		}

		const dynasty = await dynastyService.getDynastyForUser(locals.currentUser.id);
		if (!dynasty) {
			return fail(400, { message: 'Kein Haus gefunden, dem der Charakter angehören könnte' });
		}
		if (await characterService.getCharacterForUser(locals.currentUser.id)) {
			return fail(400, { message: 'Es lebt bereits ein Charakter dieses Hauses' });
		}

		const character = await characterService.create(firstName, dynasty.id, gender as Gender);
		redirect(303, `${base}/character/${character.id}`);
	}
} satisfies Actions;
