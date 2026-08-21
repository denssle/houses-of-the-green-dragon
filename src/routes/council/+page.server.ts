import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as auctionService from '$lib/server/service/auctionService';
import * as buildingService from '$lib/server/service/buildingService';
import * as electionService from '$lib/server/service/electionService';
import * as employmentService from '$lib/server/service/employmentService';
import * as hazardService from '$lib/server/service/hazardService';
import * as lawService from '$lib/server/service/lawService';
import * as worldService from '$lib/server/service/worldService';
import { actionMessage } from '$lib/actionMessage';
import { CONDITION_MAX, RENOVATION_COST_PER_POINT } from '$lib/game/building.logic';
import { OFFICE_NAMES } from '$lib/game/election.logic';
import { DEVELOPMENT_COST_PER_PLOT, MAX_PLOTS_PER_DEVELOPMENT } from '$lib/game/auction.logic';
import { LAW_KINDS, type LawKind, LAW_RULES } from '$lib/game/law.logic';
import { ticksToYears, yearOf } from '$lib/game/time';

/**
 * Was der Bürgermeister überhaupt noch errichten kann.
 *
 * Was es einmal je Stadt gibt und schon steht, gehört nicht auf die Liste — eine
 * Schaltfläche, die verlässlich mit einer Fehlermeldung antwortet, ist keine Handlung.
 */
async function baubar(regionId: string) {
	const vorlagen = buildingService
		.getBuildingOptions()
		.filter((vorlage) => vorlage.type === 'PUBLIC' && vorlage.levels[0].price > 0);

	const offen = [];
	for (const vorlage of vorlagen) {
		if (await buildingService.limitReached(vorlage, regionId)) continue;
		offen.push({
			optionId: vorlage.optionId,
			name: vorlage.initialName,
			description: vorlage.description,
			price: vorlage.levels[0].price
		});
	}
	return offen;
}

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
		// Die öffentlichen Bauten und ihr Zustand. Ohne diese Liste fiele der Verfall erst
		// auf, wenn die Unterkunft niemanden mehr aufnimmt.
		publicBuildings: await Promise.all(
			(await buildingService.getPublicBuildings(character.regionId)).map(async (haus) => {
				const zahlt: boolean = Boolean(
					buildingService.getBuildingOption(haus.optionId)?.levels[0]?.wagePerActionPoint
				);
				return {
					id: haus.id,
					name: haus.name,
					condition: haus.condition,
					offeredWage: haus.offeredWage,
					employer: zahlt,
					// **Wer im Sold der Stadt steht** (5.31). Der Bürgermeister setzte den Sold
					// aus, sah aber nie, wer ihn bezieht — und wurde niemanden wieder los. Ein
					// Wächter, der nichts taugt, blieb bis an sein Lebensende Wächter.
					//
					// **Nur bei den Häusern, die überhaupt zahlen.** Ein Rathaus stellt
					// niemanden ein; für alle vier öffentlichen Bauten nachzuschlagen kostete
					// vier Abfragen je Aufruf, und diese Seite wird oft geladen.
					staff: zahlt ? await employmentService.getStaff(haus.id) : [],
					renovationCost: Math.ceil(CONDITION_MAX - haus.condition) * RENOVATION_COST_PER_POINT
				};
			})
		),
		// Was die Wache bringt, in einer Zahl: Ohne sie wäre ihr Sold eine Ausgabe ohne
		// sichtbaren Gegenwert — und der erste Bürgermeister, der spart, hätte recht.
		safety: await hazardService.getSafety(character.regionId),
		// Erschließen: was es kostet und wie viel auf einmal geht.
		development: {
			costPerPlot: DEVELOPMENT_COST_PER_PLOT,
			max: MAX_PLOTS_PER_DEVELOPMENT,
			running: (await auctionService.getOpenAuctions(character.regionId)).length
		},
		freePlots: await buildingService.getFreeCityPlots(character.regionId),
		buildable: await baubar(character.regionId),
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
	},

	renovate: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Nicht angemeldet' });

		const buildingId = (await request.formData()).get('buildingId')?.toString();
		if (!buildingId) return fail(400, { message: 'Welches Haus?' });

		const ergebnis = await buildingService.renovatePublicBuilding(character.id, buildingId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `Hergerichtet. ${ergebnis.spent} Münzen aus der Stadtkasse.` };
	},

	buildPublic: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Nicht angemeldet' });

		const daten = await request.formData();
		const optionId = Number(daten.get('optionId'));
		const plotId = daten.get('plotId')?.toString();
		if (!plotId || !Number.isInteger(optionId)) return fail(400, { message: 'Was und wo?' });

		const ergebnis = await buildingService.buildPublicBuilding(character.id, optionId, plotId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `${ergebnis.building.name} steht.` };
	},

	// Der Sold der Wache ist eine Amtsentscheidung: derselbe Aushang wie bei jedem
	// Betrieb, nur zahlt die Stadtkasse.
	pay: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Nicht angemeldet' });

		const daten = await request.formData();
		const buildingId = daten.get('buildingId')?.toString();
		const roh = daten.get('wage')?.toString();
		if (!buildingId) return fail(400, { message: 'Für welches Haus?' });

		const wage: number | null = roh === undefined || roh === '' ? null : Number(roh);
		const ergebnis = await employmentService.offerJob(character.id, buildingId, wage);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: wage === null ? 'Der Aushang ist abgenommen.' : `Sold: ${wage} je Aktionspunkt.`
		};
	},

	/**
	 * Aus dem Dienst der Stadt entlassen.
	 *
	 * Dieselbe Handlung wie beim privaten Betrieb, dieselbe Prüfung — nur bestimmt hier
	 * das Amt und nicht der Besitz. Deshalb steht sie auf dieser Seite: Ein städtisches
	 * Haus gehört niemandem, also findet der Bürgermeister seine Belegschaft dort, wo er
	 * auch den Sold aussetzt.
	 */
	dismiss: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Nicht angemeldet' });

		const daten = await request.formData();
		const buildingId = daten.get('buildingId')?.toString();
		const employeeId = daten.get('employeeId')?.toString();
		if (!buildingId || !employeeId) return fail(400, { message: 'Wen aus welchem Haus?' });

		const ergebnis = await employmentService.dismiss(character.id, buildingId, employeeId);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Aus dem Dienst entlassen.' };
	},

	develop: async ({ request, locals }) => {
		const character = locals.currentCharacter;
		if (!character) return fail(401, { message: 'Nicht angemeldet' });

		const count = Number((await request.formData()).get('count'));
		const ergebnis = await auctionService.developLand(character.id, character.regionId, count);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message:
				ergebnis.plots +
				' Grundstücke ausgewiesen für ' +
				ergebnis.spent +
				' Münzen — sie gehen unter den Hammer.'
		};
	}
} satisfies Actions;
