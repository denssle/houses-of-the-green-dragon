import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as tradeService from '$lib/server/service/tradeService';
import { actionMessage } from '$lib/actionMessage';
import * as lawService from '$lib/server/service/lawService';

/**
 * Der Markt einer Stadt — alle Preisschilder auf einen Blick.
 *
 * Der Preisvergleich ist der halbe Handel: Wer nicht sieht, was der Nachbar nimmt, kann
 * seinen eigenen Preis nicht setzen. Deshalb steht hier alles nebeneinander, aus den
 * Läden wie vom Marktplatz.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	return {
		offers: await tradeService.getOffersInRegion(character.regionId, character.id),
		stallFee: await lawService.rate(character.regionId, 'STALL_FEE'),
		salesTax: await lawService.rate(character.regionId, 'SALES_TAX'),
		money: character.money
	};
};

export const actions = {
	buy: async ({ request, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const data = await request.formData();
		const offerId = data.get('offerId')?.toString();
		const menge = Number(data.get('quantity') ?? 1);
		if (!offerId) return fail(400, { message: 'Welches Angebot?' });

		const ergebnis = await tradeService.buyFromOffer(locals.currentCharacter.id, offerId, menge);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `${menge} gekauft.` };
	},

	withdraw: async ({ request, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const offerId = (await request.formData()).get('offerId')?.toString();
		if (!offerId) return fail(400, { message: 'Welches Angebot?' });

		const ergebnis = await tradeService.withdrawOffer(locals.currentCharacter.id, offerId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Das Angebot ist zurückgezogen.' };
	}
} satisfies Actions;
