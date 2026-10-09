import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as needService from '$lib/server/service/needService';
import * as worldService from '$lib/server/service/worldService';
import { actionMessage } from '$lib/actionMessage';

/**
 * Der städtische Kornspeicher.
 *
 * Eine Krücke, bis es Bauern, Mühlen und Läden gibt (4.6b und 4.6c) — aber eine nötige:
 * Ohne eine Quelle für Nahrung verhungert die Stadt, bevor die Produktion gebaut ist.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const jetzt: number = await worldService.currentTick();
	return {
		offers: needService.granaryOffers(),
		// **Nur noch die beiden Zahlen** (5.33): Der Vorrat selbst wohnt unter `/inventory`.
		// Hier steht, was man beim Einkaufen wissen muss — wie viel noch hineinpasst.
		used: await needService.inventoryUsed(character.id),
		capacity: await needService.inventoryCapacityOf(character.id),
		hunger: await needService.getHunger(character.id, jetzt),
		money: character.money
	};
};

export const actions = {
	buy: async ({ request, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der kaufen könnte' });
		}
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString();
		const menge = Number(data.get('quantity') ?? 1);
		if (!itemId) return fail(400, { message: 'Was denn?' });

		const ergebnis = await needService.buyFromGranary(locals.currentCharacter.id, itemId, menge);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `${menge} eingekauft.` };
	}
	// **Essen, Anziehen und Trinken sind mit 5.33 ins Inventar gezogen.** Sie hingen hier,
	// weil hier der Vorrat stand; mit ihm gehören sie dorthin, wo er jetzt wohnt. Ein Laden
	// verkauft — was man mit dem Gekauften tut, ist nicht seine Sache.
} satisfies Actions;
