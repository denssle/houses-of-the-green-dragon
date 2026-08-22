import { garmentIntact } from '$lib/game/attire.logic';
import { CAMPAIGN_TICKS, npcChoice } from '$lib/game/election.logic';
import { Op } from 'sequelize';
import { levelOf, upgradePrice } from '$lib/model/buildingTemplate';
import { Building } from '$lib/db/model/building';
import type { Building as Haus } from '$lib/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import {
	decideCaretakerAction,
	decideNpcAction,
	type IdleReason,
	idleReason,
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
import {
	AGE_OF_MAJORITY,
	ageInYears,
	buildingCostFactor,
	type Season,
	seasonOf,
	yearsToTicks
} from '$lib/game/time';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as familyService from '$lib/server/service/familyService';
import * as plotService from '$lib/server/service/plotService';
import * as productionService from '$lib/server/service/productionService';
import * as needService from '$lib/server/service/needService';
import * as relationshipService from '$lib/server/service/relationshipService';
import * as tradeService from '$lib/server/service/tradeService';
import * as electionService from '$lib/server/service/electionService';
import * as employmentService from '$lib/server/service/employmentService';
import * as lawService from '$lib/server/service/lawService';
import * as skillService from '$lib/server/service/skillService';
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

/**
 * Wie viele Mahlzeiten einer zurückbehält, bevor er Essbares anbietet.
 *
 * Fünf Laibe — dieselbe Menge, die er bei `BUY_FOOD` auf einmal kauft, und knapp eine
 * Woche Vorrat. Wer weniger behielte, verkaufte sich in den Hunger; wer mehr behielte,
 * hielte den Markt leer, an dem die anderen essen wollen.
 */
const EIGENER_VORRAT = 5;

/**
 * Was ein Durchlauf bewirkt hat — fürs Log, die Tests und vor allem fürs **Messen**.
 *
 * **`byAction` allein hat wiederholt in die Irre geführt.** Es zählt gewählte Handlungen,
 * nicht gelungene: `BUY_PLOT: 466` in einem Messlauf waren 466 Versuche und fünf Käufe —
 * aufgefallen ist das nur, weil die Zahl absurd aussah. Und `IDLE`, die häufigste
 * Handlung überhaupt, sagte gar nichts.
 *
 * Deshalb zwei weitere Zählungen: **woran Handlungen scheitern** und **warum jemand nichts
 * tut**. Beides bleibt im Speicher und wird nirgends gespeichert — die Schleife ist
 * ohnehin die teuerste des Spiels (Punkt 67), und ein Diagnoseschreiben je Entscheidung
 * machte sie unbrauchbar.
 */
export interface NpcTick {
	acted: number;
	byAction: Partial<Record<NpcAction, number>>;
	/** Was schiefging, je Handlung und Grund — `WORK/EMPLOYER_BROKE` etwa. */
	byFailure: Record<string, number>;
	/** Warum die Untätigen untätig waren. */
	byIdleReason: Partial<Record<IdleReason, number>>;
}

export async function actForNpcs(tick: number): Promise<NpcTick> {
	const npcs = await Character.findAll({
		where: { deathTick: null, role: 'NPC' }
	});

	const gezaehlt: Partial<Record<NpcAction, number>> = {};
	const gescheitert: Record<string, number> = {};
	const gruende: Partial<Record<IdleReason, number>> = {};
	let gehandelt = 0;

	const buchen = (ergebnis: Ausgang): void => {
		gezaehlt[ergebnis.action] = (gezaehlt[ergebnis.action] ?? 0) + 1;
		if (ergebnis.action !== 'IDLE') gehandelt++;
		if (ergebnis.failure) {
			const schluessel = `${ergebnis.action}/${ergebnis.failure}`;
			gescheitert[schluessel] = (gescheitert[schluessel] ?? 0) + 1;
		}
		if (ergebnis.idleReason) {
			gruende[ergebnis.idleReason] = (gruende[ergebnis.idleReason] ?? 0) + 1;
		}
	};

	for (const npc of npcs) {
		buchen(await ausfuehren(npc.dataValues.id, tick));
	}

	// **Und die Charaktere, die gerade niemand spielt** (5.5). Sie laufen durch dieselbe
	// Schleife, nur mit engeren Befugnissen — ein zweiter Durchlauf mit eigener Taktung
	// wäre dieselbe Arbeit an zwei Stellen.
	const verwaist = await Character.findAll({
		where: { deathTick: null, role: 'PLAYER' }
	});

	for (const charakter of verwaist) {
		if (!isUnattended(charakter.dataValues.lastSeenTick, tick)) continue;
		buchen(await ausfuehren(charakter.dataValues.id, tick, true));
	}

	return {
		acted: gehandelt,
		byAction: gezaehlt,
		byFailure: gescheitert,
		byIdleReason: gruende
	};
}

/** Was eine einzelne Entscheidung ergeben hat. */
interface Ausgang {
	action: NpcAction;
	/** Der Grund, an dem die Handlung scheiterte — nichts heißt: sie ging durch. */
	failure?: string;
	idleReason?: IdleReason;
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
): Promise<Ausgang> {
	const lage = await lageAufnehmen(npcId, tick);
	// Kein Charakter mehr da (tot, gelöscht) — kein Grund, das als Müßiggang zu deuten.
	if (!lage) return { action: 'IDLE' };

	const handlung: NpcAction = verwaltet
		? decideCaretakerAction(lage.state)
		: decideNpcAction(lage.state);

	/**
	 * Was ein Dienst zurückgab, als Fehlschlag gebucht.
	 *
	 * **Die Dienste liefern alle dieselbe Form** (`{ ok: false, reason }`), und bis 5.21
	 * warf `ausfuehren` sie samt und sonders weg. Deshalb sah ein Fehlversuch in der
	 * Statistik aus wie eine getane Arbeit: `BUY_PLOT: 466` waren fünf Käufe und 461
	 * vergebliche Anläufe.
	 *
	 * `undefined` heißt: gar nicht erst versucht — auch das ist ein Fehlschlag, nur einer
	 * ohne Grund vom Dienst. Er heißt dann `NOT_ATTEMPTED`, denn eine Handlung, die
	 * gewählt, aber nicht ausgeführt wurde, ist der stillste Fehler von allen.
	 */
	const buch = (action: NpcAction, ergebnis?: { ok: boolean; reason?: string }): Ausgang => {
		if (ergebnis === undefined) return { action, failure: 'NOT_ATTEMPTED' };
		return ergebnis.ok ? { action } : { action, failure: ergebnis.reason ?? 'UNKNOWN' };
	};

	switch (handlung) {
		case 'EAT':
			return buch('EAT', await needService.eatItem(npcId, 'BREAD'));

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
					if (gekauft.ok) return { action: 'BUY_FOOD' };
				}
			}
			return buch(
				'BUY_FOOD',
				await needService.buyFromGranary(npcId, 'BREAD', Math.max(1, Math.min(5, lage.leisten)))
			);
		}

		case 'TAKE_JOB':
			return buch(
				'TAKE_JOB',
				lage.jobId ? await employmentService.takeJob(npcId, lage.jobId) : undefined
			);

		case 'WORK':
			// Wer eine Stelle hat, arbeitet dort — der Ertrag geht in den Betrieb, der Lohn
			// an ihn. Nur wer keine hat, verdingt sich tageweise.
			if (lage.state.hasJob) {
				return buch('WORK', await employmentService.workForEmployer(npcId));
			}
			return buch(
				'WORK',
				lage.workplaceId
					? await buildingActionService.doBuildingAction('REPAIR_FOR_HIRE', npcId, lage.workplaceId)
					: undefined
			);

		case 'MOVE_IN':
			// Derselbe Weg, den seit 5.6 auch ein Spieler nimmt — samt Prüfung und
			// Chronikeintrag. Zwei Fassungen desselben Einzugs waren eine zu viel: Die
			// eine kannte das eigene Haus nicht, die andere schon.
			return buch(
				'MOVE_IN',
				lage.homeId ? await buildingService.moveInto(npcId, lage.homeId) : undefined
			);

		case 'COURT': {
			if (!lage.matchId) return buch('COURT', undefined);

			const geworben = await familyService.courtSomeone(npcId, lage.matchId);
			// Und wenn die Zuneigung reicht, wird auch geheiratet. Der Antrag prüft das
			// selbst — ein Fehlschlag ist hier kein Fehler, sondern ein „noch nicht", und
			// deshalb zählt für die Diagnose das Werben und nicht der Antrag.
			await familyService.propose(npcId, lage.matchId);
			return buch('COURT', geworben);
		}

		case 'WEAR_GARMENT':
			return buch('WEAR_GARMENT', await needService.wearGarment(npcId));

		case 'DRINK_TONIC':
			return buch('DRINK_TONIC', await needService.drinkTonic(npcId));

		case 'BUY_GARMENT': {
			// Genau eines: Ein zweites Gewand im Schrank nützt niemandem, solange nur eines
			// getragen werden kann.
			const angebot = lage.cheapestGarment;
			return buch(
				'BUY_GARMENT',
				angebot ? await tradeService.buyFromOffer(npcId, angebot.id, 1) : undefined
			);
		}

		case 'BUY_TONIC': {
			const angebot = lage.cheapestTonic;
			return buch(
				'BUY_TONIC',
				angebot ? await tradeService.buyFromOffer(npcId, angebot.id, 1) : undefined
			);
		}

		case 'SELL': {
			// **Zum Grundpreis, nicht darunter und nicht darüber.** Ein NPC, der Preise
			// aushandelt, wäre ein eigenes System; der Katalogpreis ist der Anker, den es
			// ohnehin gibt, und er lässt Spielern Raum, ihn zu unterbieten.
			const ware = lage.sellable;
			if (ware && lage.workshopId) {
				// Erst ins Lager, dann ans Schild: Im eigenen Laden verkauft man aus dem
				// Betrieb, nicht aus der Tasche.
				if (ware.inInventory > 0) {
					// Dieselbe Tür wie beim Spieler, der auf 'Einlagern' klickt.
					await tradeService.moveToStock(npcId, lage.workshopId, ware.itemId, ware.inInventory);
				}
				const preis: number = getItemTemplate(ware.itemId)?.basePrice ?? 1;
				return buch(
					'SELL',
					await tradeService.placeOffer(npcId, lage.workshopId, ware.itemId, ware.quantity, preis)
				);
			}

			// **Der zweite Weg** (5.18): Was nicht aus dem eigenen Betrieb kommt, geht an den
			// Marktplatz — gegen Standgeld, aber überhaupt. Hier wird nicht eingelagert: Der
			// Stand verkauft aus der eigenen Habe, das ist der Unterschied zum Laden.
			if (lage.surplus && lage.marketId) {
				const preis: number = getItemTemplate(lage.surplus.itemId)?.basePrice ?? 1;
				return buch(
					'SELL',
					await tradeService.placeOffer(
						npcId,
						lage.marketId,
						lage.surplus.itemId,
						lage.surplus.quantity,
						preis
					)
				);
			}
			return buch('SELL', undefined);
		}

		case 'CRAFT':
			return buch(
				'CRAFT',
				lage.workshopId ? await productionService.craft(npcId, lage.workshopId) : undefined
			);

		case 'HARVEST':
			return buch(
				'HARVEST',
				lage.leaseId ? await productionService.harvest(npcId, lage.leaseId) : undefined
			);

		case 'LEASE':
			return buch(
				'LEASE',
				lage.leasableId ? await productionService.leasePlot(npcId, lage.leasableId) : undefined
			);

		case 'BUILD': {
			const vorlage =
				lage.workshopOptionId !== undefined
					? buildingService.getBuildingOption(lage.workshopOptionId)
					: undefined;
			return buch(
				'BUILD',
				vorlage && lage.freePlotId
					? await buildingService.build(vorlage, npcId, lage.freePlotId)
					: undefined
			);
		}

		case 'BUY_PLOT': {
			// Das erste freie Stück in der Stadt. Eine Wahl nach Lage gäbe es erst, wenn
			// Lage etwas bedeutete — heute sind alle Grundstücke gleich.
			const frei = await plotService.getFreeBuildingLand(lage.regionId);
			return buch('BUY_PLOT', frei[0] ? await plotService.buyPlot(frei[0].id, npcId) : undefined);
		}

		case 'BUY_INPUT': {
			// Genau so viel, wie ein Durchgang braucht — nicht das ganze Angebot. Ein Bäcker,
			// der das Mehl der Stadt aufkauft, nimmt es dem nächsten weg und bindet sein
			// Geld in Vorrat, den er in dieser Woche nicht verarbeitet.
			const angebot = lage.missingInputOffer;
			if (!angebot) return buch('BUY_INPUT', undefined);

			const bezahlbar: number = Math.floor(lage.money / angebot.pricePerUnit);
			const wieviel: number = Math.min(lage.missingInputCount, angebot.quantity, bezahlbar);
			return buch(
				'BUY_INPUT',
				wieviel > 0 ? await tradeService.buyFromOffer(npcId, angebot.id, wieviel) : undefined
			);
		}

		case 'BUY_MATERIAL': {
			// So viel, wie fehlt — begrenzt durch das Angebot und den Beutel. Wer Stück für
			// Stück kaufte, stünde vier Ticks lang auf einem leeren Bauplatz.
			const angebot = lage.missingMaterialOffer;
			if (!angebot) return buch('BUY_MATERIAL', undefined);

			const bezahlbar: number = Math.floor(lage.money / angebot.pricePerUnit);
			const wieviel: number = Math.min(lage.missingMaterialCount, angebot.quantity, bezahlbar);
			return buch(
				'BUY_MATERIAL',
				wieviel > 0 ? await tradeService.buyFromOffer(npcId, angebot.id, wieviel) : undefined
			);
		}

		case 'BUILD_HOME': {
			const vorlage = buildingService.getBuildingOption(WOHNHAUS_OPTION_ID);
			return buch(
				'BUILD_HOME',
				vorlage && lage.freePlotId
					? await buildingService.build(vorlage, npcId, lage.freePlotId)
					: undefined
			);
		}

		case 'RENOVATE':
			return buch(
				'RENOVATE',
				lage.repairId ? await buildingService.renovateBuilding(npcId, lage.repairId) : undefined
			);

		// **Dieselbe Tür wie beim Spieler** (5.29): `upgradeBuilding` prüft Eigentum,
		// Höchststufe, Geld und Kraft. Ein zweiter Satz Regeln für die Simulation wäre
		// genau das, was dieser Dienst durchgehend vermeidet.
		case 'UPGRADE_HOME':
			return buch(
				'UPGRADE_HOME',
				lage.ownHomeId ? await buildingService.upgradeBuilding(npcId, lage.ownHomeId) : undefined
			);

		case 'UPGRADE_WORKSHOP':
			return buch(
				'UPGRADE_WORKSHOP',
				lage.workshopId ? await buildingService.upgradeBuilding(npcId, lage.workshopId) : undefined
			);

		case 'OFFER_JOB':
			// Zum Lohn der Tagelöhnerei: Wer weniger böte, fände niemanden — mehr zu bieten
			// wäre großzügig auf Kosten des eigenen Ertrags.
			return buch(
				'OFFER_JOB',
				lage.workshopId
					? await employmentService.offerJob(npcId, lage.workshopId, TAGELOHN)
					: undefined
			);

		case 'VOTE': {
			// Gewählt wird nach Zuneigung — es gibt kein eigenes Wahlkampfsystem, und das
			// ist der Punkt: Wer über Jahre Beziehungen gepflegt hat, hat Stimmen.
			const zettel = lage.ballot;
			if (!zettel) return buch('VOTE', undefined);

			const zuneigungen = [];
			for (const kandidat of zettel.candidates) {
				const stand = await relationshipService.getAffection(npcId, kandidat.id, tick);
				zuneigungen.push({ candidateId: kandidat.id, affection: stand.affection });
			}
			const gewaehlt: string | undefined = npcChoice(npcId, zuneigungen);
			return buch(
				'VOTE',
				gewaehlt ? await electionService.vote(npcId, lage.regionId, gewaehlt) : undefined
			);
		}

		case 'IDLE':
			// **Der einzige Fall, in dem der Grund interessant ist.** Ein Verwalteter zählt
			// nicht mit: Seine engeren Befugnisse sind der Grund, und den kennen wir.
			return { action: 'IDLE', idleReason: verwaltet ? undefined : idleReason(lage.state) };
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
			sellable?: { itemId: string; quantity: number; inInventory: number };
			ballot?: Awaited<ReturnType<typeof electionService.getBallot>>;
			repairId?: string;
			ownHomeId?: string;
			missingMaterialOffer?: { id: string; quantity: number; pricePerUnit: number };
			missingMaterialCount: number;
			missingInputOffer?: { id: string; quantity: number; pricePerUnit: number };
			missingInputCount: number;
			marketId?: string;
			surplus?: { itemId: string; quantity: number };
	  }
	| undefined
> {
	// **Erst nachwachsen lassen, dann entscheiden.** Der gespeicherte Punktestand ist der
	// von der letzten Handlung; ein NPC, der seit Stunden nichts getan hat, stünde darin
	// bei null und käme nie wieder zum Zug. `getCharacter` schreibt den Zuwachs fort,
	// genau wie beim Aufruf einer Spielerseite — und das ist der Punkt: dieselbe Tür.
	const geladen = await characterService.getCharacter(npcId, tick);
	const npc = geladen ? await Character.findByPk(npcId) : null;
	if (!npc) return undefined;

	const werte = npc.dataValues;
	const brot = getItemTemplate('BREAD')!;

	/**
	 * **Die Häuser der Stadt, einmal je Lageaufnahme** (Punkt 67).
	 *
	 * Bis 5.48 holte sich jeder Helfer die Zeile selbst — der freie Arbeitsplatz, die
	 * fehlende Werkstatt, der Marktplatz —, also dreimal dieselbe Abfrage je NPC und je
	 * Tick. Gemessen wurden 801 Abfragen für einen Tick mit acht Einwohnern, davon fast
	 * zweihundert auf `buildings`.
	 *
	 * **Ein Parameter, kein Zwischenspeicher**: Die Liste lebt genau so lange wie diese
	 * eine Aufnahme. Innerhalb einer Aufnahme handelt niemand, also kann sie nicht
	 * veralten — anders als eine Stadtlage über den ganzen Tick, die nach dem ersten
	 * gebauten Haus falsch wäre.
	 */
	const haeuserDerStadt = await buildingService.getBuildingsInRegion(werte.RegionId, tick);

	const vorrat = await needService.getStock(npcId);
	const essbar: number = vorrat
		.filter((posten) => posten.nourishment)
		.reduce((summe, posten) => summe + posten.quantity, 0);

	// Was der Markt hergibt: Ohne Angebot kein Kauf — und ohne Kauf keine Nachfrage für
	// die Betriebe aus 4.10 und 4.11.
	const gewand = await tradeService.cheapestOffer(werte.RegionId, 'GARMENT', npcId);
	const trank = await tradeService.cheapestOffer(werte.RegionId, 'TONIC', npcId);

	// Was er selbst besitzt und betreibt (4.13).
	const eigene = await buildingService.getBuildingsOfCharacter(npcId, tick);
	const werkstatt = eigene.find(
		(haus) => buildingService.getBuildingOption(haus.optionId)?.type === 'CRAFT'
	);
	const grundstuecke = await plotService.getPlotsOfCharacter(npcId);
	const freiesBauland: boolean = (await plotService.getFreeBuildingLand(werte.RegionId)).length > 0;
	const flaechen = await productionService.getAreas(npcId);
	const eigenePacht = flaechen.find((flaeche) => flaeche.leasedByMe);
	const freieFlaeche = flaechen.find((flaeche) => !flaeche.leased && flaeche.resourceType);
	const zuVerkaufen = werkstatt ? await unverkauftes(npcId, werkstatt) : undefined;
	const werkstattLuecke = werkstatt ? undefined : await fehlendeWerkstatt(haeuserDerStadt, npcId);

	// Ein eigenes Dach und was daran hängt (4.14).
	const wohnhaus = eigene.find(
		(haus) => buildingService.getBuildingOption(haus.optionId)?.type === 'RESIDENCE'
	);
	const platz: number | null = await buildingService.freierWohnraum(werte.HomeBuildingId);
	const hausVorlage = buildingService.getBuildingOption(WOHNHAUS_OPTION_ID);
	const baufaellig = eigene.filter((haus) => haus.condition < REPAIR_BELOW)[0];

	// Was ein Ausbau jetzt kostete — **mit dem Winteraufschlag**, mit dem auch `upgrade()`
	// rechnet. Ohne ihn nennte die Entscheidung im Frost einen Preis, den die Handlung
	// nicht hält, und der NPC versuchte es Tick für Tick vergeblich.
	const jahreszeit: Season = seasonOf(tick);
	const ausbaupreis = (haus: { optionId: number; level: number } | undefined): number | null => {
		if (!haus) return null;
		const vorlage = buildingService.getBuildingOption(haus.optionId);
		const grundpreis: number | undefined = vorlage ? upgradePrice(vorlage, haus.level) : undefined;
		return grundpreis === undefined ? null : Math.ceil(grundpreis * buildingCostFactor(jahreszeit));
	};
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
	const stelleFrei = werkstatt ? await employmentService.hasUnofferedPosition(werkstatt) : false;
	const kannHerstellenJetzt = werkstatt ? await kannHerstellen(npcId, werkstatt) : false;
	const fehlendeZutat =
		werkstatt && !kannHerstellenJetzt ? await fehlendeRezeptZutat(npcId, werkstatt) : undefined;
	const zutatAngebot = fehlendeZutat
		? await tradeService.cheapestOffer(werte.RegionId, fehlendeZutat.itemId, npcId)
		: undefined;
	// Der zweite Verkaufsweg (5.18) — nur befragt, wenn der eigene Laden nichts hergibt:
	// Was dort hängt, kostet kein Standgeld.
	// **Erst fragen, ob es etwas zu verkaufen gibt — dann erst, wo und zu welchem Preis.**
	// Die Reihenfolge ist eine Frage der Kosten: Der Überschuss steht in der eigenen
	// Inventar (eine Abfrage), der Marktplatz verlangt die Häuserzeile der Stadt und das
	// Standgeld einen Blick ins Gesetzbuch. Beides je NPC und Tick abzufragen, obwohl im
	// Regelfall nichts übrig ist, hat den Durchlauf spürbar verteuert.
	const rohUeberschuss = zuVerkaufen
		? undefined
		: await marktUeberschuss(npcId, werkstatt, [...materialBedarf, ...werkstattMaterial]);
	const marktplatz = rohUeberschuss ? marktplatzIn(haeuserDerStadt) : undefined;
	const standgeld: number = rohUeberschuss ? await lawService.rate(werte.RegionId, 'STALL_FEE') : 0;
	// **Wer das Standgeld nicht hat, hat keinen Stand.** Ohne diese Frage wählte ein
	// mittelloser NPC `SELL` in jedem Tick aufs Neue, die Handlung scheiterte am
	// Standgeld, die Ware blieb liegen — und der nächste Tick begann von vorn. Dieselbe
	// Falle wie beim leeren Bauplatz (4.14), nur teurer: Jeder Versuch ist eine
	// Transaktion.
	const ueberschuss =
		rohUeberschuss && marktplatz && werte.money >= standgeld ? rohUeberschuss : undefined;

	// Läuft eine Wahl, bei der er noch nicht abgestimmt hat? (4.16)
	const wahlzettel = await electionService.getBallot(werte.RegionId, npcId);
	const wahlLaeuft: boolean =
		wahlzettel !== undefined && !wahlzettel.iVoted && wahlzettel.candidates.length > 0;

	const arbeitsplatz = await freierArbeitsplatz(haeuserDerStadt, npcId);
	const stelle = await employmentService.getJobOf(npcId);
	// Wer schon eine Stelle hat, sieht sich nicht um — ein NPC, der jede Stunde den
	// Arbeitgeber wechselt, wäre kein Handwerker, sondern ein Flattermann.
	const offen = stelle ? [] : await employmentService.getOpenJobs(werte.RegionId, npcId);
	const besser = offen.filter((angebot) => isWorthTaking(angebot.wage, TAGELOHN))[0];
	const unterkunft = werte.HomeBuildingId
		? undefined
		: await freierWohnplatz(werte.RegionId, npcId);
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
			ownStockToSell:
				(zuVerkaufen?.quantity ?? 0) + (marktplatz ? (ueberschuss?.quantity ?? 0) : 0),
			canCraft: kannHerstellenJetzt,
			inputPrice: zutatAngebot?.pricePerUnit ?? null,
			// **Nur, wenn es überhaupt etwas zu kaufen gibt.** Als feste Konstante war der
			// Preis eine Zusage, die die Stadt nicht einlösen konnte: Ist alles Bauland
			// vergeben, scheitert der Kauf, `hasFreePlot` bleibt falsch — und im nächsten
			// Tick versucht es derselbe NPC erneut. Im Messlauf zu 5.16 waren das 466
			// Fehlversuche in sechshundert Ticks. Dieselbe Bauart wie `leaseAvailable`,
			// und derselbe Grund.
			plotPrice: freiesBauland ? PLOT_PRICE : null,
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
			// Ausbauen, was steht (5.29).
			homeUpgradePrice: ausbaupreis(wohnhaus),
			workshopUpgradePrice: ausbaupreis(werkstatt),
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
		ownHomeId: wohnhaus?.id,
		missingMaterialOffer: material,
		missingInputOffer: zutatAngebot,
		missingInputCount: fehlendeZutat?.quantity ?? 0,
		marketId: marktplatz,
		surplus: ueberschuss,
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
 * Wo man in dieser Stadt für Lohn arbeiten kann.
 *
 * **Seit 5.26 ist das die Instandsetzung öffentlicher Bauten** und nicht mehr die
 * Tagelöhnerei in der städtischen Schmiede. Die war eine Krücke: hineingehen, drei Münzen
 * mitnehmen, und niemand bekam etwas dafür. Jetzt hinterlässt die Arbeit etwas — wer hier
 * schuftet, hält die Stadt instand, und die Stadt zahlt dafür aus derselben Kasse, aus der
 * sie die Instandhaltung ohnehin bezahlt hat.
 *
 * **Das macht Arbeit knapp**, und das ist gewollt: Stehen alle Bauten in voller Güte, gibt
 * es nichts zu tun. Wer nichts hat, muss sich dann anstellen lassen oder selbst etwas
 * anfangen — die Stadt ist kein Arbeitgeber letzter Instanz mehr.
 *
 * Genommen wird der schlechteste Bau: Wo es am nötigsten ist, wird zuerst gearbeitet.
 */
async function freierArbeitsplatz(
	haeuser: Haus[],
	characterId: string
): Promise<string | undefined> {
	const zuHaben = haeuser.filter(
		(haus) =>
			haus.condition < CONDITION_MAX &&
			haus.ownerCharacterId !== characterId &&
			// **Öffentliche Bauten immer, alles andere nur mit Auftrag** (5.27, Punkt 74).
			// Damit findet ein NPC auch die Arbeit, die ein Hausbesitzer ausgeschrieben hat —
			// sonst blieben private Aufträge liegen, und die Instandsetzung städtischer Bauten
			// wäre die einzige Lohnarbeit der Welt. Drei Schichten je Spieljahr sind kein
			// Einstieg.
			//
			// **Nicht jedes städtische Haus ist ein öffentlicher Bau** (Punkt 79): Was der
			// Stadt aus einem erbenlosen Nachlass zugefallen ist, wartet auf die
			// Versteigerung und nicht auf Handwerker, die die Stadtkasse bezahlt.
			(buildingService.isPublicWorks(haus) || haus.repairWage !== null)
	);

	// **Der beste Lohn zuerst, dann der schlechteste Zustand.** Wer arbeitet, nimmt das
	// bessere Angebot — und unter gleichen Angeboten das, wo es am nötigsten ist.
	return zuHaben.sort(
		(a, b) => (b.repairWage ?? TAGELOHN) - (a.repairWage ?? TAGELOHN) || a.condition - b.condition
	)[0]?.id;
}

/**
 * Ein Wohngebäude mit freiem Platz — das eigene zuerst, sonst das der Stadt.
 *
 * **Das eigene stand bis 5.6a nicht auf der Liste**, und das war ein Fehler mit einem
 * naheliegenden Anlass: Wer ein Wohnhaus **erbt**, bekommt den Eigentumstitel, aber keinen
 * Wohnsitz — `besitzUebertragen` rührt die Bewohner nicht an. Ein obdachloser Erbe zog
 * daraufhin in die städtische Unterkunft, während sein eigenes Haus leer stand.
 *
 * Fremde Privathäuser bleiben ausgenommen: Dort zieht niemand ungefragt ein.
 */
async function freierWohnplatz(regionId: string, characterId: string): Promise<string | undefined> {
	const gebäude = await Building.findAll({
		include: [{ model: Plot, as: 'plot', where: { RegionId: regionId }, required: true }]
	});

	const bewohnbar = gebäude.filter((eintrag) => {
		const vorlage = buildingService.getBuildingOption(eintrag.dataValues.optionId);
		if (!vorlage || residentsAt(vorlage, eintrag.dataValues.level) === 0) return false;
		return (
			eintrag.dataValues.ownerType === 'CITY' || eintrag.dataValues.OwnerCharacterId === characterId
		);
	});

	// Das eigene Dach vor dem der Allgemeinheit: Ein Platz in der Unterkunft, den ein
	// Hausbesitzer belegt, fehlt dem, der keines hat.
	const sortiert = [
		...bewohnbar.filter((eintrag) => eintrag.dataValues.OwnerCharacterId === characterId),
		...bewohnbar.filter((eintrag) => eintrag.dataValues.OwnerCharacterId !== characterId)
	];

	for (const eintrag of sortiert) {
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
			// Volljährig — dieselbe Grenze, die `court()` seit Punkt 78 selbst zieht. Hier
			// stand die Tickzahl je Spieljahr als 50 ausgeschrieben; sie hat einen Namen.
			birthTick: { [Op.lte]: tick - yearsToTicks(AGE_OF_MAJORITY) }
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
 * **Und unter dem, was fehlt, gewinnt das eigene Handwerk** (5.19). Wer sein Leben lang
 * gebacken hat, baut ein Backhaus und keine Schmiede — auch wenn die Schmiede zehn Münzen
 * billiger wäre. Das ist zugleich die wirtschaftlich richtige Wahl: Können geht in Ertrag
 * ein (`yieldOf`), ein Meister holt aus derselben Werkstatt mehr heraus als ein Anfänger.
 *
 * Vorher entschied allein der Preis. Das machte die Reihenfolge der Berufe zur Folge
 * einer Preisliste: Nach der Zimmerei (180) kam die Schneiderei (190), dann erst die
 * Mühle (200) und das Backhaus (220) — eine Stadt nähte eher Kleider, als dass sie Brot
 * buk, und niemand konnte sagen warum.
 *
 * Bei gleichem Können bleibt der Preis der Ausschlag: Wer wenig hat, fängt klein an.
 */
export async function fehlendeWerkstatt(
	haeuser: Haus[],
	characterId?: string
): Promise<{ optionId: number; price: number } | undefined> {
	const vorhanden = haeuser;

	const kandidaten = buildingService
		.getBuildingOptions()
		.filter((vorlage) => vorlage.type === 'CRAFT')
		.filter((vorlage) => !vorhanden.some((haus) => haus.optionId === vorlage.optionId));

	const bewertet: { optionId: number; price: number; koennen: number }[] = [];
	for (const vorlage of kandidaten) {
		bewertet.push({
			optionId: vorlage.optionId,
			price: levelOf(vorlage, 1).price,
			// Ohne Person oder ohne Fertigkeit in der Vorlage zählt nur der Preis — dann
			// verhält sich die Wahl wie vor 5.19.
			koennen:
				characterId && vorlage.skill ? await skillService.getLevel(characterId, vorlage.skill) : 0
		});
	}

	bewertet.sort((a, b) => b.koennen - a.koennen || a.price - b.price);
	return bewertet[0];
}

/**
 * Was er verkaufen könnte — aus dem Betriebslager **und aus dem eigenen Inventar**.
 *
 * Das Inventar muss mitzählen, weil `craft` das Erzeugnis dorthin legt: Wer selbst an der
 * Werkbank steht, trägt es nach Hause. Zum Verkauf im eigenen Laden muss es aber im Lager
 * liegen — deshalb wandert es beim Aushängen zuerst dorthin. Ohne diesen Umweg stellte
 * ein NPC her und her, und nichts käme je an ein Preisschild; genau das zeigte der
 * Selbsterhaltungstest.
 */
async function unverkauftes(
	characterId: string,
	werkstatt: { id: string; optionId: number }
): Promise<{ itemId: string; quantity: number; inInventory: number } | undefined> {
	const erzeugnisse: string[] = (
		buildingService.getBuildingOption(werkstatt.optionId)?.recipes ?? []
	).map((rezept) => rezept.outputItemId);
	if (erzeugnisse.length === 0) return undefined;

	const lager = await tradeService.getBuildingStock(werkstatt.id);
	const inventar = await needService.getStock(characterId);

	// **Kein Blick auf bestehende Angebote mehr.** Bis 5.18 wurde übersprungen, wofür schon
	// ein Schild hing — mit der Folge, dass ein liegengebliebenes Angebot den Nachschub für
	// immer sperrte: Die Zimmerei des Messlaufs stellte 1233 Durchgänge lang Bretter her,
	// von denen die Stadt nie mehr als das erste Schild zu sehen bekam.
	//
	// Nötig ist die Sperre auch nicht: `placeOffer` nimmt die Ware aus Lager und Inventar
	// ins Angebot hinein. Wer alles ausgehängt hat, hat nichts mehr übrig und kommt von
	// selbst nicht wieder her — bis er Neues herstellt. Und gleiche Ware zu gleichem Preis
	// stockt das bestehende Schild auf, statt danebenzuhängen.
	for (const itemId of erzeugnisse) {
		const imLager: number = lager.find((posten) => posten.itemId === itemId)?.quantity ?? 0;
		const imInventar: number = inventar.find((posten) => posten.itemId === itemId)?.quantity ?? 0;
		if (imLager + imInventar > 0) {
			return { itemId, quantity: imLager + imInventar, inInventory: imInventar };
		}
	}
	return undefined;
}

/** Der Marktplatz der Stadt — der einzige Laden, der niemandem gehört. */
function marktplatzIn(haeuser: Haus[]): string | undefined {
	return haeuser.find((haus) => haus.optionId === tradeService.MARKET_OPTION_ID)?.id;
}

/**
 * Was einer entbehren kann — und am Marktplatz anbietet.
 *
 * **Der zweite Verkaufsweg** (5.18). Bis dahin hängte nur aus, wer einen Betrieb hatte,
 * und nur dessen Erzeugnisse: Ein Pächter mit dreißig Getreide im Inventar bot nichts
 * an, obwohl der Müller nebenan darauf wartete. Damit brach jede Kette an der Stelle ab,
 * an der die Ware den Besitzer hätte wechseln müssen.
 *
 * Der Marktplatz kostet Standgeld und ist trotzdem der richtige Ort dafür: Er ist der
 * einzige, der niemandem gehört.
 *
 * **Behalten wird, was man braucht** — und nur das:
 *
 * - **Essen** bis zu einem Wochenvorrat. Wer sein letztes Brot verkauft, verhungert am
 *   eigenen Geschäftssinn.
 * - **Zutaten des eigenen Betriebs.** Sie sind kein Überschuss, sondern Vorprodukt; wer
 *   sie verkauft, steht morgen vor der leeren Werkbank.
 * - **Baumaterial**, solange ein Bau ansteht. Dasselbe Argument, nur für den Hausbau.
 */
async function marktUeberschuss(
	characterId: string,
	werkstatt: { id: string; optionId: number } | undefined,
	materialBedarf: { itemId: string; quantity: number }[]
): Promise<{ itemId: string; quantity: number } | undefined> {
	const behalten = new Map<string, number>();

	for (const posten of materialBedarf) {
		behalten.set(posten.itemId, (behalten.get(posten.itemId) ?? 0) + posten.quantity);
	}
	if (werkstatt) {
		for (const rezept of buildingService.getBuildingOption(werkstatt.optionId)?.recipes ?? []) {
			for (const zutat of rezept.input) {
				behalten.set(zutat.itemId, Math.max(behalten.get(zutat.itemId) ?? 0, zutat.quantity));
			}
		}
	}

	for (const posten of await needService.getStock(characterId)) {
		const vorlage = getItemTemplate(posten.itemId);
		if (!vorlage) continue;

		const noetig: number =
			(behalten.get(posten.itemId) ?? 0) + (vorlage.nourishment ? EIGENER_VORRAT : 0);
		const uebrig: number = posten.quantity - noetig;
		if (uebrig > 0) return { itemId: posten.itemId, quantity: uebrig };
	}
	return undefined;
}

/**
 * Reichen die Zutaten für einen Durchgang?
 *
 * Gezählt wird beides — Betriebslager und eigenes Inventar —, weil `craft` seit 4.10 auch
 * beides verbraucht. Ein NPC, der sein Holz eingelagert hat und dann nicht sägen dürfte,
 * stünde vor demselben Rätsel wie ein Spieler vor der Umstellung.
 */
async function kannHerstellen(
	characterId: string,
	werkstatt: { id: string; optionId: number }
): Promise<boolean> {
	const rezepte = buildingService.getBuildingOption(werkstatt.optionId)?.recipes ?? [];
	if (rezepte.length === 0) return false;

	// **Alles, was ihm gehört** (5.25, Punkt 72) — Inventar und alle seine Häuser. Wer sein
	// Holz auf dem Hof hat, kann in seiner Zimmerei trotzdem sägen.
	const vorrat = await tradeService.getOwnedStock(characterId);

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
/**
 * Was dem eigenen Betrieb zum nächsten Durchgang fehlt.
 *
 * **Das erste Rezept, dem am wenigsten fehlt** — nicht irgendeines. Die Alchemistenküche
 * kennt zwei, und wer sich am unerreichbaren festbeißt, kauft nie das, was ihn wirklich
 * weiterbrächte. Gezählt wird über Betriebslager und Inventar zusammen, wie in
 * `kannHerstellen`: Wo die Ware liegt, ist eine Frage der Buchung und keine des Könnens.
 */
async function fehlendeRezeptZutat(
	characterId: string,
	werkstatt: { id: string; optionId: number }
): Promise<{ itemId: string; quantity: number } | undefined> {
	const rezepte = buildingService.getBuildingOption(werkstatt.optionId)?.recipes ?? [];
	if (rezepte.length === 0) return undefined;

	const vorrat = new Map<string, number>();
	for (const posten of await tradeService.getBuildingStock(werkstatt.id)) {
		vorrat.set(posten.itemId, posten.quantity);
	}
	for (const posten of await needService.getStock(characterId)) {
		vorrat.set(posten.itemId, (vorrat.get(posten.itemId) ?? 0) + posten.quantity);
	}

	let beste: { itemId: string; quantity: number } | undefined;
	for (const rezept of rezepte) {
		for (const zutat of rezept.input) {
			const fehlt: number = zutat.quantity - (vorrat.get(zutat.itemId) ?? 0);
			if (fehlt <= 0) continue;
			if (!beste || fehlt < beste.quantity) beste = { itemId: zutat.itemId, quantity: fehlt };
		}
	}
	return beste;
}

async function fehlendesMaterial(
	characterId: string,
	bedarf: { itemId: string; quantity: number }[]
): Promise<{ itemId: string; quantity: number } | undefined> {
	if (bedarf.length === 0) return undefined;

	// **Auch hier alles, was ihm gehört** (5.25): Bretter, die in seiner Zimmerei liegen,
	// sind zum Bauen genauso da wie die in seinem Inventar. Vorher zählte nur das Inventar —
	// und seit das Erzeugnis im Betrieb bleibt, wäre sie meist leer.
	const vorrat = await tradeService.getOwnedStock(characterId);

	for (const posten of bedarf) {
		const da: number = vorrat.get(posten.itemId) ?? 0;
		if (da < posten.quantity) return { itemId: posten.itemId, quantity: posten.quantity - da };
	}
	return undefined;
}
