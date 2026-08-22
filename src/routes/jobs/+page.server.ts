import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as employmentService from '$lib/server/service/employmentService';
import { actionMessage } from '$lib/actionMessage';
import { CONDITION_MAX } from '$lib/game/building.logic';

/** Was in der Stadt an Arbeit zu haben ist. */
export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	return {
		jobs: await employmentService.getOpenJobs(character.regionId, character.id),
		mine: await employmentService.getJobOf(character.id),
		// **Der Weg zur Lohnarbeit, nicht nur ihr Name** (Punkt 58). Der Satz hier nannte
		// bis 5.52 die „Tagelöhnerei in der städtischen Schmiede" — die es seit 5.26 nicht
		// mehr gibt: Für Lohn arbeitet, wer einen öffentlichen Bau instand setzt. Jetzt
		// steht dort das Haus, an dem es gerade etwas zu tun gibt, und man kommt hin.
		repairable: (await buildingService.getPublicBuildings(character.regionId))
			.filter((haus) => haus.condition < CONDITION_MAX)
			.sort((a, b) => a.condition - b.condition)[0]
	};
};

export const actions = {
	take: async ({ request, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const buildingId = (await request.formData()).get('buildingId')?.toString();
		if (!buildingId) return fail(400, { message: 'Welche Stelle?' });

		const ergebnis = await employmentService.takeJob(locals.currentCharacter.id, buildingId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Du hast die Stelle.' };
	},

	quit: async ({ locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		await employmentService.endEmployment(locals.currentCharacter.id);
		return { message: 'Du hast gekündigt.' };
	},

	work: async ({ locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });

		const ergebnis = await employmentService.workForEmployer(locals.currentCharacter.id);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });

		// Der Leerlauf bekommt einen eigenen Satz: „Feierabend, 3 Münzen Lohn." allein
		// verschwiege, dass der Tag nichts hervorgebracht hat — und der Angestellte hätte
		// nichts, was er seinem Arbeitgeber vorhalten könnte.
		if (ergebnis.idle) {
			return {
				message: `Feierabend. ${ergebnis.wage} Münzen Lohn — es lag nichts zu tun an.`
			};
		}
		return {
			message:
				`Feierabend. ${ergebnis.wage} Münzen Lohn` +
				(ergebnis.produced > 0 ? `, ${ergebnis.produced} Stück für den Betrieb.` : '.')
		};
	}
} satisfies Actions;
