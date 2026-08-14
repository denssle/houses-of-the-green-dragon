import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import * as plotService from '$lib/server/service/plotService';
import type { BuildingAction } from '$lib/model/buildingAction';
import { actionMessage, nameMessage } from '$lib/actionMessage';
import * as productionService from '$lib/server/service/productionService';
import { getItemTemplate } from '$lib/model/itemTemplate';
import * as tradeService from '$lib/server/service/tradeService';
import * as needService from '$lib/server/service/needService';
import * as employmentService from '$lib/server/service/employmentService';
import * as lawService from '$lib/server/service/lawService';
import * as worldService from '$lib/server/service/worldService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as schoolService from '$lib/server/service/schoolService';
import type { SkillType } from '$lib/game/skill.logic';
import { AGE_OF_MAJORITY } from '$lib/game/time';
import {
	CONDITION_MAX,
	RENOVATION_COST_PER_POINT,
	renovationMaterial
} from '$lib/game/building.logic';
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

	// Wohnraum mit freiem Platz, der einem selbst oder der Stadt gehört — dann darf man
	// einziehen (5.6). Die Zahl steht daneben: „Noch zwei Plätze" ist die Auskunft, die
	// über Bleiben oder Weitersuchen entscheidet.
	const freiePlaetze: number | null = await buildingService.freierWohnraum(building.id);
	const darfEinziehen: boolean =
		locals.currentCharacter !== undefined &&
		locals.currentCharacter.homeBuildingId !== building.id &&
		(gehoertMir || building.ownerType === 'CITY') &&
		freiePlaetze !== null &&
		freiePlaetze > 0;

	return {
		building,
		option,
		plot: building.plotId ? await plotService.getPlot(building.plotId) : undefined,
		mine: gehoertMir,
		freeRoom: freiePlaetze,
		canMoveIn: darfEinziehen,
		livesHere: locals.currentCharacter?.homeBuildingId === building.id,
		levelName: option ? levelOf(option, building.level).name : undefined,
		maxLevel: option ? maxLevel(option) : 1,
		upgradeCost: option ? upgradePrice(option, building.level) : undefined,
		// Was eine Renovierung jetzt kostete — sichtbar, damit man abwägen kann, ob man
		// sie noch aufschiebt.
		// Ein Betrieb kann mehreres herstellen (die Alchemistenküche etwa), deshalb eine
		// Liste — und je Eintrag ein eigener Knopf.
		recipes: (option?.recipes ?? []).map((rezept) => ({
			itemId: rezept.outputItemId,
			input: rezept.input.map((zutat) => ({
				name: getItemTemplate(zutat.itemId)?.name ?? zutat.itemId,
				quantity: zutat.quantity
			})),
			output: getItemTemplate(rezept.outputItemId)?.name ?? rezept.outputItemId,
			cost: rezept.actionPointCost
		})),
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
		// Die Schule: wer hier unterrichtet, was ein Tag kostet und welche eigenen Kinder
		// man hinschicken könnte.
		school:
			building.optionId === schoolService.SCHOOL_OPTION_ID && locals.currentCharacter
				? {
						teachers: await schoolService.getTeachers(params.building_id),
						fee: await lawService.rate(locals.currentCharacter.regionId, 'SCHOOL_FEE'),
						children: (
							await lifecycleService.getChildren(
								locals.currentCharacter.id,
								await worldService.currentTick()
							)
						).filter((kind) => kind.age < AGE_OF_MAJORITY)
					}
				: undefined,
		renovationCost: Math.ceil(CONDITION_MAX - building.condition) * RENOVATION_COST_PER_POINT,
		// Was das Herrichten an Holz kostet — sichtbar, bevor man es versucht.
		renovationMaterial: renovationMaterial(Math.ceil(CONDITION_MAX - building.condition)).map(
			(posten) => ({ ...posten, name: getItemTemplate(posten.itemId)?.name ?? posten.itemId })
		)
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
		if (!ergebnis.ok) {
			const fehlt = 'missing' in ergebnis ? ergebnis.missing : undefined;
			const nachsatz: string = fehlt
				? ' Es fehlen: ' +
					fehlt
						.map(
							(posten) =>
								posten.quantity + ' ' + (getItemTemplate(posten.itemId)?.name ?? posten.itemId)
						)
						.join(', ') +
					'.'
				: '';
			return fail(400, { message: actionMessage(ergebnis.reason) + nachsatz });
		}
		return { message: `Renoviert. ${ergebnis.spent} Münzen und das Holz dazu.` };
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

	craft: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der arbeiten könnte' });
		}
		const itemId = (await request.formData()).get('itemId')?.toString();
		const ergebnis = await productionService.craft(
			locals.currentCharacter.id,
			params.building_id,
			itemId
		);
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
	},

	/**
	 * Ein Kind zur Schule schicken.
	 *
	 * Bezahlt wird vom Elternteil, nicht vom Kind: Ein Kind hat selten eigenes Geld, und
	 * die Ausgabe soll dort anfallen, wo die Entscheidung getroffen wird.
	 */
	school: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });

		const daten = await request.formData();
		const childId = daten.get('childId')?.toString();
		const skill = daten.get('skill')?.toString() as SkillType | undefined;
		if (!childId || !skill) return fail(400, { message: 'Wer soll was lernen?' });

		const ergebnis = await schoolService.attend(
			childId,
			params.building_id,
			skill,
			locals.currentCharacter.id
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });

		const kosten: string =
			ergebnis.fee > 0 ? `${ergebnis.fee} Münzen Schulgeld.` : 'auf Kosten der Stadt.';
		return { message: `Ein Schultag bei ${ergebnis.teacher} — ${kosten}` };
	},

	/**
	 * Hier einziehen.
	 *
	 * Der Weg, den es bis 5.6 nur für NPCs gab: in die städtische Unterkunft oder ins
	 * eigene Haus. Wer obdachlos ist, erholt sich nicht und bekommt keine Kinder — für
	 * einen Neuling war das eine Sackgasse, für einen Abgebrannten ebenso.
	 */
	moveIn: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der einziehen könnte' });
		}

		const ergebnis = await buildingService.moveInto(locals.currentCharacter.id, params.building_id);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });

		return { message: 'Du wohnst jetzt hier.' };
	},

	/** Dem eigenen Haus einen Namen geben — „Bäckerei" ist eine Gattung, kein Betrieb. */
	rename: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der etwas zu benennen hätte' });
		}

		const wunsch = (await request.formData()).get('name')?.toString() ?? '';
		const ergebnis = await buildingService.renameBuilding(
			locals.currentCharacter.id,
			params.building_id,
			wunsch
		);
		if (!ergebnis.ok) return fail(400, { message: nameMessage(ergebnis.reason) });

		return { message: `Das Haus heißt jetzt ${ergebnis.name}.` };
	}
} satisfies Actions;
