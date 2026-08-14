import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as familyService from '$lib/server/service/familyService';
import * as regionService from '$lib/server/service/regionService';
import * as skillService from '$lib/server/service/skillService';
import * as relationshipService from '$lib/server/service/relationshipService';
import * as worldService from '$lib/server/service/worldService';
import { actionMessage } from '$lib/actionMessage';
import { COURT_ACTION_POINT_COST } from '$lib/game/family.logic';
import { SOCIALIZE_ACTION_POINT_COST } from '$lib/game/relationship.logic';
import { garmentYearsLeft } from '$lib/game/attire.logic';
import * as needService from '$lib/server/service/needService';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const jetzt: number = await worldService.currentTick();

	return {
		region: await regionService.getRegion(character.regionId),
		visitCost: SOCIALIZE_ACTION_POINT_COST,
		courtCost: COURT_ACTION_POINT_COST,
		// Was das Äußere hergibt: ein heiles Gewand wirkt immer, Duftwasser nur beim Werben.
		attire: {
			garmentYearsLeft: garmentYearsLeft(character.wornSinceTick ?? null, jetzt),
			perfume:
				(await needService.getStock(character.id)).find((posten) => posten.itemId === 'PERFUME')
					?.quantity ?? 0
		},
		married: character.spouseId !== null,
		people: await mitLehrangeboten(
			await relationshipService.getNeighbours(character.id, character.regionId, jetzt),
			character.id
		)
	};
};

/**
 * Alle Handlungen dieser Seite brauchen dasselbe: einen Charakter und ein Gegenüber.
 *
 * Nimmt die **bereits gelesenen** Formulardaten entgegen und liest sie nicht selbst: Ein
 * Request-Body lässt sich nur einmal lesen. Solange jede Handlung genau ein Feld
 * brauchte, fiel das nicht auf — beim Werben mit Duftwasser kam ein zweites dazu, und der
 * zweite `formData()`-Aufruf lieferte nichts mehr.
 */
function gegenueber(
	locals: App.Locals,
	daten: FormData
): { ich: string; anderer: string } | undefined {
	if (!locals.currentCharacter) return undefined;
	const anderer = daten.get('personId')?.toString();
	if (!anderer) return undefined;
	return { ich: locals.currentCharacter.id, anderer };
}

/**
 * Reicht zu jedem Nachbarn nach, was er lehren könnte.
 *
 * Gezeigt wird nur, was tatsächlich etwas brächte — ein Knopf, der immer scheitert, ist
 * schlimmer als keiner.
 */
async function mitLehrangeboten(
	leute: relationshipService.PersonOnList[],
	schuelerId: string
): Promise<(relationshipService.PersonOnList & { lessons: skillService.Lesson[] })[]> {
	const angereichert = [];
	for (const person of leute) {
		angereichert.push({ ...person, lessons: await skillService.getLessons(person.id, schuelerId) });
	}
	return angereichert;
}

export const actions = {
	learn: async ({ request, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der lernen könnte' });
		}
		// Zwei Felder: Wen und was. Seit `gegenueber` die Daten entgegennimmt statt sie
		// selbst zu lesen, braucht das keinen Sonderweg mehr.
		const daten = await request.formData();
		const meisterId = daten.get('personId')?.toString();
		const art = daten.get('skill')?.toString();
		if (!meisterId || !art) return fail(400, { message: 'Bei wem denn, und was?' });

		const ergebnis = await skillService.learnFrom(
			locals.currentCharacter.id,
			meisterId,
			art as skillService.Lesson['type']
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Eine Lehrstunde genommen.' };
	},

	visit: async ({ request, locals }) => {
		const daten = await request.formData();
		const beide = gegenueber(locals, daten);
		if (!beide) return fail(400, { message: 'Wen denn?' });

		const ergebnis = await relationshipService.spendTimeWith(beide.ich, beide.anderer);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Ihr habt Zeit miteinander verbracht.' };
	},

	court: async ({ request, locals }) => {
		const daten = await request.formData();
		const beide = gegenueber(locals, daten);
		if (!beide) return fail(400, { message: 'Um wen denn?' });

		const mitDuft: boolean = daten.get('perfume') === 'on';
		const ergebnis = await familyService.courtSomeone(beide.ich, beide.anderer, mitDuft);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Du hast um sie oder ihn geworben.' };
	},

	propose: async ({ request, locals }) => {
		const daten = await request.formData();
		const beide = gegenueber(locals, daten);
		if (!beide) return fail(400, { message: 'Wem denn?' });

		const ergebnis = await familyService.propose(beide.ich, beide.anderer);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: ergebnis.married
				? 'Ihr seid verheiratet.'
				: 'Der Antrag ist gestellt — jetzt liegt es am anderen.'
		};
	},

	accept: async ({ request, locals }) => {
		const daten = await request.formData();
		const beide = gegenueber(locals, daten);
		if (!beide) return fail(400, { message: 'Wessen Antrag?' });

		const ergebnis = await familyService.acceptProposal(beide.ich, beide.anderer);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Ihr seid verheiratet.' };
	}
} satisfies Actions;
