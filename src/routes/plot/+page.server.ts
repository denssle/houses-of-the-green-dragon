import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as auctionService from '$lib/server/service/auctionService';
import * as plotService from '$lib/server/service/plotService';
import { actionMessage } from '$lib/actionMessage';
import { PLOT_PRICE } from '$lib/game/economy';

export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		return {
			freeLand: [],
			ownedPlots: [],
			plotsForSale: [],
			buildingsForSale: [],
			auctions: [],
			developments: [],
			price: PLOT_PRICE
		};
	}
	return {
		freeLand: await plotService.getFreeBuildingLand(character.regionId),
		ownedPlots: await plotService.getPlotsOfCharacter(character.id),
		// Was andere abgeben: Boden ohne Haus und Haus samt Boden.
		plotsForSale: await plotService.getPlotsForSale(character.regionId),
		buildingsForSale: await buildingService.getBuildingsForSale(character.regionId),
		// Neu erschlossenes Land geht nicht in den Verkauf, sondern unter den Hammer.
		auctions: await auctionService.getOpenAuctions(character.regionId, character.id),
		// Und was noch nicht so weit ist: die Baustellen, an denen sich für Tagelohn
		// arbeiten lässt (5.92).
		developments: await auctionService.getDevelopments(character.regionId),
		price: PLOT_PRICE
	};
};

export const actions = {
	buy: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) {
			return fail(401, { message: 'Kein Charakter, der kaufen könnte' });
		}

		const data = await request.formData();
		const plotId = data.get('plotId')?.toString();
		if (!plotId) {
			return fail(400, { message: 'Kein Grundstück gewählt' });
		}

		const ergebnis = await plotService.buyPlot(plotId, character.id);
		if (!ergebnis.ok) {
			return fail(400, { message: actionMessage(ergebnis.reason) });
		}
		return { message: `${ergebnis.plot.address} gehört jetzt dir.` };
	},

	sell: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Kein Charakter, der verkaufen könnte' });

		const data = await request.formData();
		const plotId = data.get('plotId')?.toString();
		const roh = data.get('price')?.toString();
		if (!plotId) return fail(400, { message: 'Kein Grundstück gewählt' });

		const preis: number | null = roh ? Number(roh) : null;
		if (preis !== null && (!Number.isInteger(preis) || preis < 0)) {
			return fail(400, { message: 'Der Preis muss eine ganze Zahl sein.' });
		}

		const ergebnis = await plotService.setPlotPrice(character.id, plotId, preis);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: preis === null ? 'Das Grundstück steht nicht mehr zum Verkauf.' : 'Preis gesetzt.'
		};
	},

	buyFrom: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Kein Charakter, der kaufen könnte' });

		const plotId = (await request.formData()).get('plotId')?.toString();
		if (!plotId) return fail(400, { message: 'Kein Grundstück gewählt' });

		const ergebnis = await plotService.buyFromOwner(character.id, plotId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Der Boden gehört jetzt dir.' };
	},

	/**
	 * Eine Schicht auf einer Erschließung — für jeden, nicht nur für Tagelöhner (5.92).
	 *
	 * Sie steht hier und nicht bei der Arbeit, weil sie hier zu sehen ist: neben der
	 * Fläche, um die es geht, und neben der Versteigerung, die daraus wird.
	 */
	survey: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Kein Charakter, der graben könnte' });

		const plotId = (await request.formData()).get('plotId')?.toString();
		if (!plotId) return fail(400, { message: 'Auf welcher Fläche?' });

		const ergebnis = await auctionService.surveyForHire(character.id, plotId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: ergebnis.finished
				? `Feierabend, ${ergebnis.earned} Münzen Lohn — und die Fläche ist fertig. Sie geht unter den Hammer.`
				: `Feierabend. ${ergebnis.earned} Münzen Lohn von der Stadt.`
		};
	},

	bid: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Kein Charakter, der bieten könnte' });

		const daten = await request.formData();
		const auctionId = daten.get('auctionId')?.toString();
		const amount = Number(daten.get('amount'));
		if (!auctionId) return fail(400, { message: 'Auf welches Grundstück?' });

		const ergebnis = await auctionService.bid(character.id, auctionId, amount);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `Dein Gebot steht: ${amount} Münzen.` };
	}
} satisfies Actions;
