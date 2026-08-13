import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as electionService from '$lib/server/service/electionService';
import * as lawService from '$lib/server/service/lawService';
import * as worldService from '$lib/server/service/worldService';
import { actionMessage } from '$lib/actionMessage';
import { OFFICE_NAMES } from '$lib/game/election.logic';
import { LAW_KINDS, type LawKind, LAW_RULES } from '$lib/game/law.logic';
import { ticksToYears, yearOf } from '$lib/game/time';

/** Wer die Stadt führt — und ob man gerade etwas daran ändern kann. */
export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const jetzt: number = await worldService.currentTick();
	const inhaber = await electionService.getHolder(character.regionId);
	const saetze = await lawService.rates(character.regionId);

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
		currentTick: jetzt,
		// Die Gesetzestafel: was gilt, wer es erlassen hat — und für den Amtsinhaber die
		// Formulare, mit denen er es ändert.
		laws: LAW_KINDS.map((kind) => ({
			kind,
			...LAW_RULES[kind],
			value: saetze[kind]
		})),
		chronicle: (await lawService.chronicle(character.regionId, 8)).map((eintrag) => ({
			...eintrag,
			name: LAW_RULES[eintrag.kind].name,
			unit: LAW_RULES[eintrag.kind].unit,
			year: yearOf(eintrag.enactedTick)
		}))
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
	},

	enact: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Nicht angemeldet' });

		const daten = await request.formData();
		const kind = daten.get('kind')?.toString() as LawKind | undefined;
		const value = Number(daten.get('value'));
		if (!kind || !LAW_KINDS.includes(kind)) return fail(400, { message: 'Welches Gesetz?' });

		const ergebnis = await lawService.enact(
			character.id,
			character.regionId,
			kind,
			value,
			await worldService.currentTick()
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		const regel = LAW_RULES[kind];
		const wert: string = regel.unit === 'PERCENT' ? `${value} %` : `${value} Münzen`;
		return { message: `${regel.name}: ${wert}, ab sofort.` };
	}
} satisfies Actions;
