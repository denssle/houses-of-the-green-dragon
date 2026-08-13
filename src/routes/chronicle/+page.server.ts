import type { PageServerLoad } from './$types';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as regionService from '$lib/server/service/regionService';
import { chronicleMessage } from '$lib/chronicleMessage';
import { findStartRegionId } from '$lib/db/seed';
import { seasonOf, SEASON_NAMES, yearOf } from '$lib/game/time';

/**
 * Die Chronik — dieselben Zeilen, drei Fragen.
 *
 * `?view=house` zeigt, was das eigene Haus betrifft, `?view=me` den Lebenslauf des
 * gespielten Charakters, sonst die Stadt. Kein eigener Dienst je Sicht: Es ist eine
 * Abfrage mit drei Filtern.
 *
 * **Die Stadtsicht steht ohne Anmeldung offen.** Sie ist das Schaufenster der Welt: Wer
 * hereinschaut, soll sehen, dass hier etwas geschieht, bevor er sich für ein Konto
 * entscheidet — und eine Stadtchronik, die man nur als Bürger lesen darf, wäre auch
 * inhaltlich verkehrt herum. Die beiden persönlichen Sichten setzen einen Charakter
 * voraus, weil es sonst nichts zu filtern gäbe.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const character = locals.currentCharacter;
	const gewuenscht: string = url.searchParams.get('view') ?? 'city';
	// Ein Gast, der `?view=me` aufruft, bekommt die Stadt statt eines Fehlers: Die
	// Adresse ist geraten, nicht falsch.
	const sicht: string = character ? gewuenscht : 'city';

	// Ohne Charakter gibt es keine eigene Stadt — dann die Startstadt, in der die Welt
	// beginnt. Sobald es eine zweite gibt, gehört sie in die Adresse.
	//
	// Gibt es noch gar keine Stadt, ist das kein Fehler, sondern eine Auskunft: Diese
	// Seite ist das Erste, was ein Fremder von der Welt sieht, und ein Serverfehler wäre
	// ein denkbar schlechter erster Eindruck.
	const regionId: string | undefined = character?.regionId ?? (await startstadt());

	if (!regionId) {
		return {
			view: 'city',
			guest: !character,
			regionName: 'Die Welt',
			hasHouse: false,
			entries: []
		};
	}

	const eintraege = await chronicleService.getChronicle({
		regionId: sicht === 'city' ? regionId : undefined,
		characterId: sicht === 'me' ? character?.id : undefined,
		dynastyId: sicht === 'house' ? (character?.dynastyId ?? undefined) : undefined,
		limit: 60
	});

	return {
		view: sicht,
		guest: !character,
		regionName: (await regionService.getRegion(regionId))?.name ?? 'Die Stadt',
		hasHouse: Boolean(character?.dynastyId),
		entries: eintraege.map((eintrag) => ({
			id: eintrag.id,
			// Der Satz entsteht hier und nicht in der Ablage: Dort steht eine Zeile aus
			// Kennungen, damit ein umbenannter Charakter nicht für immer anders heißt.
			text: chronicleMessage(eintrag),
			year: yearOf(eintrag.tick),
			season: SEASON_NAMES[seasonOf(eintrag.tick)],
			// Für Gäste ohne Verweis: Die Charakterseiten stehen ihnen nicht offen, und ein
			// Link, der auf die Anmeldung führt, ist ein Versprechen, das die Seite bricht.
			subjectId: character ? eintrag.subject?.id : undefined
		}))
	};
};

/** Die Startstadt — oder nichts, wenn die Welt noch gar nicht steht. */
async function startstadt(): Promise<string | undefined> {
	try {
		return await findStartRegionId();
	} catch {
		return undefined;
	}
}
