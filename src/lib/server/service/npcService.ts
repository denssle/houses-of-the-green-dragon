import { garmentIntact } from '$lib/game/attire.logic';
import { CAMPAIGN_TICKS, isSettled, npcChoice } from '$lib/game/election.logic';
import { Op } from 'sequelize';
import { Region } from '$lib/db/model/region';
import { levelOf, upgradePrice } from '$lib/model/buildingTemplate';
import { Building } from '$lib/db/model/building';
import type { Building as Haus } from '$lib/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import {
	decideCaretakerAction,
	decideNpcActionWithStage,
	stateFlags,
	type Stufe,
	type IdleReason,
	idleReason,
	isUnattended,
	type NpcAction,
	type NpcState,
	REPAIR_BELOW
} from '$lib/game/npc.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import * as supplyService from '$lib/server/service/supplyService';
import {
	CONDITION_MAX,
	isUnderConstruction,
	type MaterialNeed,
	materialFor,
	producesBuildingMaterial,
	renovationMaterial,
	RENOVATION_PER_ACTION,
	upgradeMaterial,
	residentsAt
} from '$lib/game/building.logic';
import { PLOT_PRICE, TAGELOHN, granaryPrice } from '$lib/game/economy';
import { LEASE_FEE } from '$lib/server/service/productionService';
import {
	AGE_OF_MAJORITY,
	ageInYears,
	buildingCostFactor,
	MAX_ACTION_POINTS,
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
import { repairWage } from '$lib/game/buildingAction.logic';
import * as auctionService from '$lib/server/service/auctionService';
import { canCarryNewHand, isWorthTaking } from '$lib/game/employment.logic';

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

export async function actForNpcs(
	tick: number,
	/**
	 * Was für einen Einzelnen geschieht.
	 *
	 * **Kommt als Parameter herein, damit ein Test einen Stolpernden erzwingen kann** —
	 * dieselbe Bauart wie beim Würfel in `reapTheDead`. Über die Datenbank geht es nicht:
	 * `NOT NULL` und die Fremdschlüssel lassen einen kaputten Charakter gar nicht erst
	 * entstehen. Im Betrieb steht hier immer `ausfuehren`.
	 */
	schritt: (
		characterId: string,
		tick: number,
		unattended?: boolean
	) => Promise<Ausgang> = ausfuehren
): Promise<NpcTick> {
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
		const ergebnis = await einzeln(schritt, npc.dataValues.id, tick);
		if (ergebnis) buchen(ergebnis);
		else gescheitert[AUSNAHME] = (gescheitert[AUSNAHME] ?? 0) + 1;
	}

	// **Und die Charaktere, die gerade niemand spielt** (5.5). Sie laufen durch dieselbe
	// Schleife, nur mit engeren Befugnissen — ein zweiter Durchlauf mit eigener Taktung
	// wäre dieselbe Arbeit an zwei Stellen.
	const verwaist = await Character.findAll({
		where: { deathTick: null, role: 'PLAYER' }
	});

	for (const charakter of verwaist) {
		if (!isUnattended(charakter.dataValues.lastSeenTick, tick)) continue;
		const ergebnis = await einzeln(schritt, charakter.dataValues.id, tick, true);
		if (ergebnis) buchen(ergebnis);
		else gescheitert[AUSNAHME] = (gescheitert[AUSNAHME] ?? 0) + 1;
	}

	return {
		acted: gehandelt,
		byAction: gezaehlt,
		byFailure: gescheitert,
		byIdleReason: gruende
	};
}

/**
 * **Ein Stolpernder reißt nicht die Stunde mit** (5.73, Punkt 91).
 *
 * Bis hierher lief die Schleife ungeschützt, und die Ausnahme eines einzelnen Einwohners
 * lief bis in das `try` von `schlagen()`. Damit fiel nicht ein Einwohner aus, sondern
 * **alles, was danach steht**: die übrigen Einwohner, der Zuzug, die Wahl, die
 * Amtshandlungen, die Versteigerungen, die Grundsteuer, der Sold, das Unglück und das
 * Sterben. Im Log stand eine Zeile.
 *
 * Und es wäre nicht ein verlorener Tick geblieben: Die Zugreihenfolge ist in jedem Tick
 * dieselbe (Punkt 88), also trifft es reproduzierbar dieselben Leute — dieselbe Stunde
 * ginge Stunde um Stunde verloren, bis jemand die Daten repariert.
 *
 * **Verschluckt wird nichts.** Der Fehlschlag wird gebucht, damit er in der Statistik
 * auftaucht, *und* mit der Kennung des Betroffenen protokolliert: Ein stillschweigend
 * gefangener Fehler wäre schlimmer als der Absturz, weil ihn niemand fände.
 *
 * **Und er wird nicht als `IDLE` gebucht.** Das läge nahe, verletzte aber die Zusicherung,
 * dass zu jedem Müßiggang ein Grund gehört (`byIdleReason`, geprüft in `measure.spec.ts`)
 * — und die Gründe dort sind Entscheidungen über ein Leben, kein Unfall im Code. Ein
 * Abgestürzter hat nichts gewählt, also steht er in keiner Handlungszählung; er steht
 * allein unter `byFailure`, wo der Ticker ohnehin warnt.
 */
export const AUSNAHME = 'UNKNOWN/EXCEPTION';

async function einzeln(
	schritt: (characterId: string, tick: number, unattended?: boolean) => Promise<Ausgang>,
	characterId: string,
	tick: number,
	unattended = false
): Promise<Ausgang | undefined> {
	try {
		return await schritt(characterId, tick, unattended);
	} catch (fehler) {
		console.error(`Einwohner ${characterId} ist im Tick ${tick} gescheitert:`, fehler);
		return undefined;
	}
}

/** Was eine einzelne Entscheidung ergeben hat. */
export interface Ausgang {
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
 *
 * **Ausgeführt wird sie über `actForNpcs`**, das den Schritt als Parameter nimmt; nach
 * außen sichtbar ist sie nur, damit ein Test einen einzelnen Einwohner stolpern lassen
 * kann, ohne den übrigen ihr Verhalten zu nehmen (Punkt 91).
 */
export async function ausfuehren(
	npcId: string,
	tick: number,
	verwaltet: boolean = false
): Promise<Ausgang> {
	const lage = await lageAufnehmen(npcId, tick);
	// Kein Charakter mehr da (tot, gelöscht) — kein Grund, das als Müßiggang zu deuten.
	if (!lage) return { action: 'IDLE' };

	const { action: handlung, stage } = verwaltet
		? { action: decideCaretakerAction(lage.state), stage: 'verwaltet' as const }
		: decideNpcActionWithStage(lage.state);

	const ergebnis: Ausgang = await handelnd(handlung, npcId, tick, lage, verwaltet);

	// **Der Protokollant** (5.88, Punkt 111). Er steht hier und nicht in `actForNpcs`,
	// weil hier alles beisammen ist: der Zustand, aus dem entschieden wurde, die Stufe,
	// die geliefert hat, und was daraus geworden ist. Im Betrieb ist er nicht gesetzt und
	// kostet dann einen `undefined`-Vergleich je NPC und Tick.
	protokollant?.({
		npcId,
		tick,
		name: lage.name,
		action: ergebnis.action,
		stage,
		failure: ergebnis.failure,
		idleReason: ergebnis.idleReason,
		flags: stateFlags(lage.state),
		money: lage.money
	});

	return ergebnis;
}

/**
 * Wer bei jeder Entscheidung zusieht — und warum das keine Debug-Ausgabe ist.
 *
 * **Der Messlauf konnte bis 5.88 sagen, was geschah, aber nicht, warum es nicht geschah.**
 * `byAction` zählt, was getan wurde, `byFailure`, woran ein Versuch scheiterte — aber die
 * häufigste Handlung der Welt ist `IDLE`, und über sie sagte nur `idleReason` etwas, eine
 * Diagnose, die die Hierarchie nachbildet und deshalb von ihr abweichen kann. Beim Mann,
 * der mit vollen Aktionspunkten verhungerte, hat das drei Erklärungsversuche gekostet und
 * keine Antwort gebracht.
 *
 * Deshalb meldet der Protokollant **Tatsachen statt Deutungen**: die Stufe, die
 * entschieden hat, und die rohen Schalter des Zustands. Wer ihn setzt, ist der Messlauf;
 * im Betrieb bleibt er leer, denn ein Protokoll über jeden NPC und jeden Tick wäre dort
 * eine Datei, die niemand liest, und eine Zeile Arbeit, die niemand braucht.
 */
export interface Protokolleintrag {
	npcId: string;
	tick: number;
	name: string;
	action: NpcAction;
	stage: Stufe | 'verwaltet';
	failure?: string;
	idleReason?: IdleReason;
	flags: string[];
	money: number;
}

let protokollant: ((eintrag: Protokolleintrag) => void) | undefined;

/** Zusehen lassen — ohne Argument aufgerufen, hört das Zusehen wieder auf. */
export function protokollieren(beobachter?: (eintrag: Protokolleintrag) => void): void {
	protokollant = beobachter;
}

/**
 * Die gewählte Handlung ausführen.
 *
 * **Aus `ausfuehren` herausgelöst** (5.88), damit der Protokollant ein Ergebnis vor sich
 * hat statt zwanzig `return`s. Der Inhalt ist unverändert.
 */
async function handelnd(
	handlung: NpcAction,
	npcId: string,
	tick: number,
	lage: NonNullable<Awaited<ReturnType<typeof lageAufnehmen>>>,
	verwaltet: boolean
): Promise<Ausgang> {
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
				lage.jobId
					? await employmentService.takeJob(npcId, lage.jobId, lage.switchJob ?? false)
					: undefined
			);

		case 'WORK':
			// Wer eine Stelle hat, arbeitet dort — der Ertrag geht in den Betrieb, der Lohn
			// an ihn. Nur wer keine hat, verdingt sich tageweise.
			if (lage.state.hasJob) {
				return buch('WORK', await employmentService.workForEmployer(npcId));
			}
			// **Oder auf der Erschließung** (5.92): Dieselbe Lohnarbeit, nur ohne Haus —
			// Wege, Gräben, Vermessung, bezahlt aus der Stadtkasse. Welches von beiden es
			// wird, hat die Lageaufnahme nach dem Lohn entschieden; hier steht höchstens
			// eines von beiden.
			if (lage.surveyPlotId) {
				return buch('WORK', await auctionService.surveyForHire(npcId, lage.surveyPlotId));
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

		// Derselbe Kauf, andere Ware (5.62) — siehe `BUY_WORKSHOP_MATERIAL` in `npc.logic`.
		case 'BUY_WORKSHOP_MATERIAL': {
			const angebot = lage.workshopMaterialOffer;
			if (!angebot) return buch('BUY_WORKSHOP_MATERIAL', undefined);

			const bezahlbar: number = Math.floor(lage.money / angebot.pricePerUnit);
			const wieviel: number = Math.min(lage.workshopMaterialCount, angebot.quantity, bezahlbar);
			return buch(
				'BUY_WORKSHOP_MATERIAL',
				wieviel > 0 ? await tradeService.buyFromOffer(npcId, angebot.id, wieviel) : undefined
			);
		}

		// Dasselbe noch einmal für den Ausbau (5.80) — er kostet seit dem Rohbau für
		// Anbauten Material statt Münzen.
		case 'BUY_UPGRADE_MATERIAL': {
			const angebot = lage.upgradeMaterialOffer;
			if (!angebot) return buch('BUY_UPGRADE_MATERIAL', undefined);

			const bezahlbar: number = Math.floor(lage.money / angebot.pricePerUnit);
			const wieviel: number = Math.min(lage.upgradeMaterialCount, angebot.quantity, bezahlbar);
			return buch(
				'BUY_UPGRADE_MATERIAL',
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
			/** Die Erschließung, an der er arbeiten würde — statt an einem Haus (5.92). */
			surveyPlotId?: string;
			homeId?: string;
			matchId?: string;
			jobId?: string;
			/** Ob er dafür seine bisherige Stelle aufgibt (5.99). */
			switchJob?: boolean;
			leisten: number;
			money: number;
			/** Nur fürs Protokoll (5.88) — die Entscheidung kennt keine Namen. */
			name: string;
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
			workshopMaterialOffer?: { id: string; quantity: number; pricePerUnit: number };
			workshopMaterialCount: number;
			upgradeMaterialOffer?: { id: string; quantity: number; pricePerUnit: number };
			upgradeMaterialCount: number;
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
	// **Die Fläche, die zum Betrieb passt — nicht die erste beste** (5.84, Punkt 103).
	//
	// Bis hierher nahm ein Pachtwilliger die **erste** freie Fläche mit einem Rohstoff, und
	// das war die Sperre der ganzen Wirtschaft: Im Messlauf lagen dreimal Eichwald und
	// Erzgrube unter Pacht, während das Mühlenfeld mit drei freien Flächen und der
	// Steinbruch unberührt blieben. Ohne Stein keine Quader, ohne Quader **keine Werkstatt
	// überhaupt** — `materialFor` verlangt für jeden Betrieb Bretter, Quader und Eisen. Ein
	// Steinmetz pachtete einen Acker und stand weiter ohne Stein da; vier Bauern und zwei
	// Bäcker warteten auf ein Feld, das frei danebenlag.
	//
	// Gesucht wird deshalb zuerst die Fläche, deren Ernte der eigene Betrieb **verarbeiten
	// kann**; erst wenn es keine gibt, tut es die nächstbeste. Für einen ohne Werkstatt
	// ändert sich nichts.
	const gebraucht: string[] =
		werkstatt !== undefined
			? (buildingService.getBuildingOption(werkstatt.optionId)?.recipes ?? []).flatMap((rezept) =>
					rezept.input.map((zutat) => zutat.itemId)
				)
			: [];
	const freieFlaechen = flaechen.filter((flaeche) => !flaeche.leased && flaeche.resourceType);
	const freieFlaeche =
		freieFlaechen.find((flaeche) => gebraucht.includes(flaeche.resourceType!)) ?? freieFlaechen[0];
	const zuVerkaufen = werkstatt ? await unverkauftes(npcId, werkstatt) : undefined;
	const werkstattLuecke = werkstatt
		? undefined
		: await fehlendeWerkstatt(haeuserDerStadt, npcId, werte.RegionId);

	// Ein eigenes Dach und was daran hängt (4.14).
	const wohnhaus = eigene.find(
		(haus) => buildingService.getBuildingOption(haus.optionId)?.type === 'RESIDENCE'
	);
	const platz: number | null = await buildingService.freierWohnraum(werte.HomeBuildingId);
	const hausVorlage = buildingService.getBuildingOption(WOHNHAUS_OPTION_ID);
	// **Der eigene Rohbau zuerst** (5.76). Er steht hier neben den baufälligen Häusern,
	// weil es für den Entschluss dasselbe ist — „bring dein Haus voran" —, und er kommt
	// vor ihnen, weil ein halbfertiges Haus dringender ist als ein angeschlagenes: In dem
	// einen wohnt niemand, das andere steht.
	const eigenerRohbau = eigene.filter(isUnderConstruction)[0];
	const baufaellig = eigenerRohbau ?? eigene.filter((haus) => haus.condition < REPAIR_BELOW)[0];

	// Was ein Ausbau jetzt kostete — **mit dem Winteraufschlag**, mit dem auch `upgrade()`
	// rechnet. Ohne ihn nennte die Entscheidung im Frost einen Preis, den die Handlung
	// nicht hält, und der NPC versuchte es Tick für Tick vergeblich.
	const jahreszeit: Season = seasonOf(tick);
	/** Nur, was fertig ist — ein Rohbau kennt weder Ausbau noch Ertrag (5.76). */
	const fertig = <T extends { underConstruction: boolean }>(haus: T | undefined): T | undefined =>
		haus && !isUnderConstruction(haus) ? haus : undefined;
	const ausbaupreis = (haus: { optionId: number; level: number } | undefined): number | null => {
		if (!haus) return null;
		const vorlage = buildingService.getBuildingOption(haus.optionId);
		const grundpreis: number | undefined = vorlage ? upgradePrice(vorlage, haus.level) : undefined;
		return grundpreis === undefined ? null : Math.ceil(grundpreis * buildingCostFactor(jahreszeit));
	};
	// **Ein Rohbau verlangt kein Material mehr** (5.76): Es steckt seit dem Anlegen darin,
	// und was noch fehlt, ist Arbeit. Verlangte die Entscheidung hier trotzdem Bretter,
	// schickte sie den Bauherrn erst einkaufen und dann an eine Baustelle, die nichts
	// davon braucht.
	const materialBedarf = eigenerRohbau
		? []
		: baufaellig
			? // **Das Holz für einen Anlauf, nicht für das ganze Haus** (5.78): Eine
				// Renovierung bringt zwanzig Zustandspunkte. Die alte Rechnung ließ einen NPC
				// das Material von fünf Anläufen zusammenkaufen, ehe er den ersten begann.
				renovationMaterial(
					Math.min(RENOVATION_PER_ACTION, Math.ceil(CONDITION_MAX - baufaellig.condition))
				)
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
	// Dasselbe für die Werkstatt (5.62). **Eine eigene Abfrage und keine geteilte**: Das
	// Wohnhaus braucht Bretter, die Werkstatt Quader und Eisen dazu — wer beides über
	// dieselbe Angabe führt, spart auf die eine Ware und kauft die andere.
	// **Welcher Ausbau steht an, und was fehlt dafür** (5.80)? Höchstens einer kommt in
	// Frage — das Haus, wenn es voll ist, sonst die Werkstatt —, und welcher es wird,
	// entscheidet die Bedürfnishierarchie in `npc.logic`. Hier wird nur beschafft, was der
	// dort mögliche Ausbau verlangt.
	const auszubauen = fertig(wohnhaus) ?? fertig(werkstatt);
	const ausbauVorlage = auszubauen
		? buildingService.getBuildingOption(auszubauen.optionId)
		: undefined;
	const ausbauMaterial =
		ausbauVorlage && auszubauen ? upgradeMaterial(ausbauVorlage, auszubauen.level) : [];
	const fehltAusbauMaterial = await fehlendesMaterial(npcId, ausbauMaterial);
	const ausbauBaustoff = fehltAusbauMaterial
		? await tradeService.cheapestOffer(werte.RegionId, fehltAusbauMaterial.itemId, npcId)
		: undefined;

	const fehltWerkstattMaterial = await fehlendesMaterial(npcId, werkstattMaterial);
	const werkstattBaustoff = fehltWerkstattMaterial
		? await tradeService.cheapestOffer(werte.RegionId, fehltWerkstattMaterial.itemId, npcId)
		: undefined;
	const stelleFrei = werkstatt ? await employmentService.hasUnofferedPosition(werkstatt) : false;
	// In einem Rohbau steht keine Werkbank — er zählt als eigene Werkstatt (sonst baute
	// sein Besitzer eine zweite), aber herstellen lässt sich darin nichts.
	const kannHerstellenJetzt =
		werkstatt && !isUnderConstruction(werkstatt) ? await kannHerstellen(npcId, werkstatt) : false;
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
	// **Und ob er überhaupt wählen darf** (5.72, Punkt 97). Bis hierher fragte die Lage nur,
	// ob eine Wahl läuft und ob er schon abgestimmt hat — nicht, ob er Bürger ist. Ein
	// Zugezogener wählt aber erst nach einer Wahlperiode mit (5.24), und `electionService`
	// weist ihn dann mit `NOT_A_CITIZEN` ab. Der Entschluss fiel trotzdem: In einem Lauf
	// über 2000 Ticks 900 Wahlgänge, davon **850 vergeblich** — die höchste Fehlschlagquote
	// der Welt nach der leeren Stadtkasse.
	//
	// Dieselbe Lücke wie in den Punkten 59, 63 und 87: Die Entscheidung prüfte etwas
	// anderes als die Ausführung. Wer nicht wählen darf, soll es gar nicht erst vorhaben —
	// sonst ist der Tick verbrannt und die Buchführung meldet eine Handlung, die keine war.
	const wahlLaeuft: boolean =
		wahlzettel !== undefined &&
		!wahlzettel.iVoted &&
		wahlzettel.candidates.length > 0 &&
		isSettled(werte.arrivedTick ?? null, tick);

	const arbeit = await freierArbeitsplatz(haeuserDerStadt, npcId, werte.RegionId);
	const arbeitsplatz: string | undefined = arbeit?.art === 'BUILDING' ? arbeit.id : undefined;
	const vermessung: string | undefined = arbeit?.art === 'SURVEY' ? arbeit.id : undefined;
	const stelle = await employmentService.getJobOf(npcId);
	// Wer schon eine Stelle hat, sieht sich nicht um — ein NPC, der jede Stunde den
	// Arbeitgeber wechselt, wäre kein Handwerker, sondern ein Flattermann.
	const offen = stelle ? [] : await employmentService.getOpenJobs(werte.RegionId, npcId);
	const besser = offen.filter((angebot) => isWorthTaking(angebot.wage, TAGELOHN))[0];
	// Wer keinen eigenen Betrieb hat, sieht sich nach einer Stelle um, wo die Stadt Hände
	// braucht (5.99, Punkt 115) — auch, wenn er schon eine hat.
	const knappeStelle = werkstatt
		? undefined
		: await stelleImKnappenBetrieb(npcId, werte.RegionId, haeuserDerStadt, stelle);
	const unterkunft = werte.HomeBuildingId
		? undefined
		: await freierWohnplatz(werte.RegionId, npcId);
	const partner = werte.spouseId ? undefined : await naechsterPartner(npc.dataValues, tick);

	return {
		// **Am Kornspeicherpreis gerechnet, nicht am Grundpreis** — denn dorthin führt
		// diese Zahl. Seit dem Aufschlag (Punkt 85) sind das zwei verschiedene, und wer
		// mit der kleineren rechnet, bestellt fünf Laibe und bekommt `NOT_ENOUGH_MONEY`.
		leisten: Math.floor(werte.money / granaryPrice(brot.basePrice)),
		// **Nur fürs Protokoll** (5.88): Eine Kennung sagt beim Lesen nichts, ein Name
		// schon — und die Entscheidung selbst rührt ihn nicht an.
		name: werte.firstName,
		money: werte.money,
		regionId: werte.RegionId,
		cheapestBread: await tradeService.cheapestOffer(werte.RegionId, 'BREAD', npcId),
		workplaceId: arbeitsplatz,
		surveyPlotId: vermessung,
		homeId: unterkunft,
		matchId: partner,
		jobId: knappeStelle?.buildingId ?? besser?.buildingId,
		switchJob: knappeStelle !== undefined && stelle !== undefined,
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
			workAvailable: arbeit !== undefined || stelle !== undefined,
			hasJob: stelle !== undefined,
			betterJobAvailable: besser !== undefined,
			scarceJobAvailable: knappeStelle !== undefined,
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
			workshopMaterialMissing: fehltWerkstattMaterial !== undefined,
			workshopMaterialPrice: werkstattBaustoff?.pricePerUnit ?? null,
			leaseFee: LEASE_FEE,
			// Ein eigenes Dach (4.14).
			homeHasRoom: (platz ?? 0) > 0,
			ownsHome: wohnhaus !== undefined,
			homePrice: hausVorlage ? levelOf(hausVorlage, 1).price : null,
			materialMissing: fehltMaterial !== undefined,
			materialPrice: material?.pricePerUnit ?? null,
			repairNeeded: baufaellig !== undefined,
			// Eine eigene Baustelle ist eigene Arbeit (5.76) — wer eine hat, verdingt sich
			// nicht anderswo, solange sie halbfertig dasteht.
			ownConstruction: eigenerRohbau !== undefined,
			// **Bauen und Herrichten kosten keine Münze mehr** (5.76 und 5.78) — sie kosten
			// Material und Kraft. Stünde hier ein Preis, verlangte die Entscheidung Geld für
			// eine Arbeit, die keines kostet, und wer keines hat, bliebe für immer vor
			// seinem eigenen Haus stehen.
			repairCost: 0,
			// Ausbauen, was steht (5.29) — und was **steht**, nicht was gerade entsteht
			// (5.76): Ein Rohbau lässt sich nicht ausbauen, und ein Entschluss dazu wäre ein
			// verbrannter Tick in jeder Stunde, in der die Unterkunft voll ist.
			homeUpgradePrice: ausbaupreis(fertig(wohnhaus)),
			workshopUpgradePrice: ausbaupreis(fertig(werkstatt)),
			upgradeMaterialMissing: fehltAusbauMaterial !== undefined,
			upgradeMaterialPrice: ausbauBaustoff?.pricePerUnit ?? null,
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
		workshopMaterialOffer: werkstattBaustoff,
		workshopMaterialCount: fehltWerkstattMaterial?.quantity ?? 0,
		upgradeMaterialOffer: ausbauBaustoff,
		upgradeMaterialCount: fehltAusbauMaterial?.quantity ?? 0,
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
/**
 * Wo für Lohn gearbeitet werden kann — ein Haus oder eine Erschließung.
 *
 * **Die Baustelle der Stadt steht in derselben Reihe wie die Häuser** (5.92, Punkt 102).
 * Sie wäre sonst Arbeit, die niemand findet: Die Vermessung hängt an keinem Gebäude, und
 * wer nur Häuser durchsieht, läuft an ihr vorbei.
 */
export type Arbeitsangebot = { art: 'BUILDING'; id: string } | { art: 'SURVEY'; id: string };

async function freierArbeitsplatz(
	haeuser: Haus[],
	characterId: string,
	regionId: string
): Promise<Arbeitsangebot | undefined> {
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
	const nachLohn = zuHaben.sort(
		(a, b) => (b.repairWage ?? TAGELOHN) - (a.repairWage ?? TAGELOHN) || a.condition - b.condition
	);

	// **Das eigene Können gehört in die Rechnung** (5.82): Bezahlt wird der Aushang mal
	// Können, und wer nur den Aushang prüft, schickt Meister zu Bauherren, die den Meister
	// nicht bezahlen können. Eine Abfrage je Aufnahme — dieselbe Größenordnung wie die
	// Beutel, und aus demselben Grund gerechtfertigt.
	const koennen: number = await skillService.getLevel(characterId, 'CONSTRUCTION');
	const bestesHaus = (await zahlbare(nachLohn, regionId, koennen))[0];

	// **Und die Erschließung** (5.92). Sie zahlt den Tagelohn wie jeder städtische Bau —
	// wer also anderswo **mehr** geboten bekommt, geht dorthin. Bei gleichem Lohn geht die
	// Vermessung vor: Sie ist das, woran die Stadt am dringendsten hängt, denn ohne
	// Bauland wächst sie nicht (Punkt 93), während ein angeschlagenes Haus wenigstens
	// steht.
	const bestesHausLohn: number = bestesHaus
		? repairWage(bestesHaus.repairWage ?? TAGELOHN, koennen)
		: 0;
	if (bestesHaus && bestesHausLohn > repairWage(TAGELOHN, koennen)) {
		return { art: 'BUILDING', id: bestesHaus.id };
	}

	const baustelle = await zahlbareBaustelle(regionId, koennen);
	if (baustelle) return { art: 'SURVEY', id: baustelle };
	return bestesHaus ? { art: 'BUILDING', id: bestesHaus.id } : undefined;
}

/**
 * Die Erschließung, an der gearbeitet werden kann — wenn die Stadt den Lohn aufbringt.
 *
 * **Geprüft wird der Beutel und nicht nur der Aushang**, dieselbe Lehre wie in 5.81 und
 * 5.82 (Punkt 106): Eine Baustelle, deren Auftraggeber nicht zahlen kann, zieht sonst
 * Tick für Tick jemanden an, lässt eine Transaktion scheitern und steht am nächsten Tag
 * wieder da. Bei der Stadt ist das keine Kleinigkeit — sie kann leer sein, und seit 5.92
 * beschließt sie die Erschließung auch dann.
 */
async function zahlbareBaustelle(regionId: string, koennen: number): Promise<string | undefined> {
	const baustellen = await auctionService.getDevelopments(regionId);
	if (baustellen.length === 0) return undefined;

	const kasse: number = (await Region.findByPk(regionId))?.dataValues.treasury ?? 0;
	if (kasse < repairWage(TAGELOHN, koennen)) return undefined;

	// Die am weitesten gediehene zuerst: Ein fertiges Grundstück nützt mehr als zwei halbe.
	return [...baustellen].sort((a, b) => b.shifts - a.shifts)[0].id;
}

/**
 * Wer den Lohn, den er bietet, auch aufbringt (5.81, Punkt 106).
 *
 * **Der teuerste Fehlschlag der Welt saß genau hier.** `WORK/EMPLOYER_BROKE` wuchs über
 * drei Schritte von 781 auf 5602 und war zuletzt mit Abstand die häufigste vergebliche
 * Handlung: Diese Suche fragte nach dem **Aushang**, nie nach dem Beutel dahinter. Seit
 * jeder Rohbau beim Anlegen einen Bauauftrag aushängt (5.76), auch der eines mittellosen
 * Bauherrn, lief ein Tagelöhner Tick für Tick zu derselben Baustelle, ließ eine
 * Transaktion scheitern und stand am nächsten Tag wieder davor — sortiert wird ja nach dem
 * **besten** Lohn, und der teuerste Aushang stammt gern von dem, der ihn nicht zahlen
 * kann. Dieselbe Lücke wie in den Punkten 59, 63, 87 und 97: Die Entscheidung prüfte etwas
 * anderes als die Ausführung.
 *
 * **Zwei Abfragen, und sie sparen mehr, als sie kosten.** Punkt 67 sitzt bei jeder neuen
 * Abfrage im Nacken — hier ist die Rechnung aber eindeutig: Ein Fehlschlag ist eine
 * **Transaktion**, und fünftausend davon je Messlauf wiegen schwerer als eine gebündelte
 * Lesung je Aufnahme. Gelesen wird nur, was nach der Sortierung überhaupt in Frage kommt.
 *
 * **Geprüft wird der Betrag, der wirklich fließt** — Aushang mal Können (`repairWage`).
 * Mit 5.81 stand hier nur der Aushang, und die Begründung war, ein Meister gerate dann
 * eben „selten" an einen knappen Beutel. **Das war falsch**, und der Messlauf hat es
 * widerlegt: 1689 vergebliche Schichten blieben übrig, weil seit dem Rohbau fast jeder
 * bauen kann und aus drei ausgehängten Münzen bei Können 5 schon fünf werden. Die Abkürzung
 * sparte eine Abfrage und kostete ein Drittel des Erfolgs.
 */
async function zahlbare(haeuser: Haus[], regionId: string, koennen: number): Promise<Haus[]> {
	if (haeuser.length === 0) return [];

	const inhaber: string[] = [
		...new Set(haeuser.map((haus) => haus.ownerCharacterId).filter((id) => id !== null))
	];
	const beutel = new Map<string, number>(
		inhaber.length === 0
			? []
			: (
					await Character.findAll({
						where: { id: { [Op.in]: inhaber } },
						attributes: ['id', 'money']
					})
				).map((person) => [person.dataValues.id, person.dataValues.money])
	);

	// Die Stadtkasse nur nachschlagen, wenn ein städtischer Bau überhaupt dabei ist.
	const städtisch: boolean = haeuser.some((haus) => haus.ownerCharacterId === null);
	const kasse: number = städtisch
		? ((await Region.findByPk(regionId))?.dataValues.treasury ?? 0)
		: 0;

	return haeuser.filter((haus) => {
		const lohn: number = repairWage(haus.repairWage ?? TAGELOHN, koennen);
		const vorhanden: number =
			haus.ownerCharacterId === null ? kasse : (beutel.get(haus.ownerCharacterId) ?? 0);
		return vorhanden >= lohn;
	});
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
 *
 * **Und „es gibt schon eine" meint eine in Bürgerhand** (5.65, Punkt 86). Bis dahin zählte
 * jedes Haus der Stadt mit — auch die **städtische Schmiede**, die der Weltaufbau setzt.
 * Damit war optionId 2 auf ewig aus dem Kandidatenfeld, und daran hing mehr als ein Beruf:
 *
 * - Die Schmiede ist das **einzige Rezept dieser Welt, das `IRON` erzeugt**.
 * - Die städtische stellt nichts her: NPCs verarbeiten nur im eigenen Betrieb.
 * - `materialFor` verlangt für jede Werkstatt außer Zimmerei, Steinmetzhütte und Schmiede
 *   `PLANK + BLOCK + IRON`.
 *
 * Also blieb `workshopMaterialMissing` für Mühle, Bäckerei, Schneiderei und
 * Alchemistenküche für immer wahr, `workshopMaterialPrice` für immer `null`, und `BUILD`
 * war gesperrt. Grünau konnte aus eigener Kraft **niemals** ein Backhaus bekommen — nicht
 * aus Geldmangel und nicht mangels Können, sondern weil eine Zutat des Bauwerks nirgends
 * entstand. Im Messlauf über 600 Ticks entstanden zwei Bauten: Zimmerei und
 * Steinmetzhütte, genau die beiden, die kein Material verlangen.
 *
 * Dass die Stadt eine Schmiede unterhält, heißt nicht, dass niemand sonst schmieden darf.
 *
 * **Das gilt auch für Heimgefallenes** (Punkt 89): Ein Betrieb, der der Stadt aus einem
 * erbenlosen Nachlass zufiel, wird von niemandem geführt und versorgt darum niemanden. Er
 * gibt das Handwerk wieder frei. Zwischen Heimfall und Zuschlag kann deshalb einer neben
 * das Versteigerte bauen — das ist der Preis dafür, dass ein unverkäuflicher Nachlass ein
 * Handwerk nicht für alle Zeit blockiert, und die Versteigerung läuft ohnehin im selben
 * Takt an.
 */
export async function fehlendeWerkstatt(
	haeuser: Haus[],
	characterId?: string,
	regionId?: string
): Promise<{ optionId: number; price: number } | undefined> {
	const vorhanden = haeuser.filter((haus) => haus.ownerType === 'CHARACTER');

	const handwerke = buildingService
		.getBuildingOptions()
		.filter((vorlage) => vorlage.type === 'CRAFT');
	const kandidaten = handwerke.filter(
		(vorlage) => !vorhanden.some((haus) => haus.optionId === vorlage.optionId)
	);

	// **Und was knapp ist, steht wieder zur Wahl** (5.95, Punkt 89). Bis hierher endete
	// die Kandidatur an dem Filter darüber: Ein Handwerk, das einmal stand, war für immer
	// vergeben — die Zahl der Betriebe war eine Konstante der Vorlagenliste und keine
	// Größe der Wirtschaft. Eine Bäckerei versorgt aber keine zwanzig Menschen: Im Lauf
	// über 2000 Ticks buk die eine, die entstand, sieben Laibe, während die Stadt tausend
	// gebraucht hätte, und dreiunddreißig verhungerten neben ihr.
	//
	// **Gefragt wird immer, nicht erst, wenn alles steht.** Der erste Anlauf prüfte die
	// Knappheit nur, wenn jedes Handwerk schon vergeben war — und solange irgendeines
	// fehlte, etwa die Alchemistenküche, kam die zweite Bäckerei nie zur Wahl. Eine Stadt
	// verhungert nicht langsamer, weil ihr noch ein Tränkebrauer fehlt. Teuer wird es
	// trotzdem nur, wo ein Nahrungsbetrieb steht (Punkt 67, siehe `knappeHandwerke`).
	//
	// **Gefragt wird seit 5.98 auch nach dem, was noch fehlt** (Punkt 115): Die Knappheit
	// ordnet die Wahl, und dafür muss sie auch das Backhaus kennen, das es noch gar nicht
	// gibt.
	const knapp: BuildingTemplate[] = regionId
		? await supplyService.knappeHandwerke(handwerke, vorhanden, regionId)
		: [];
	for (const vorlage of knapp) {
		if (!kandidaten.includes(vorlage)) kandidaten.push(vorlage);
	}

	const bewertet: {
		optionId: number;
		price: number;
		knapp: boolean;
		koennen: number;
		bedarf: MaterialNeed[];
	}[] = [];
	for (const vorlage of kandidaten) {
		bewertet.push({
			optionId: vorlage.optionId,
			price: levelOf(vorlage, 1).price,
			knapp: knapp.includes(vorlage),
			// Ohne Person oder ohne Fertigkeit in der Vorlage zählt nur der Preis — dann
			// verhält sich die Wahl wie vor 5.19.
			koennen:
				characterId && vorlage.skill ? await skillService.getLevel(characterId, vorlage.skill) : 0,
			// Was der Bau verlangt — leer bei denen, die ihr Material selbst herstellen.
			// Dieselbe Ausnahme wie in `build`, aus derselben Quelle.
			bedarf: vorlage.recipes?.some((rezept) => producesBuildingMaterial(rezept.outputItemId))
				? []
				: materialFor(levelOf(vorlage, 1).price, vorlage.type)
		});
	}

	// **Was die Stadt braucht, vor dem, was er kann** (5.98, Punkt 115). Bis hierher
	// entschied das Können zuerst: Wer Holz bearbeiten konnte, stellte die siebte Zimmerei
	// neben sechs, deren Bretter auf Halde lagen, während die Stadt verhungerte. Das Können
	// ordnet weiterhin — unter dem Knappen und unter dem Übrigen.
	bewertet.sort(
		(a, b) => Number(b.knapp) - Number(a.knapp) || b.koennen - a.koennen || a.price - b.price
	);
	const beste = bewertet[0];

	// **Ein Vorschlag, den niemand bauen kann, ist keiner** (5.87, Punkt 110).
	//
	// Bis hierher endete die Wahl hier, und das war die Sperre der ganzen Wirtschaft: Die
	// Steinmetzhütte verlangt `MINING` und kostet 200, die Schneiderei `TAILORING` und
	// 190. Wer beides nicht gelernt hat — und das ist fast jeder, sobald die Zimmerei
	// vergeben ist —, bekam die zehn Münzen billigere vorgeschlagen. Die braucht Quader,
	// Quader gibt es nur aus einer Steinmetzhütte, und so baute niemand die eine
	// Werkstatt, an der jede andere hängt. Ob eine Stadt je ein Handwerk lernte, entschied
	// der Zufall des Zuzugs.
	//
	// **Gefragt wird erst, wenn es nötig ist** (Punkt 67): Steht ohnehin eine der drei
	// Werkstätten vorn, die kein Material verlangen, kostet das hier keine einzige
	// Abfrage.
	if (!beste || beste.bedarf.length === 0 || !characterId || !regionId) return beste;
	if (await beschaffbar(characterId, regionId, beste.bedarf)) return beste;

	// Was ohne Material auskommt, rückt vor — in derselben Ordnung wie oben. Gibt es
	// nichts dergleichen, bleibt es beim ersten Vorschlag: Ein unerreichbares Ziel ist
	// immer noch ehrlicher als gar keines, und `GOAL_UNREACHABLE` sagt es beim Namen.
	return bewertet.find((kandidat) => kandidat.bedarf.length === 0) ?? beste;
}

/**
 * Eine offene Stelle in einem Betrieb, dessen Ware die Stadt nicht satt bekommt (5.99,
 * Punkt 115).
 *
 * **Dieselbe Knappheit wie bei der Werkstattwahl** (`knappeHandwerke`): gegessen oder
 * verarbeitet, und weniger da, als gebraucht wird. Nur ohne den Schutz gegen die Herde —
 * ein Rohbau desselben Handwerks ist eine Antwort auf die Frage „wer baut die nächste
 * Bäckerei", nicht auf „wer arbeitet in der, die steht".
 *
 * **Und nur, wenn der Arbeitgeber zahlen kann** (`canCarryNewHand`): Wer wechselt, gibt
 * eine Stelle auf. In einen Betrieb, der ihn nicht bezahlt, wechselt keiner.
 *
 * `undefined` auch dann, wenn seine jetzige Stelle schon in einem knappen Betrieb ist —
 * sonst pendelte er zwischen zweien.
 */
async function stelleImKnappenBetrieb(
	npcId: string,
	regionId: string,
	haeuser: Haus[],
	jetzige: { buildingId: string } | undefined
): Promise<{ buildingId: string } | undefined> {
	const handwerke = buildingService
		.getBuildingOptions()
		.filter((vorlage) => vorlage.type === 'CRAFT');
	// Erst, was ohne Knappheitsfrage geht: Gibt es überhaupt eine Handwerksstelle, die den
	// Wechsel lohnt? Meistens nicht, und dann kostet die Frage nichts weiter (Punkt 67).
	const stellen = (await employmentService.getOpenJobs(regionId, npcId)).filter(
		(angebot) =>
			angebot.buildingId !== jetzige?.buildingId &&
			isWorthTaking(angebot.wage, TAGELOHN) &&
			canCarryNewHand(angebot.employerMoney, angebot.wage) &&
			handwerke.some((vorlage) => vorlage.optionId === angebot.optionId)
	);
	if (stellen.length === 0) return undefined;

	const fertige = haeuser.filter(
		(haus) => haus.ownerType === 'CHARACTER' && !haus.underConstruction
	);
	const knapp = await supplyService.knappeHandwerke(handwerke, fertige, regionId);
	if (knapp.length === 0) return undefined;

	if (jetzige) {
		const jetzigesHaus = haeuser.find((haus) => haus.id === jetzige.buildingId);
		if (jetzigesHaus && knapp.some((vorlage) => vorlage.optionId === jetzigesHaus.optionId)) {
			return undefined;
		}
	}
	return stellen.find((angebot) => knapp.some((vorlage) => vorlage.optionId === angebot.optionId));
}

/**
 * Ist das Baumaterial zu haben — aus eigenem Besitz oder vom Markt?
 *
 * Dieselbe Frage, die der NPC beim Bauen wirklich stellt: Er nimmt, was ihm gehört
 * (`getOwnedStock`, 5.25), und kauft den Rest beim billigsten Anbieter. Deshalb zählt
 * beides zusammen und nicht nur das eine.
 */
async function beschaffbar(
	characterId: string,
	regionId: string,
	bedarf: MaterialNeed[]
): Promise<boolean> {
	const vorrat = await tradeService.getOwnedStock(characterId);
	for (const posten of bedarf) {
		const fehlt: number = posten.quantity - (vorrat.get(posten.itemId) ?? 0);
		if (fehlt <= 0) continue;
		const angebot = await tradeService.cheapestOffer(regionId, posten.itemId, characterId);
		if (!angebot || angebot.quantity < fehlt) return false;
	}
	return true;
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
 *
 * **Und gezählt wird alles, was ihm gehört** (5.67) — Inventar wie Gebäudelager. Bis
 * hierher las diese Stelle nur das Inventar, und damit war die Ernte unverkäuflich: Sie
 * liegt seit 5.25 auf dem Hof. Was daraus wurde, stand im Messlauf als Zahl da — 3082
 * Stämme in einem Hof, deren Besitzer keine Werkstatt mehr hatte und deshalb keinen
 * einzigen davon zu Geld machen konnte.
 *
 * **Wie viel Zutat einer behält, sagt sein Kraftvorrat.** Eine Portion je Rezept wäre zu
 * wenig — dann verkaufte ein Zimmermann sein Holz bis auf zwei Stämme und stünde nach
 * einem Durchgang wieder ohne da. Der Deckel des Aktionsbudgets ist das ehrliche Maß:
 * Mehr als `MAX_ACTION_POINTS` Durchgänge kann niemand hintereinander schaffen, ehe er
 * warten muss. Was darüber hinaus im Lager liegt, kann er in absehbarer Zeit nicht
 * verarbeiten — und Rohstoff, den man nicht verarbeitet, gehört auf den Markt, wo ihn
 * einer braucht.
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
			// So viele Durchgänge, wie ein voller Kraftvorrat trägt — siehe oben.
			const durchgaenge: number = Math.max(
				1,
				Math.floor(MAX_ACTION_POINTS / Math.max(1, rezept.actionPointCost))
			);
			for (const zutat of rezept.input) {
				behalten.set(
					zutat.itemId,
					Math.max(behalten.get(zutat.itemId) ?? 0, zutat.quantity * durchgaenge)
				);
			}
		}
	}

	for (const [itemId, menge] of await tradeService.getOwnedStock(characterId)) {
		const vorlage = getItemTemplate(itemId);
		if (!vorlage) continue;

		const noetig: number = (behalten.get(itemId) ?? 0) + (vorlage.nourishment ? EIGENER_VORRAT : 0);
		const uebrig: number = menge - noetig;
		if (uebrig > 0) return { itemId, quantity: uebrig };
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
