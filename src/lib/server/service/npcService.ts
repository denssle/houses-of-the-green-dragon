import { garmentIntact } from '$lib/game/attire.logic';
import { CAMPAIGN_TICKS, npcChoice } from '$lib/game/election.logic';
import { Op } from 'sequelize';
import { Employment } from '$lib/db/model/employment';
import { positionsAt } from '$lib/game/employment.logic';
import { levelOf } from '$lib/model/buildingTemplate';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import {
	decideCaretakerAction,
	decideNpcAction,
	isUnattended,
	type NpcAction,
	type NpcState,
	REPAIR_BELOW
} from '$lib/game/npc.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';
import {
	CONDITION_MAX,
	materialFor,
	RENOVATION_COST_PER_POINT,
	renovationMaterial,
	residentsAt
} from '$lib/game/building.logic';
import { PLOT_PRICE, TAGELOHN } from '$lib/game/economy';
import { LEASE_FEE } from '$lib/server/service/productionService';
import { AGE_OF_MAJORITY, ageInYears } from '$lib/game/time';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as familyService from '$lib/server/service/familyService';
import * as plotService from '$lib/server/service/plotService';
import * as productionService from '$lib/server/service/productionService';
import * as needService from '$lib/server/service/needService';
import * as relationshipService from '$lib/server/service/relationshipService';
import * as tradeService from '$lib/server/service/tradeService';
import * as electionService from '$lib/server/service/electionService';
import * as employmentService from '$lib/server/service/employmentService';
import { isWorthTaking } from '$lib/game/employment.logic';

/**
 * NPCs handeln.
 *
 * **Sie kommen so oft zum Zug wie Spielercharaktere** — dasselbe Aktionsbudget, dieselben
 * Kosten, dieselben Regeln. Deshalb braucht es hier keine eigene Taktung: Wer nichts mehr
 * hat, tut nichts mehr, und ein Punkt je Tick ist die natürliche Bremse. Ein zweiter Satz
 * Regeln für die Simulation würde von dem der Spieler abdriften, und dann wüsste niemand
 * mehr, ob eine Beobachtung an der Welt liegt oder an zwei verschiedenen Rechnungen.
 *
 * Der Durchlauf ist die teuerste Schleife im Spiel — eine Entscheidung je NPC und
 * Herzschlag. Bei einer Stadt ist das nichts; bei zehn Städten mit tausend Einwohnern
 * gehört er gestaffelt oder auf einen eigenen Prozess. Der Punkt, an dem es weh tut,
 * liegt bei einigen tausend Einwohnern, und bis dahin ist die Einfachheit mehr wert.
 */

/** Was ein Durchlauf bewirkt hat — fürs Log und die Tests. */
export interface NpcTick {
	acted: number;
	byAction: Partial<Record<NpcAction, number>>;
}

export async function actForNpcs(tick: number): Promise<NpcTick> {
	const npcs = await Character.findAll({
		where: { deathTick: null, role: 'NPC' }
	});

	const gezaehlt: Partial<Record<NpcAction, number>> = {};
	let gehandelt = 0;

	for (const npc of npcs) {
		const handlung: NpcAction = await ausfuehren(npc.dataValues.id, tick);
		gezaehlt[handlung] = (gezaehlt[handlung] ?? 0) + 1;
		if (handlung !== 'IDLE') gehandelt++;
	}

	// **Und die Charaktere, die gerade niemand spielt** (5.5). Sie laufen durch dieselbe
	// Schleife, nur mit engeren Befugnissen — ein zweiter Durchlauf mit eigener Taktung
	// wäre dieselbe Arbeit an zwei Stellen.
	const verwaist = await Character.findAll({
		where: { deathTick: null, role: 'PLAYER' }
	});

	for (const charakter of verwaist) {
		if (!isUnattended(charakter.dataValues.lastSeenTick, tick)) continue;

		const handlung: NpcAction = await ausfuehren(charakter.dataValues.id, tick, true);
		gezaehlt[handlung] = (gezaehlt[handlung] ?? 0) + 1;
		if (handlung !== 'IDLE') gehandelt++;
	}

	return { acted: gehandelt, byAction: gezaehlt };
}

/**
 * Einen Charakter entscheiden und handeln lassen.
 *
 * `verwaltet` schaltet auf die engeren Befugnisse um: Ein Spielercharakter, den gerade
 * niemand führt, wird erhalten und nicht gelenkt.
 */
async function ausfuehren(
	npcId: string,
	tick: number,
	verwaltet: boolean = false
): Promise<NpcAction> {
	const lage = await lageAufnehmen(npcId, tick);
	if (!lage) return 'IDLE';

	const handlung: NpcAction = verwaltet
		? decideCaretakerAction(lage.state)
		: decideNpcAction(lage.state);

	switch (handlung) {
		case 'EAT':
			await needService.eatItem(npcId, 'BREAD');
			return 'EAT';

		case 'BUY_FOOD': {
			// **Zuerst beim Nachbarn.** Das billigste Angebot in der Stadt geht dem
			// Kornspeicher vor — sonst bliebe die Krücke aus 4.6a für immer die einzige
			// Quelle, und ein Bäcker fände nie einen Kunden.
			//
			// Die Menge muss dabei **am Preis des Angebots** hängen und nicht am
			// Kornspeicherpreis: Sonst versucht ein NPC mit zwanzig Münzen fünf Laibe zu
			// sechs zu kaufen, scheitert am Geld und landet doch wieder beim Amt. Genau
			// so ist es beim ersten Durchlauf passiert.
			const angebot = lage.cheapestBread;
			if (angebot && angebot.quantity > 0 && angebot.pricePerUnit > 0) {
				const bezahlbar: number = Math.floor(lage.money / angebot.pricePerUnit);
				const wieviel: number = Math.min(5, angebot.quantity, bezahlbar);
				if (wieviel > 0) {
					const gekauft = await tradeService.buyFromOffer(npcId, angebot.id, wieviel);
					if (gekauft.ok) return 'BUY_FOOD';
				}
			}
			await needService.buyFromGranary(npcId, 'BREAD', Math.max(1, Math.min(5, lage.leisten)));
			return 'BUY_FOOD';
		}

		case 'TAKE_JOB':
			if (lage.jobId) await employmentService.takeJob(npcId, lage.jobId);
			return 'TAKE_JOB';

		case 'WORK':
			// Wer eine Stelle hat, arbeitet dort — der Ertrag geht in den Betrieb, der Lohn
			// an ihn. Nur wer keine hat, verdingt sich tageweise.
			if (lage.state.hasJob) {
				await employmentService.workForEmployer(npcId);
			} else if (lage.workplaceId) {
				await buildingActionService.doBuildingAction('WORK', npcId, lage.workplaceId);
			}
			return 'WORK';

		case 'MOVE_IN':
			if (lage.homeId) {
				await Character.update({ HomeBuildingId: lage.homeId }, { where: { id: npcId } });
				// Wo jemand ein Dach fand, gehört in seinen Lebenslauf — für den
				// Obdachlosen, der endlich unterkommt, ist es der wichtigere Tag als
				// mancher, der schon drinsteht.
				await chronicleService.recordMoveIn(npcId, lage.homeId, tick);
			}
			return 'MOVE_IN';

		case 'COURT':
			if (lage.matchId) {
				await familyService.courtSomeone(npcId, lage.matchId);
				// Und wenn die Zuneigung reicht, wird auch geheiratet. Der Antrag prüft das
				// selbst — ein Fehlschlag ist hier kein Fehler, sondern ein „noch nicht".
				await familyService.propose(npcId, lage.matchId);
			}
			return 'COURT';

		case 'WEAR_GARMENT':
			await needService.wearGarment(npcId);
			return 'WEAR_GARMENT';

		case 'DRINK_TONIC':
			await needService.drinkTonic(npcId);
			return 'DRINK_TONIC';

		case 'BUY_GARMENT': {
			// Genau eines: Ein zweites Gewand im Schrank nützt niemandem, solange nur eines
			// getragen werden kann.
			const angebot = lage.cheapestGarment;
			if (angebot) await tradeService.buyFromOffer(npcId, angebot.id, 1);
			return 'BUY_GARMENT';
		}

		case 'BUY_TONIC': {
			const angebot = lage.cheapestTonic;
			if (angebot) await tradeService.buyFromOffer(npcId, angebot.id, 1);
			return 'BUY_TONIC';
		}

		case 'SELL': {
			// **Zum Grundpreis, nicht darunter und nicht darüber.** Ein NPC, der Preise
			// aushandelt, wäre ein eigenes System; der Katalogpreis ist der Anker, den es
			// ohnehin gibt, und er lässt Spielern Raum, ihn zu unterbieten.
			const ware = lage.sellable;
			if (ware && lage.workshopId) {
				// Erst ins Lager, dann ans Schild: Im eigenen Laden verkauft man aus dem
				// Betrieb, nicht aus der Tasche.
				if (ware.inChamber > 0) {
					// Dieselbe Tür wie beim Spieler, der auf 'Einlagern' klickt.
					await tradeService.moveToStock(npcId, lage.workshopId, ware.itemId, ware.inChamber);
				}
				const preis: number = getItemTemplate(ware.itemId)?.basePrice ?? 1;
				await tradeService.placeOffer(npcId, lage.workshopId, ware.itemId, ware.quantity, preis);
			}
			return 'SELL';
		}

		case 'CRAFT':
			if (lage.workshopId) await productionService.craft(npcId, lage.workshopId);
			return 'CRAFT';

		case 'HARVEST':
			if (lage.leaseId) await productionService.harvest(npcId, lage.leaseId);
			return 'HARVEST';

		case 'LEASE':
			if (lage.leasableId) await productionService.leasePlot(npcId, lage.leasableId);
			return 'LEASE';

		case 'BUILD': {
			const vorlage =
				lage.workshopOptionId !== undefined
					? buildingService.getBuildingOption(lage.workshopOptionId)
					: undefined;
			if (vorlage && lage.freePlotId) {
				await buildingService.build(vorlage, npcId, lage.freePlotId);
			}
			return 'BUILD';
		}

		case 'BUY_PLOT': {
			// Das erste freie Stück in der Stadt. Eine Wahl nach Lage gäbe es erst, wenn
			// Lage etwas bedeutete — heute sind alle Grundstücke gleich.
			const frei = await plotService.getFreeBuildingLand(lage.regionId);
			if (frei[0]) await plotService.buyPlot(frei[0].id, npcId);
			return 'BUY_PLOT';
		}

		case 'BUY_MATERIAL': {
			// So viel, wie fehlt — begrenzt durch das Angebot und den Beutel. Wer Stück für
			// Stück kaufte, stünde vier Ticks lang auf einem leeren Bauplatz.
			const angebot = lage.missingMaterialOffer;
			if (angebot) {
				const bezahlbar: number = Math.floor(lage.money / angebot.pricePerUnit);
				const wieviel: number = Math.min(lage.missingMaterialCount, angebot.quantity, bezahlbar);
				if (wieviel > 0) await tradeService.buyFromOffer(npcId, angebot.id, wieviel);
			}
			return 'BUY_MATERIAL';
		}

		case 'BUILD_HOME': {
			const vorlage = buildingService.getBuildingOption(WOHNHAUS_OPTION_ID);
			if (vorlage && lage.freePlotId) await buildingService.build(vorlage, npcId, lage.freePlotId);
			return 'BUILD_HOME';
		}

		case 'RENOVATE':
			if (lage.repairId) await buildingService.renovateBuilding(npcId, lage.repairId);
			return 'RENOVATE';

		case 'OFFER_JOB':
			// Zum Lohn der Tagelöhnerei: Wer weniger böte, fände niemanden — mehr zu bieten
			// wäre großzügig auf Kosten des eigenen Ertrags.
			if (lage.workshopId) await employmentService.offerJob(npcId, lage.workshopId, TAGELOHN);
			return 'OFFER_JOB';

		case 'VOTE': {
			// Gewählt wird nach Zuneigung — es gibt kein eigenes Wahlkampfsystem, und das
			// ist der Punkt: Wer über Jahre Beziehungen gepflegt hat, hat Stimmen.
			const zettel = lage.ballot;
			if (zettel) {
				const zuneigungen = [];
				for (const kandidat of zettel.candidates) {
					const stand = await relationshipService.getAffection(npcId, kandidat.id, tick);
					zuneigungen.push({ candidateId: kandidat.id, affection: stand.affection });
				}
				const gewaehlt: string | undefined = npcChoice(npcId, zuneigungen);
				if (gewaehlt) await electionService.vote(npcId, lage.regionId, gewaehlt);
			}
			return 'VOTE';
		}

		case 'IDLE':
			return 'IDLE';
	}
}

/** Alles, was die Entscheidung braucht — und die Ziele, die sie voraussetzt. */
async function lageAufnehmen(
	npcId: string,
	tick: number
): Promise<
	| {
			state: NpcState;
			workplaceId?: string;
			homeId?: string;
			matchId?: string;
			jobId?: string;
			leisten: number;
			money: number;
			regionId: string;
			cheapestBread?: { id: string; quantity: number; pricePerUnit: number };
			cheapestGarment?: { id: string; quantity: number; pricePerUnit: number };
			cheapestTonic?: { id: string; quantity: number; pricePerUnit: number };
			workshopId?: string;
			workshopOptionId?: number;
			freePlotId?: string;
			leaseId?: string;
			leasableId?: string;
			sellable?: { itemId: string; quantity: number; inChamber: number };
			ballot?: Awaited<ReturnType<typeof electionService.getBallot>>;
			repairId?: string;
			missingMaterialOffer?: { id: string; quantity: number; pricePerUnit: number };
			missingMaterialCount: number;
	  }
	| undefined
> {
	// **Erst nachwachsen lassen, dann entscheiden.** Der gespeicherte Punktestand ist der
	// von der letzten Handlung; ein NPC, der seit Stunden nichts getan hat, stünde darin
	// bei null und käme nie wieder zum Zug. `getCharacter` schreibt den Zuwachs fort,
	// genau wie beim Aufruf einer Spielerseite — und das ist der Punkt: dieselbe Tür.
	const geladen = await characterService.getCharacter(npcId);
	const npc = geladen ? await Character.findByPk(npcId) : null;
	if (!npc) return undefined;

	const werte = npc.dataValues;
	const brot = getItemTemplate('BREAD')!;

	const vorrat = await needService.getStock(npcId);
	const essbar: number = vorrat
		.filter((posten) => posten.nourishment)
		.reduce((summe, posten) => summe + posten.quantity, 0);

	// Was der Markt hergibt: Ohne Angebot kein Kauf — und ohne Kauf keine Nachfrage für
	// die Betriebe aus 4.10 und 4.11.
	const gewand = await tradeService.cheapestOffer(werte.RegionId, 'GARMENT', npcId);
	const trank = await tradeService.cheapestOffer(werte.RegionId, 'TONIC', npcId);

	// Was er selbst besitzt und betreibt (4.13).
	const eigene = await buildingService.getBuildingsOfCharacter(npcId);
	const werkstatt = eigene.find(
		(haus) => buildingService.getBuildingOption(haus.optionId)?.type === 'CRAFT'
	);
	const grundstuecke = await plotService.getPlotsOfCharacter(npcId);
	const flaechen = await productionService.getAreas(npcId);
	const eigenePacht = flaechen.find((flaeche) => flaeche.leasedByMe);
	const freieFlaeche = flaechen.find((flaeche) => !flaeche.leased && flaeche.resourceType);
	const zuVerkaufen = werkstatt ? await unverkauftes(npcId, werkstatt) : undefined;
	const werkstattLuecke = werkstatt ? undefined : await fehlendeWerkstatt(werte.RegionId);

	// Ein eigenes Dach und was daran hängt (4.14).
	const wohnhaus = eigene.find(
		(haus) => buildingService.getBuildingOption(haus.optionId)?.type === 'RESIDENCE'
	);
	const platz: number | null = await buildingService.freierWohnraum(werte.HomeBuildingId);
	const hausVorlage = buildingService.getBuildingOption(WOHNHAUS_OPTION_ID);
	const baufaellig = eigene.filter((haus) => haus.condition < REPAIR_BELOW)[0];
	const materialBedarf = baufaellig
		? renovationMaterial(Math.ceil(CONDITION_MAX - baufaellig.condition))
		: hausVorlage
			? materialFor(levelOf(hausVorlage, 1).price, hausVorlage.type)
			: [];

	// Was die nächste Werkstatt an Material verlangt — sonst versucht er es in jedem Tick
	// aufs Neue.
	const werkstattVorlage =
		werkstattLuecke !== undefined
			? buildingService.getBuildingOption(werkstattLuecke.optionId)
			: undefined;
	const werkstattMaterial = werkstattVorlage?.recipes?.some((rezept) =>
		['PLANK', 'BLOCK', 'IRON'].includes(rezept.outputItemId)
	)
		? []
		: werkstattVorlage
			? materialFor(levelOf(werkstattVorlage, 1).price, werkstattVorlage.type)
			: [];
	const fehltMaterial = await fehlendesMaterial(npcId, materialBedarf);
	const material = fehltMaterial
		? await tradeService.cheapestOffer(werte.RegionId, fehltMaterial.itemId, npcId)
		: undefined;
	const stelleFrei = werkstatt ? await freieStelleImEigenen(werkstatt) : false;

	// Läuft eine Wahl, bei der er noch nicht abgestimmt hat? (4.16)
	const wahlzettel = await electionService.getBallot(werte.RegionId, npcId);
	const wahlLaeuft: boolean =
		wahlzettel !== undefined && !wahlzettel.iVoted && wahlzettel.candidates.length > 0;

	const arbeitsplatz = await freierArbeitsplatz(werte.RegionId);
	const stelle = await employmentService.getJobOf(npcId);
	// Wer schon eine Stelle hat, sieht sich nicht um — ein NPC, der jede Stunde den
	// Arbeitgeber wechselt, wäre kein Handwerker, sondern ein Flattermann.
	const offen = stelle ? [] : await employmentService.getOpenJobs(werte.RegionId, npcId);
	const besser = offen.filter((angebot) => isWorthTaking(angebot.wage, TAGELOHN))[0];
	const unterkunft = werte.HomeBuildingId ? undefined : await freierWohnplatz(werte.RegionId);
	const partner = werte.spouseId ? undefined : await naechsterPartner(npc.dataValues, tick);

	return {
		leisten: Math.floor(werte.money / brot.basePrice),
		money: werte.money,
		regionId: werte.RegionId,
		cheapestBread: await tradeService.cheapestOffer(werte.RegionId, 'BREAD', npcId),
		workplaceId: arbeitsplatz,
		homeId: unterkunft,
		matchId: partner,
		jobId: besser?.buildingId,
		state: {
			personality: {
				courage: werte.courage,
				diligence: werte.diligence,
				greed: werte.greed,
				sociability: werte.sociability,
				ambition: werte.ambition,
				agreeableness: werte.agreeableness
			},
			actionPoints: werte.actionPoints,
			money: werte.money,
			satiety: needService.satietyOf(werte, tick),
			food: essbar,
			hasHome: werte.HomeBuildingId !== null,
			homeAvailable: unterkunft !== undefined,
			isMarried: werte.spouseId !== null,
			isAdult: ageInYears(werte.birthTick, tick) >= AGE_OF_MAJORITY,
			workAvailable: arbeitsplatz !== undefined || stelle !== undefined,
			hasJob: stelle !== undefined,
			betterJobAvailable: besser !== undefined,
			matchAvailable: partner !== undefined,
			foodPrice: brot.basePrice,
			// Was über das Nötigste hinausgeht (4.12). Ohne diese fünf Angaben kauft ein
			// NPC ausschließlich Nahrung, und jeder Beruf außer dem Bäcker bliebe ohne
			// Kundschaft.
			wearsGarment: garmentIntact(werte.wornSinceTick, tick),
			garmentInStock: menge(vorrat, 'GARMENT'),
			tonicInStock: menge(vorrat, 'TONIC'),
			garmentPrice: gewand?.pricePerUnit ?? null,
			tonicPrice: trank?.pricePerUnit ?? null,
			// Die fünfte Stufe (4.13).
			ownsWorkshop: werkstatt !== undefined,
			hasFreePlot: grundstuecke.some((flaeche) => !flaeche.hasBuilding),
			hasLease: eigenePacht !== undefined,
			leaseAvailable: freieFlaeche !== undefined,
			ownStockToSell: zuVerkaufen?.quantity ?? 0,
			canCraft: werkstatt ? await kannHerstellen(npcId, werkstatt) : false,
			plotPrice: PLOT_PRICE,
			workshopPrice: werkstattLuecke?.price ?? null,
			workshopMaterialMissing: (await fehlendesMaterial(npcId, werkstattMaterial)) !== undefined,
			leaseFee: LEASE_FEE,
			// Ein eigenes Dach (4.14).
			homeHasRoom: (platz ?? 0) > 0,
			ownsHome: wohnhaus !== undefined,
			homePrice: hausVorlage ? levelOf(hausVorlage, 1).price : null,
			materialMissing: fehltMaterial !== undefined,
			materialPrice: material?.pricePerUnit ?? null,
			repairNeeded: baufaellig !== undefined,
			repairCost:
				Math.ceil(CONDITION_MAX - (baufaellig?.condition ?? CONDITION_MAX)) *
				RENOVATION_COST_PER_POINT,
			canOfferJob: stelleFrei,
			// Teilhabe (4.16). Der Fortschritt ist ein Anteil, damit `votingDelay` ihn
			// unabhängig von der Wahlkampfdauer vergleichen kann.
			canVote: wahlLaeuft && ageInYears(werte.birthTick, tick) >= AGE_OF_MAJORITY,
			campaignProgress: wahlzettel
				? Math.min(1, Math.max(0, 1 - (wahlzettel.closesTick - tick) / CAMPAIGN_TICKS))
				: 0
		},
		ballot: wahlzettel,
		repairId: baufaellig?.id,
		missingMaterialOffer: material,
		missingMaterialCount: fehltMaterial?.quantity ?? 0,
		workshopId: werkstatt?.id,
		workshopOptionId: werkstattLuecke?.optionId,
		freePlotId: grundstuecke.find((flaeche) => !flaeche.hasBuilding)?.id,
		leaseId: eigenePacht?.plotId,
		leasableId: freieFlaeche?.plotId,
		sellable: zuVerkaufen,
		cheapestGarment: gewand,
		cheapestTonic: trank
	};
}

/**
 * Wo man in dieser Stadt arbeiten kann.
 *
 * Genommen wird der erstbeste Betrieb — eine Wahl nach Lohn und Können wäre besser und
 * gehört zu 4.6d, wo es Anstellungsverhältnisse gibt. Bis dahin arbeitet man tageweise
 * dort, wo man gerade steht, und das gilt für NPCs wie für Spieler.
 */
async function freierArbeitsplatz(regionId: string): Promise<string | undefined> {
	for (const gebäude of await buildingService.getBuildingsInRegion(regionId)) {
		const vorlage = buildingService.getBuildingOption(gebäude.optionId);
		if (vorlage?.actions.includes('WORK')) return gebäude.id;
	}
	return undefined;
}

/** Ein Wohngebäude mit freiem Platz — die eigene Kate oder die städtische Unterkunft. */
async function freierWohnplatz(regionId: string): Promise<string | undefined> {
	const gebäude = await Building.findAll({
		include: [{ model: Plot, as: 'plot', where: { RegionId: regionId }, required: true }]
	});

	for (const eintrag of gebäude) {
		const vorlage = buildingService.getBuildingOption(eintrag.dataValues.optionId);
		if (!vorlage || residentsAt(vorlage, eintrag.dataValues.level) === 0) continue;
		// Nur was der Allgemeinheit gehört: In ein fremdes Privathaus zieht niemand
		// ungefragt ein. Miete und Untermiete kommen mit 4.6d.
		if (eintrag.dataValues.ownerType !== 'CITY') continue;

		const platz: number | null = await buildingService.freierWohnraum(eintrag.dataValues.id);
		if (platz !== null && platz > 0) return eintrag.dataValues.id;
	}
	return undefined;
}

/**
 * Wen ein NPC umwirbt.
 *
 * Der, der ihn am meisten mag — und nicht der, den er am meisten mag: Wer heiratet, muss
 * gewollt sein. Dieselbe Richtung wie bei der Eheprüfung in 4.4.
 */
async function naechsterPartner(
	werte: { id: string; gender: string; RegionId: string; birthTick: number },
	tick: number
): Promise<string | undefined> {
	const kandidaten = await Character.findAll({
		where: {
			deathTick: null,
			RegionId: werte.RegionId,
			spouseId: null,
			gender: { [Op.ne]: werte.gender },
			id: { [Op.ne]: werte.id },
			birthTick: { [Op.lte]: tick - AGE_OF_MAJORITY * 50 }
		}
	});

	let bester: string | undefined;
	let höchste = -Infinity;
	for (const kandidat of kandidaten) {
		const stand = await relationshipService.getAffection(kandidat.dataValues.id, werte.id, tick);
		// Verwandte scheiden aus, bevor überhaupt geworben wird — sonst verbrauchte ein
		// NPC seine Punkte an einer Ehe, die die Prüfung ohnehin abweist.
		if (stand.kinship !== 'NONE') continue;

		if (stand.affection > höchste) {
			höchste = stand.affection;
			bester = kandidat.dataValues.id;
		}
	}
	return bester;
}

/** Wie viel von einer Ware im Vorrat liegt. */
function menge(vorrat: { itemId: string; quantity: number }[], itemId: string): number {
	return vorrat.find((posten) => posten.itemId === itemId)?.quantity ?? 0;
}

// --- Die fünfte Stufe: etwas Eigenes (4.13) -------------------------------------------

/**
 * Welche Werkstatt in dieser Stadt fehlt — und was sie kostet.
 *
 * **Gebaut wird, was es noch nicht gibt.** Ein NPC, der die vierte Bäckerei danebenstellt,
 * ruiniert sich und den Markt; einer, der die erste Zimmerei baut, versorgt eine Stadt,
 * die auf Bretter wartet. Damit ergibt sich die Vielfalt der Berufe von selbst, ohne dass
 * jemand eine Quote pflegen müsste.
 *
 * Der Reihe nach durchgegangen wird der Katalog, wie er im Code steht — die günstigste
 * fehlende gewinnt, denn wer wenig hat, fängt klein an.
 */
export async function fehlendeWerkstatt(
	regionId: string
): Promise<{ optionId: number; price: number } | undefined> {
	const vorhanden = await buildingService.getBuildingsInRegion(regionId);

	const kandidaten = buildingService
		.getBuildingOptions()
		.filter((vorlage) => vorlage.type === 'CRAFT')
		.filter((vorlage) => !vorhanden.some((haus) => haus.optionId === vorlage.optionId))
		.map((vorlage) => ({ optionId: vorlage.optionId, price: levelOf(vorlage, 1).price }))
		.sort((a, b) => a.price - b.price);

	return kandidaten[0];
}

/**
 * Was er verkaufen könnte — aus dem Betriebslager **und aus der eigenen Kammer**.
 *
 * Die Kammer muss mitzählen, weil `craft` das Erzeugnis dorthin legt: Wer selbst an der
 * Werkbank steht, trägt es nach Hause. Zum Verkauf im eigenen Laden muss es aber im Lager
 * liegen — deshalb wandert es beim Aushängen zuerst dorthin. Ohne diesen Umweg stellte
 * ein NPC her und her, und nichts käme je an ein Preisschild; genau das zeigte der
 * Selbsterhaltungstest.
 */
async function unverkauftes(
	characterId: string,
	werkstatt: { id: string; optionId: number }
): Promise<{ itemId: string; quantity: number; inChamber: number } | undefined> {
	const erzeugnisse: string[] = (
		buildingService.getBuildingOption(werkstatt.optionId)?.recipes ?? []
	).map((rezept) => rezept.outputItemId);
	if (erzeugnisse.length === 0) return undefined;

	const angebote = await tradeService.getOffersAt(werkstatt.id, characterId);
	const lager = await tradeService.getBuildingStock(werkstatt.id);
	const kammer = await needService.getStock(characterId);

	for (const itemId of erzeugnisse) {
		if (angebote.some((angebot) => angebot.itemId === itemId)) continue;

		const imLager: number = lager.find((posten) => posten.itemId === itemId)?.quantity ?? 0;
		const inDerKammer: number = kammer.find((posten) => posten.itemId === itemId)?.quantity ?? 0;
		if (imLager + inDerKammer > 0) {
			return { itemId, quantity: imLager + inDerKammer, inChamber: inDerKammer };
		}
	}
	return undefined;
}

/**
 * Reichen die Zutaten für einen Durchgang?
 *
 * Gezählt wird beides — Betriebslager und eigene Kammer —, weil `craft` seit 4.10 auch
 * beides verbraucht. Ein NPC, der sein Holz eingelagert hat und dann nicht sägen dürfte,
 * stünde vor demselben Rätsel wie ein Spieler vor der Umstellung.
 */
async function kannHerstellen(
	characterId: string,
	werkstatt: { id: string; optionId: number }
): Promise<boolean> {
	const rezepte = buildingService.getBuildingOption(werkstatt.optionId)?.recipes ?? [];
	if (rezepte.length === 0) return false;

	const vorrat = new Map<string, number>();
	for (const posten of await tradeService.getBuildingStock(werkstatt.id)) {
		vorrat.set(posten.itemId, posten.quantity);
	}
	for (const posten of await needService.getStock(characterId)) {
		vorrat.set(posten.itemId, (vorrat.get(posten.itemId) ?? 0) + posten.quantity);
	}

	return rezepte.some((rezept) =>
		rezept.input.every((zutat) => (vorrat.get(zutat.itemId) ?? 0) >= zutat.quantity)
	);
}

/**
 * Die Vorlage, aus der ein NPC sein Zuhause baut.
 *
 * Die kleinste Stufe des Wohnhauses — eine Kate mit vier Plätzen. Wer mehr Kinder will,
 * baut später aus; das kann heute noch niemand, und es steht als Punkt 30 auf der Liste.
 */
const WOHNHAUS_OPTION_ID = 1;

/**
 * Was an Baumaterial fehlt — die erste Ware, an der es hakt, **mit der Fehlmenge**.
 *
 * Die Menge muss mit: Ein NPC, der Stück für Stück kauft, braucht vier Ticks für vier
 * Bretter und steht so lange auf einem leeren Bauplatz. Wer bauen will, kauft, was fehlt.
 */
async function fehlendesMaterial(
	characterId: string,
	bedarf: { itemId: string; quantity: number }[]
): Promise<{ itemId: string; quantity: number } | undefined> {
	if (bedarf.length === 0) return undefined;

	const vorrat = new Map<string, number>();
	for (const posten of await needService.getStock(characterId)) {
		vorrat.set(posten.itemId, posten.quantity);
	}

	for (const posten of bedarf) {
		const da: number = vorrat.get(posten.itemId) ?? 0;
		if (da < posten.quantity) return { itemId: posten.itemId, quantity: posten.quantity - da };
	}
	return undefined;
}

/**
 * Hat der eigene Betrieb eine Stelle frei, für die noch kein Lohn aushängt?
 *
 * Beides muss stimmen: Ein Aushang ohne freie Stelle lockt niemanden, eine freie Stelle
 * ohne Aushang findet keinen.
 */
async function freieStelleImEigenen(werkstatt: {
	id: string;
	optionId: number;
	level: number;
	offeredWage: number | null;
}): Promise<boolean> {
	if (werkstatt.offeredWage !== null) return false;

	const vorlage = buildingService.getBuildingOption(werkstatt.optionId);
	if (!vorlage) return false;

	const belegt: number = await Employment.count({ where: { BuildingId: werkstatt.id } });
	return positionsAt(vorlage, werkstatt.level) - belegt > 0;
}
