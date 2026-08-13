import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as chronicleService from '$lib/server/service/chronicleService';
import { chronicleMessage } from '$lib/chronicleMessage';
import { seasonOf, SEASON_NAMES, yearOf } from '$lib/game/time';

/**
 * Die Chronik — dieselben Zeilen, drei Fragen.
 *
 * `?view=house` zeigt, was das eigene Haus betrifft, `?view=me` den Lebenslauf des
 * gespielten Charakters, sonst die Stadt. Kein eigener Dienst je Sicht: Es ist eine
 * Abfrage mit drei Filtern.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const sicht: string = url.searchParams.get('view') ?? 'city';
	const eintraege = await chronicleService.getChronicle({
		regionId: sicht === 'city' ? character.regionId : undefined,
		characterId: sicht === 'me' ? character.id : undefined,
		dynastyId: sicht === 'house' ? (character.dynastyId ?? undefined) : undefined,
		limit: 60
	});

	return {
		view: sicht,
		hasHouse: Boolean(character.dynastyId),
		entries: eintraege.map((eintrag) => ({
			id: eintrag.id,
			// Der Satz entsteht hier und nicht in der Ablage: Dort steht eine Zeile aus
			// Kennungen, damit ein umbenannter Charakter nicht für immer anders heißt.
			text: chronicleMessage(eintrag),
			year: yearOf(eintrag.tick),
			season: SEASON_NAMES[seasonOf(eintrag.tick)],
			subjectId: eintrag.subject?.id
		}))
	};
};
