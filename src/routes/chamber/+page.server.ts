import { garmentYearsLeft } from '$lib/game/attire.logic';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as needService from '$lib/server/service/needService';
import * as tradeService from '$lib/server/service/tradeService';
import * as worldService from '$lib/server/service/worldService';
import { actionMessage } from '$lib/actionMessage';
import { CARRIED_CAPACITY } from '$lib/game/inventory.logic';

/**
 * Die Kammer — was einem selbst gehört und nicht in einem Haus liegt (5.33).
 *
 * **Bis hierher hatte der persönliche Vorrat kein Zuhause.** Er hing als Abschnitt am
 * städtischen Kornspeicher, also ausgerechnet an einem fremden Laden, und war sonst über
 * die Bau- und Gebäudeseiten verstreut. Wer wissen wollte, was er besitzt, musste raten,
 * wo er nachsieht.
 *
 * Hier steht beides beisammen: was da ist, und wie viel noch hineinpasst. Der Kornspeicher
 * ist damit wieder das, was er ist — ein Laden.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const character = locals.currentCharacter;
	if (!character) {
		error(404, 'Not Found');
	}

	const jetzt: number = await worldService.currentTick();
	const vomDach: number = await buildingService.storageAtHome(character.homeBuildingId, jetzt);

	return {
		stock: await needService.getStock(character.id),
		// Zwei Zahlen, keine Prozentangabe: „31 von 40" sagt einem Käufer sofort, wie viele
		// Brote noch hineingehen — „78 %" verlangt eine Rechnung.
		used: await needService.chamberUsed(character.id),
		capacity: await needService.chamberCapacityOf(character.id),
		// **Woraus sich der Platz ergibt.** Ohne diese Aufteilung stünde da eine Zahl, die
		// sich beim Umzug ändert, ohne dass jemand sagen könnte warum.
		carried: CARRIED_CAPACITY,
		fromHome: vomDach,
		hunger: await needService.getHunger(character.id, jetzt),
		// Was das Äußere hergibt — die Kammer ist der Ort, an dem man sich damit befasst.
		garmentYearsLeft: garmentYearsLeft(character.wornSinceTick ?? null, jetzt),
		// Die eigenen Häuser: wohin man einlagern kann, wenn es hier zu eng wird. Der
		// Ausweg gehört neben die Grenze, sonst ist sie nur eine Absage.
		buildings: (await buildingService.getBuildingsOfCharacter(character.id)).map((haus) => ({
			id: haus.id,
			name: haus.name
		}))
	};
};

export const actions = {
	eat: async ({ request, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der essen könnte' });
		}
		const itemId = (await request.formData()).get('itemId')?.toString();
		if (!itemId) return fail(400, { message: 'Was denn?' });

		const ergebnis = await needService.eatItem(locals.currentCharacter.id, itemId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Gegessen.' };
	},

	/**
	 * Einlagern, ohne die Seite zu wechseln.
	 *
	 * **Der Ausweg gehört neben die Grenze.** Wer hier steht, weil die Kammer voll ist,
	 * soll nicht erst herausfinden müssen, dass das Umlagern auf der Gebäudeseite wohnt.
	 * Geprüft wird trotzdem dort, wo es hingehört: `moveToStock` lässt nur den Eigentümer
	 * in sein eigenes Lager.
	 */
	store: async ({ request, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });

		const daten = await request.formData();
		const itemId = daten.get('itemId')?.toString();
		const buildingId = daten.get('buildingId')?.toString();
		const menge = Number(daten.get('quantity') ?? 0);
		if (!itemId || !buildingId) return fail(400, { message: 'Was denn wohin?' });
		if (!Number.isInteger(menge) || menge < 1) return fail(400, { message: 'Wie viel denn?' });

		const ergebnis = await tradeService.moveToStock(
			locals.currentCharacter.id,
			buildingId,
			itemId,
			menge
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `${menge} eingelagert.` };
	},

	/** Ein Gewand anlegen — es ersetzt das bisherige. */
	wear: async ({ locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });

		const ergebnis = await needService.wearGarment(locals.currentCharacter.id);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Du trägst jetzt ein neues Gewand.' };
	},

	drink: async ({ locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });

		const ergebnis = await needService.drinkTonic(locals.currentCharacter.id);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `Getrunken. ${ergebnis.restored} Aktionspunkte zurück.` };
	}
} satisfies Actions;
