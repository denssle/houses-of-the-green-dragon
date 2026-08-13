import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import * as plotService from '$lib/server/service/plotService';
import type { BuildingAction } from '$lib/model/buildingAction';
import { actionMessage } from '$lib/actionMessage';
import * as productionService from '$lib/server/service/productionService';
import { getItemTemplate } from '$lib/model/itemTemplate';
import * as tradeService from '$lib/server/service/tradeService';
import * as needService from '$lib/server/service/needService';
import * as employmentService from '$lib/server/service/employmentService';
import * as lawService from '$lib/server/service/lawService';
import { CONDITION_MAX, RENOVATION_COST_PER_POINT } from '$lib/game/building.logic';
import { levelOf, maxLevel, upgradePrice } from '$lib/model/buildingTemplate';

export const load: PageServerLoad = async ({ params, locals }) => {
	const building = await buildingService.getBuilding(params.building_id);
	if (!building) {
		// Auch der Weg, auf dem eine Ruine sichtbar wird: `getBuilding` hat sie soeben
		// abgeräumt, und wer den Link im Lesezeichen hatte, findet nichts mehr vor.
		error(404, 'Not Found');
	}

	const option = buildingService.getBuildingOption(building.optionId);
	const gehoertMir: boolean =
		locals.currentCharacter !== undefined &&
		building.ownerCharacterId === locals.currentCharacter.id;

	return {
		building,
		option,
		plot: building.plotId ? await plotService.getPlot(building.plotId) : undefined,
		mine: gehoertMir,
		levelName: option ? levelOf(option, building.level).name : undefined,
		maxLevel: option ? maxLevel(option) : 1,
		upgradeCost: option ? upgradePrice(option, building.level) : undefined,
		// Was eine Renovierung jetzt kostete — sichtbar, damit man abwägen kann, ob man
		// sie noch aufschiebt.
		recipe: option?.recipe
			? {
					input: option.recipe.input.map((zutat) => ({
						name: getItemTemplate(zutat.itemId)?.name ?? zutat.itemId,
						quantity: zutat.quantity
					})),
					output: getItemTemplate(option.recipe.outputItemId)?.name ?? option.recipe.outputItemId,
					cost: option.recipe.actionPointCost
				}
			: undefined,
		// Jedes Handelshaus ist zugleich Verkaufsstelle — Lager und Preisschilder gehoeren
		// deshalb auf die Gebaeudeseite und nicht in eine eigene Ecke.
		stock: await tradeService.getBuildingStock(params.building_id),
		offers: await tradeService.getOffersAt(params.building_id, locals.currentCharacter?.id),
		myStock: locals.currentCharacter ? await needService.getStock(locals.currentCharacter.id) : [],
		isMarket: building.optionId === tradeService.MARKET_OPTION_ID,
		// Der Satz gilt je Stadt, und der Betrachter steht in einer — seine ist die richtige.
		stallFee: locals.currentCharacter
			? await lawService.rate(locals.currentCharacter.regionId, 'STALL_FEE')
			: 0,
		staff: await employmentService.getStaff(params.building_id),
		renovationCost: Math.ceil(CONDITION_MAX - building.condition) * RENOVATION_COST_PER_POINT
	};
};

export const actions = {
	/** Die Handlungen aus der Vorlage — heute nur Arbeiten. */
	act: async ({ request, params, locals }) => {
		const building = await buildingService.getBuilding(params.building_id);
		if (!building) error(404, 'Not Found');
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der handeln könnte' });
		}

		const data = await request.formData();
		const action = data.get('action')?.toString() as BuildingAction;
		const option = buildingService.getBuildingOption(building.optionId);

		if (!option?.actions.includes(action)) {
			return fail(403, { message: 'Diese Handlung ist hier nicht möglich' });
		}

		const ergebnis = await buildingActionService.doBuildingAction(
			action,
			locals.currentCharacter.id,
			building.id
		);
		if (!ergebnis.ok) {
			return fail(400, { message: actionMessage(ergebnis.reason) });
		}
		return { message: `Feierabend. ${ergebnis.earned} Münzen verdient.` };
	},

	renovate: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der renovieren könnte' });
		}
		const ergebnis = await buildingService.renovateBuilding(
			locals.currentCharacter.id,
			params.building_id
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `Renoviert. ${ergebnis.spent} Münzen für Material und Handwerk.` };
	},

	upgrade: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der bauen könnte' });
		}
		const ergebnis = await buildingService.upgradeBuilding(
			locals.currentCharacter.id,
			params.building_id
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `Ausgebaut. ${ergebnis.spent} Münzen verbaut.` };
	},

	sell: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der verkaufen könnte' });
		}
		const roh = (await request.formData()).get('price')?.toString();
		const preis: number | null = roh ? Number(roh) : null;
		if (preis !== null && (!Number.isInteger(preis) || preis < 0)) {
			return fail(400, { message: 'Der Preis muss eine ganze Zahl sein.' });
		}

		const ergebnis = await buildingService.setBuildingPrice(
			locals.currentCharacter.id,
			params.building_id,
			preis
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: preis === null ? 'Das Haus steht nicht mehr zum Verkauf.' : 'Preis gesetzt.'
		};
	},

	craft: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der arbeiten könnte' });
		}
		const ergebnis = await productionService.craft(locals.currentCharacter.id, params.building_id);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: `${ergebnis.produced} ${getItemTemplate(ergebnis.itemId)?.name ?? ''} hergestellt.`
		};
	},

	stockIn: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString();
		const menge = Number(data.get('quantity') ?? 0);
		if (!itemId) return fail(400, { message: 'Was denn?' });

		const ergebnis = await tradeService.moveToStock(
			locals.currentCharacter.id,
			params.building_id,
			itemId,
			menge
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: menge > 0 ? 'Eingelagert.' : 'Ausgelagert.' };
	},

	sellOffer: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString();
		const menge = Number(data.get('quantity') ?? 0);
		const preis = Number(data.get('price') ?? 0);
		if (!itemId) return fail(400, { message: 'Was denn?' });

		const ergebnis = await tradeService.placeOffer(
			locals.currentCharacter.id,
			params.building_id,
			itemId,
			menge,
			preis
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Das Preisschild hängt.' };
	},

	buyOffer: async ({ request, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const data = await request.formData();
		const offerId = data.get('offerId')?.toString();
		const menge = Number(data.get('quantity') ?? 1);
		if (!offerId) return fail(400, { message: 'Welches Angebot?' });

		const ergebnis = await tradeService.buyFromOffer(locals.currentCharacter.id, offerId, menge);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `${menge} gekauft.` };
	},

	hire: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const roh = (await request.formData()).get('wage')?.toString();
		const lohn: number | null = roh ? Number(roh) : null;

		const ergebnis = await employmentService.offerJob(
			locals.currentCharacter.id,
			params.building_id,
			lohn
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: lohn === null ? 'Der Aushang ist ab.' : 'Der Aushang hängt.' };
	},

	buy: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der kaufen könnte' });
		}
		const ergebnis = await buildingService.buyBuilding(
			locals.currentCharacter.id,
			params.building_id
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `Gekauft für ${ergebnis.spent} Münzen — samt Grundstück.` };
	}
} satisfies Actions;
