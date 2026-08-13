import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as electionService from '$lib/server/service/electionService';
import * as worldService from '$lib/server/service/worldService';
import { actionMessage } from '$lib/actionMessage';
import { OFFICE_NAMES } from '$lib/game/election.logic';
import { ticksToYears } from '$lib/game/time';

/** Wer die Stadt führt — und ob man gerade etwas daran ändern kann. */
export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const jetzt: number = await worldService.currentTick();
	const inhaber = await electionService.getHolder(character.regionId);

	return {
		office: OFFICE_NAMES.MAYOR,
		holder: inhaber
			? {
					...inhaber,
					mine: inhaber.characterId === character.id,
					// Als Jahre, nicht als Ticks: Ticks sind eine Rechengröße, keine Auskunft.
					yearsLeft:
						inhaber.termEndsTick === null
							? null
							: Math.max(0, Math.ceil(ticksToYears(inhaber.termEndsTick - jetzt)))
				}
			: undefined,
		ballot: await electionService.getBallot(character.regionId, character.id),
		treasury: await electionService.getTreasury(character.regionId),
		currentTick: jetzt
	};
};

export const actions = {
	stand: async ({ locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Nicht angemeldet' });

		const ergebnis = await electionService.stand(character.id, character.regionId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Du stehst auf dem Wahlzettel.' };
	},

	vote: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Nicht angemeldet' });

		const candidateId = (await request.formData()).get('candidateId')?.toString();
		if (!candidateId) return fail(400, { message: 'Für wen?' });

		const ergebnis = await electionService.vote(character.id, character.regionId, candidateId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Deine Stimme ist abgegeben.' };
	}
} satisfies Actions;
