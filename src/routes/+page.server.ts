import type { PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as familyService from '$lib/server/service/familyService';
import * as nameService from '$lib/server/service/nameService';
import * as regionService from '$lib/server/service/regionService';
import * as worldService from '$lib/server/service/worldService';
import { SEASON_NAMES, seasonOf, yearOf } from '$lib/game/time';

/**
 * Die Häuser der Stadt, nach dem geordnet, wonach man sie aufsucht (Punkt 83).
 *
 * **Eine Reihe aus allem war keine Auskunft.** Rathaus neben Zimmerei neben Wohnhaus:
 * Das eine ist Politik, das andere Nachbarschaft und Handel, und wer eines von beiden
 * sucht, las jedes Mal die ganze Liste.
 *
 * Die dritte Gruppe gibt es erst seit 5.42: Was der Stadt aus einem erbenlosen Nachlass
 * zugefallen ist, wartet auf die Versteigerung — und das ist die Auskunft, für die sich
 * jeder interessiert, der ein Haus sucht.
 *
 * **Bei den privaten Häusern steht, wem sie gehören** (5.10, mit Hausnamen). Ein Haus
 * ohne Eigentümer ist eine Adresse, ein Haus mit Eigentümer ist eine Nachbarschaft.
 */
async function haeuser(regionId: string) {
	const alle = await buildingService.getBuildingsInRegion(regionId);
	const namen = await nameService.displayNames(
		alle.map((haus) => haus.ownerCharacterId).filter((id): id is string => Boolean(id))
	);

	return {
		publicBuildings: alle.filter((haus) => buildingService.isPublicWorks(haus)),
		escheated: alle.filter((haus) => haus.escheatedTick !== null),
		privateBuildings: alle
			.filter((haus) => haus.ownerType === 'CHARACTER')
			.map((haus) => ({
				...haus,
				ownerName: haus.ownerCharacterId ? (namen.get(haus.ownerCharacterId) ?? null) : null
			}))
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		return {
			character,
			region: undefined,
			publicBuildings: [],
			privateBuildings: [],
			escheated: [],
			population: undefined,
			world: undefined
		};
	}
	const jetzt: number = await worldService.currentTick();
	return {
		character,
		// Jahreszeit und Jahr ergeben sich aus der Weltuhr — keine eigene Spalte.
		world: { season: SEASON_NAMES[seasonOf(jetzt)], year: yearOf(jetzt) },
		// Die Stadt, in der man steht — nicht die ganze Welt. Sobald es zwei Städte gibt,
		// wäre eine Liste über alle Gebäude sinnlos.
		region: await regionService.getRegion(character.regionId),
		...(await haeuser(character.regionId)),
		// Ohne Zahlen faellt erst auf, dass die Stadt ausstirbt, wenn sie leer ist.
		population: await familyService.getPopulation(character.regionId, jetzt)
	};
};
