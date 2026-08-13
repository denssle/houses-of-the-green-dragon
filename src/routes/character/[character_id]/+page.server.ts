import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as characterService from '$lib/server/service/characterService';
import * as buildingService from '$lib/server/service/buildingService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as needService from '$lib/server/service/needService';
import * as skillService from '$lib/server/service/skillService';
import * as plotService from '$lib/server/service/plotService';
import * as regionService from '$lib/server/service/regionService';
import * as worldService from '$lib/server/service/worldService';
import { deathProbabilityPerYear } from '$lib/game/mortality.logic';
import { personalityLabel } from '$lib/game/personality.logic';
import { ageInYears, MAX_ACTION_POINTS } from '$lib/game/time';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const jetzt: number = await worldService.currentTick();
	const alter: number = ageInYears(character.birthTick, jetzt);
	const eigeneGebäude = await buildingService.getBuildingsOfCharacter(character.id);
	const zuhause = character.homeBuildingId
		? await buildingService.getBuilding(character.homeBuildingId)
		: undefined;

	return {
		character,
		age: alter,
		nature: personalityLabel(character.personality, character.gender),
		// Nicht die Zahl, sondern ob überhaupt eines besteht: Ein Prozentwert lüde dazu
		// ein, den Tod auszurechnen statt sich auf ihn vorzubereiten.
		mortal: deathProbabilityPerYear(alter) > 0,
		maxActionPoints: MAX_ACTION_POINTS,
		region: await regionService.getRegion(character.regionId),
		home: zuhause,
		plots: await plotService.getPlotsOfCharacter(character.id),
		buildings: eigeneGebäude,
		children: await lifecycleService.getChildren(character.id, jetzt),
		skills: await skillService.getSkills(character.id),
		hunger: await needService.getHunger(character.id, jetzt),
		spouse: character.spouseId ? await characterService.getCharacter(character.spouseId) : undefined
	};
};

export const actions = {
	/**
	 * Die Erbenwahl.
	 *
	 * Ausdrücklich ein POST auf die eigene Seite und nicht ein Link: Die App lädt Links
	 * beim Überfahren vor — ein `href`, der den Erben umschreibt, tut das schon, wenn die
	 * Maus darüberwandert.
	 */
	heir: async ({ request, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der etwas zu vererben hätte' });
		}

		const data = await request.formData();
		const heirId: string | null = data.get('heirId')?.toString() || null;

		if (!(await lifecycleService.designateHeir(locals.currentCharacter.id, heirId))) {
			return fail(400, { message: 'Nur ein eigenes lebendes Kind kann erben' });
		}
		return { message: heirId ? 'Der Erbe ist benannt.' : 'Die Benennung ist zurückgenommen.' };
	}
} satisfies Actions;
