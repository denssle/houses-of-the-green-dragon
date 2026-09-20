import * as auctionService from '$lib/server/service/auctionService';
import * as buildingService from '$lib/server/service/buildingService';
import * as electionService from '$lib/server/service/electionService';
import * as employmentService from '$lib/server/service/employmentService';
import * as lawService from '$lib/server/service/lawService';
import * as worldService from '$lib/server/service/worldService';
import { OFFICE_NAMES } from '$lib/game/election.logic';
import { DEVELOPMENT_SHIFTS_PER_PLOT, MAX_PLOTS_PER_DEVELOPMENT } from '$lib/game/auction.logic';
import { LAW_KINDS, LAW_RULES } from '$lib/game/law.logic';
import { ticksToYears, yearOf } from '$lib/game/time';

/**
 * Die Amtsgeschäfte einer Stadt — Amt, Wahl, Kasse, Gesetze, öffentliche Bauten.
 *
 * **Warum das hier steht und nicht in einer Route** (5.57): Bis dahin gab es das Rathaus
 * zweimal. Einmal als Weg (`/council`) mit Amt und Gesetzen, einmal als Gebäude
 * (`/building/…`) mit Zustand und Belegschaft — und auf der Übersicht standen beide
 * untereinander, gleich benannt, verschieden verlinkt. Ein Haus, zwei Adressen: Das ist
 * keine Ordnung, sondern eine Falle.
 *
 * Jetzt gehört alles auf die Seite des Hauses, und diese Funktion liefert den Teil, der
 * die Stadt betrifft. Sie steht als eigenes Modul da, weil sie zwischen Route und Diensten
 * vermittelt: Sie enthält keine Regel, sondern stellt zusammen, was eine Seite braucht.
 */
export async function officeData(regionId: string, characterId: string) {
	const jetzt: number = await worldService.currentTick();
	const inhaber = await electionService.getHolder(regionId);
	const saetze = await lawService.rates(regionId);

	return {
		office: OFFICE_NAMES.MAYOR,
		holder: inhaber
			? {
					...inhaber,
					mine: inhaber.characterId === characterId,
					// Als Jahre, nicht als Ticks: Ticks sind eine Rechengröße, keine Auskunft.
					yearsLeft:
						inhaber.termEndsTick === null
							? null
							: Math.max(0, Math.ceil(ticksToYears(inhaber.termEndsTick - jetzt)))
				}
			: undefined,
		ballot: await electionService.getBallot(regionId, characterId),
		treasury: await electionService.getTreasury(regionId),
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
			(await buildingService.getPublicBuildings(regionId)).map(async (haus) => {
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
					// aus, sah aber nie, wer ihn bezieht — und wurde niemanden wieder los.
					//
					// **Nur bei den Häusern, die überhaupt zahlen.** Ein Rathaus stellt niemanden
					// ein; für alle vier öffentlichen Bauten nachzuschlagen kostete vier Abfragen
					// je Aufruf, und diese Seite wird oft geladen.
					staff: zahlt ? await employmentService.getStaff(haus.id) : []
				};
			})
		),
		// Erschließen: was es an Arbeit kostet, wie viel auf einmal geht — und was gerade
		// läuft. **Beides zählt** (5.92): die Baustellen, auf denen noch gearbeitet wird,
		// und die Versteigerungen der fertigen. Solange eine Baustelle offen ist, weist der
		// Amtsinhaber keine neue aus.
		development: {
			shiftsPerPlot: DEVELOPMENT_SHIFTS_PER_PLOT,
			max: MAX_PLOTS_PER_DEVELOPMENT,
			sites: await auctionService.getDevelopments(regionId),
			running: (await auctionService.getOpenAuctions(regionId)).length
		},
		freePlots: await buildingService.getFreeCityPlots(regionId),
		buildable: await baubar(regionId),
		lawChronicle: (await lawService.chronicle(regionId, 8)).map((eintrag) => ({
			...eintrag,
			name: LAW_RULES[eintrag.kind].name,
			unit: LAW_RULES[eintrag.kind].unit,
			year: yearOf(eintrag.enactedTick)
		}))
	};
}

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
