import { base } from '$app/paths';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import { RATHAUS_OPTION_ID } from '$lib/server/service/buildingService';

/**
 * Die alte Adresse des Rathauses (5.57).
 *
 * **Die Amtsgeschäfte sind auf die Seite des Hauses gezogen.** Bis dahin gab es das
 * Rathaus zweimal: hier das Amt mit Wahl, Kasse und Gesetzen, unter `/building/…` das
 * Gebäude mit Zustand und Belegschaft — und die Übersicht führte beides untereinander
 * auf, gleich benannt, verschieden verlinkt. Ein Haus hat eine Adresse.
 *
 * Wer den alten Weg noch im Lesezeichen hat, landet dort, wo es jetzt steht. Die
 * Weiterleitung kann weg, sobald niemand mehr von hier kommt.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const rathaus = (await buildingService.getBuildingsInRegion(character.regionId)).find(
		(haus) => haus.optionId === RATHAUS_OPTION_ID
	);
	// Ohne Rathaus gibt es keine Amtsgeschäfte zu zeigen — dann bleibt die Übersicht.
	redirect(308, rathaus ? `${base}/building/${rathaus.id}` : base || '/');
};
