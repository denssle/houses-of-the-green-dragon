import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import * as treasuryService from '$lib/server/service/treasuryService';
import { Auction, Bid as BidRow } from '$lib/db/model/auction';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import {
	AUCTION_TICKS,
	award,
	type Bid,
	canBid,
	DEVELOPMENT_SHIFTS_PER_PLOT,
	isUnderDevelopment,
	MAX_PLOTS_PER_DEVELOPMENT,
	type BidInterest,
	type BidLimit,
	nextBid,
	npcBidding,
	npcBidLimit,
	ranking,
	surveyShift
} from '$lib/game/auction.logic';
import { Building } from '$lib/db/model/building';
import { AGE_OF_MAJORITY, ageInYears, TICKS_PER_YEAR } from '$lib/game/time';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as electionService from '$lib/server/service/electionService';
import * as nameService from '$lib/server/service/nameService';
import * as skillService from '$lib/server/service/skillService';
import * as supplyService from '$lib/server/service/supplyService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Erschließung und Versteigerung.
 *
 * Der Bürgermeister lässt Bauland ausweisen, die Stadt zahlt den Leuten, die es herrichten
 * — und was dabei entsteht, geht an den Höchstbietenden. Damit hat die Stadtkasse zum
 * ersten Mal eine Einnahme, die größer sein kann als die Ausgabe: Wie viel, entscheidet
 * die Knappheit.
 *
 * **Der Zuschlag ist eine Rechnung, kein gespeicherter Zustand** — das höchste Gebot,
 * dessen Bieter noch zahlen kann. Wer inzwischen sein Geld ausgegeben hat, wird
 * übergangen; der Nächste rückt nach, genau wie bei der Amtsnachfolge aus 4.7a. Dadurch
 * braucht es keine Reservierung, die mitgeführt werden müsste.
 */

export type AuctionResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/** Die Namen für neue Gassen — in dieser Reihenfolge vergeben. */
const NEUE_GASSEN = [
	'Neustadt',
	'Hinter der Mauer',
	'Lehmgrube',
	'Brunnenweg',
	'Lange Zeile',
	'Krummer Winkel'
] as const;

export type DevelopResult =
	| { ok: true; plots: number; spent: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Bauland ausweisen — die dritte Amtshandlung, und seit 5.92 die einzige ohne Preis.
 *
 * **Was hier entsteht, ist eine Baustelle** (Punkt 102). Bis 5.91 zog die Stadt sechzig
 * Münzen je Parzelle aus ihrer Kasse, und niemand bekam sie: Von den vier Wegen, auf denen
 * Geld aus der Welt verschwand, war das nach 5.76, 5.78 und 5.80 der letzte — und er trug
 * im Messlauf nach 5.89 **den ganzen vernichteten Betrag**. Jetzt kostet die Erschließung,
 * was sie an Arbeit kostet: zwanzig Schichten je Grundstück, bezahlt zum Tagelohn an die,
 * die sie leisten (`surveyForHire`).
 *
 * **Und deshalb braucht sie keine Deckung mehr.** Die alte Prüfung verlangte den vollen
 * Preis im Voraus, und das war in Grünau die Sperre, hinter der die ganze Stadt stand: 13
 * Münzen in der Kasse, 180 nötig, seit Tick 5291 keine einzige Erschließung — während die
 * halbe Einwohnerschaft `GOAL_UNREACHABLE` meldete, weil es kein Bauland gab (Punkt 93).
 * Löhne fallen schichtweise an und werden schichtweise geprüft; eine leere Kasse verzögert
 * die Erschließung jetzt, statt sie zu verbieten.
 *
 * Die Grundstücke gehen anschließend in die Versteigerung, nicht in den Verkauf — aber
 * erst, wenn sie fertig sind. Deshalb ist die Erschließung kein sicheres Geschäft: Sind
 * alle satt, bleibt die Stadt auf dem Lohn sitzen, den sie gezahlt hat.
 */
export async function developLand(
	characterId: string,
	regionId: string,
	count: number
): Promise<DevelopResult> {
	const tick: number = await worldService.currentTick();

	const inhaber = await electionService.getHolder(regionId);
	if (inhaber?.characterId !== characterId) return { ok: false, reason: 'NOT_IN_OFFICE' };
	if (!Number.isInteger(count) || count < 1 || count > MAX_PLOTS_PER_DEVELOPMENT) {
		return { ok: false, reason: 'NOTHING_TO_DO' };
	}

	return sequelize.transaction(async (t: Transaction) => {
		const stadt = await Region.findByPk(regionId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!stadt) return { ok: false, reason: 'NOT_IN_OFFICE' } as const;

		// **Eine Baustelle nach der anderen** (5.92). Was nichts kostet, hat keine
		// natürliche Bremse mehr — ohne diese Frage wiese ein Bürgermeister in jedem Tick
		// zwei neue Parzellen aus, solange kein Bauland frei ist, und die Stadt hätte
		// hundert angefangene Wege statt eines fertigen Grundstücks.
		if (await developmentRunning(regionId, t)) {
			return { ok: false, reason: 'NOTHING_TO_DO' } as const;
		}

		// Die Adresse ergibt sich aus dem, was schon steht: erst die Gasse auffüllen, dann
		// die nächste anfangen. Sonst hieße jedes neue Grundstück „Neustadt 1".
		const vorhanden: number = await Plot.count({ where: { RegionId: regionId }, transaction: t });
		for (let i = 0; i < count; i++) {
			const laufend: number = vorhanden + i;
			const gasse: string = NEUE_GASSEN[Math.floor(laufend / 4) % NEUE_GASSEN.length];
			const hausnummer: number = (laufend % 4) + 1;

			await Plot.create(
				{
					id: randomUUID(),
					address: `${gasse} ${hausnummer}`,
					type: 'BUILDING_LAND',
					RegionId: regionId,
					ownerType: 'NONE',
					// Der erste Tag der Baustelle — nicht ihr Fehlen (siehe Migration 0026).
					developmentShifts: 0
				},
				{ transaction: t }
			);
		}

		// **Die Versteigerung fängt hier nicht an**, sondern mit der letzten Schicht in
		// `surveyForHire()`. Wer
		// auf eine Fläche bietet, auf der noch die Vermesser stehen, bekäme einen Zuschlag
		// auf etwas, worauf er nicht bauen darf.
		await chronicleService.record(
			'LAND_DEVELOPED',
			regionId,
			tick,
			{ subjectId: characterId, value: count },
			t
		);
		return { ok: true, plots: count, spent: 0 } as const;
	});
}

/** Läuft in dieser Stadt gerade eine Erschließung? */
export async function developmentRunning(regionId: string, t?: Transaction): Promise<boolean> {
	const offen: number = await Plot.count({
		where: { RegionId: regionId, developmentShifts: { [Op.ne]: null } },
		...(t ? { transaction: t } : {})
	});
	return offen > 0;
}

/** Die Baustellen der Stadt — was an Erschließung offen ist, in der Reihenfolge ihrer Adresse. */
export async function getDevelopments(regionId: string): Promise<DevelopmentSite[]> {
	const flaechen = await Plot.findAll({
		where: { RegionId: regionId, developmentShifts: { [Op.ne]: null } },
		order: [['address', 'ASC']]
	});
	return flaechen.map((flaeche) => ({
		id: flaeche.dataValues.id,
		address: flaeche.dataValues.address,
		shifts: flaeche.dataValues.developmentShifts ?? 0,
		shiftsNeeded: DEVELOPMENT_SHIFTS_PER_PLOT
	}));
}

export interface DevelopmentSite {
	id: string;
	address: string;
	shifts: number;
	shiftsNeeded: number;
}

export type SurveyResult =
	| { ok: true; earned: number; finished: boolean }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Schicht auf einer Erschließung leisten — gegen Lohn aus der Stadtkasse (5.92).
 *
 * **Das Gegenstück zu `REPAIR_FOR_HIRE`**, und aus demselben Grund gebaut: Die Stadt hat
 * das Erschließen immer schon bezahlt, nur zahlte sie an niemanden. Jetzt zahlt sie
 * Menschen — und dieselbe Arbeit, die das Leck schließt, ist der Rückweg aus der
 * Stadtkasse zu den Bürgern, der ihr in Punkt 100 fehlt.
 *
 * **Jeder darf**, ohne Aushang und ohne Anstellung: Es ist städtische Arbeit wie die
 * Instandsetzung eines öffentlichen Baus. Und wer die letzte Schicht leistet, macht das
 * Grundstück fertig — die Versteigerung beginnt in derselben Transaktion.
 */
export async function surveyForHire(characterId: string, plotId: string): Promise<SurveyResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const flaeche = await Plot.findByPk(plotId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!flaeche) return { ok: false, reason: 'NOT_A_WORKPLACE' } as const;
		if (!isUnderDevelopment(flaeche.dataValues)) {
			return { ok: false, reason: 'NOTHING_TO_DO' } as const;
		}

		const regionId: string = flaeche.dataValues.RegionId;
		const stadt = await Region.findByPk(regionId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!stadt) return { ok: false, reason: 'NOT_A_WORKPLACE' } as const;

		// Erst nachwachsen lassen, dann abrechnen — dieselbe Reihenfolge wie bei jeder
		// anderen Schicht: Sonst ginge sie gegen den Punktestand von gestern.
		const arbeiter = await characterService.loadForAction(characterId, tick, t);
		if (!arbeiter) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const ergebnis = surveyShift(
			{
				actionPoints: arbeiter.dataValues.actionPoints,
				money: arbeiter.dataValues.money,
				buildingSkill: await skillService.getLevel(characterId, 'CONSTRUCTION', t)
			},
			{ treasury: stadt.dataValues.treasury ?? 0 },
			flaeche.dataValues.developmentShifts ?? 0
		);
		if (!ergebnis.ok) return ergebnis;

		await arbeiter.update(
			{ actionPoints: ergebnis.actionPoints, money: ergebnis.money },
			{ transaction: t }
		);
		// **Gebucht wird als das, was es ist**: Lohn an einen Menschen (Punkt 101). Der
		// Grund `DEVELOPMENT` ist mit diesem Schritt ersatzlos gestrichen — es gibt keine
		// Ausgabe mehr, die ihn bucht, und ein Kassenbuch mit einem Posten, den nichts je
		// bucht, liest sich im Bericht wie „ist nie vorgekommen" (die Lehre aus 5.79).
		await treasuryService.ausgeben(regionId, ergebnis.earned, 'WAGE', t);
		// Wer Wege baut, lernt das Bauen — wie an jeder anderen Baustelle auch.
		await skillService.addPractice(characterId, 'CONSTRUCTION', 1, t);

		const fertig: boolean = ergebnis.shifts >= DEVELOPMENT_SHIFTS_PER_PLOT;
		await flaeche.update(
			{ developmentShifts: fertig ? null : ergebnis.shifts },
			{ transaction: t }
		);
		if (fertig) {
			await Auction.create(
				{
					id: randomUUID(),
					PlotId: plotId,
					RegionId: regionId,
					openedTick: tick,
					closesTick: tick + AUCTION_TICKS,
					closed: false
				},
				{ transaction: t }
			);
			await chronicleService.record(
				'LAND_SURVEYED',
				regionId,
				tick,
				{ subjectId: characterId, value: 1, detail: flaeche.dataValues.address },
				t
			);
		}

		return { ok: true, earned: ergebnis.earned, finished: fertig } as const;
	});
}

/**
 * Wie lange die Stadt wartet, ehe sie ein Haus erneut ausbietet.
 *
 * Findet sich kein Käufer, wird die Versteigerung ohne Zuschlag geschlossen — und ohne
 * Frist stünde dasselbe Haus im nächsten Tick wieder unter dem Hammer, ein Spieljahr lang
 * fünfzig Mal. Ein Jahr Abstand macht daraus, was es sein soll: ein neuer Anlauf, wenn
 * jemand inzwischen Geld hat.
 */
export const RE_AUCTION_AFTER = TICKS_PER_YEAR;

/**
 * Was der Stadt zugefallen ist, kommt unter den Hammer (Punkt 79).
 *
 * **Warum überhaupt.** Wer ohne Erben stirbt, dessen Häuser und Grundstücke gehen an die
 * Stadt — nicht ins Nichts und nicht an einen zufälligen Nachbarn. Nur endete der Weg
 * dort: `ownerType` stand auf `CITY`, und niemand holte den Besitz je zurück. Bei knappem
 * Bauland ist das der teuerste Teil, denn ein bebautes Grundstück nimmt kein zweites Haus
 * auf; jeder erbenlose Tod war ein Bauplatz weniger, für immer.
 *
 * **Versteigert, nicht verkauft** — dieselbe Vergabe wie beim erschlossenen Bauland. Der
 * Preis entsteht aus der Knappheit, und die Stadtkasse bekommt, was die Stadt für die
 * Beerdigung ausgelegt hat, in anderer Form zurück.
 *
 * **Was aus einem Nachlass kommt, bebaut oder nicht.** Freier Grund, der der Stadt von
 * jeher gehört, bleibt, wo er ist: Aus ihm baut der Bürgermeister Schule und Unterkunft
 * (`getFreeCityPlots`). Bis 5.101 hieß das auch: **jeder leere Bauplatz** — denn ein
 * heimgefallener sah aus wie ursprünglicher Stadtgrund. Im Messlauf zu 5.99 waren das 27
 * Bauplätze eines Verstorbenen, die nie wieder vergeben wurden (Punkt 113). Seitdem trägt
 * auch das Grundstück den Tick seines Heimfalls.
 *
 * Läuft im Takt, nicht als Amtshandlung: „So bald wie möglich" darf nicht daran hängen,
 * dass ein Bürgermeister im Amt ist und gerade diese eine Handlung wählt.
 */
export async function auctionEscheatedEstates(regionId: string, tick: number): Promise<number> {
	const heimgefallen = await buildingService.getEscheatedBuildings(regionId);
	const leerePlaetze = await Plot.findAll({
		where: {
			RegionId: regionId,
			type: 'BUILDING_LAND',
			ownerType: 'CITY',
			escheatedTick: { [Op.ne]: null }
		},
		attributes: ['id']
	});
	const plotIds: string[] = heimgefallen.flatMap((haus) => (haus.plotId ? [haus.plotId] : []));
	for (const platz of leerePlaetze) {
		// **Nur, was wirklich leer ist.** Hat der Bürgermeister zwischen zwei Versteigerungen
		// eine Schule daraufgestellt, gehört der Platz jetzt zu ihr — sie käme sonst mit
		// unter den Hammer.
		if ((await Building.count({ where: { PlotId: platz.dataValues.id } })) === 0) {
			plotIds.push(platz.dataValues.id);
		}
	}

	let eroeffnet = 0;
	for (const plotId of new Set(plotIds)) {
		// Läuft schon eine — oder ist gerade eine ohne Zuschlag geschlossen worden?
		const letzte = await Auction.findOne({
			where: { PlotId: plotId },
			order: [['openedTick', 'DESC']]
		});
		if (letzte && !letzte.dataValues.closed) continue;
		if (letzte && tick - letzte.dataValues.closesTick < RE_AUCTION_AFTER) continue;

		await Auction.create({
			id: randomUUID(),
			PlotId: plotId,
			RegionId: regionId,
			openedTick: tick,
			closesTick: tick + AUCTION_TICKS,
			closed: false
		});
		eroeffnet++;
	}
	return eroeffnet;
}

// --- Bieten --------------------------------------------------------------------------

async function gebote(auctionId: string, t?: Transaction): Promise<Bid[]> {
	const zeilen = await BidRow.findAll({ where: { AuctionId: auctionId }, transaction: t });
	return zeilen.map((zeile) => ({
		bidderId: zeile.dataValues.CharacterId,
		amount: zeile.dataValues.amount,
		tick: zeile.dataValues.tick
	}));
}

export async function bid(
	characterId: string,
	auctionId: string,
	amount: number
): Promise<AuctionResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const auktion = await Auction.findByPk(auctionId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!auktion) return { ok: false, reason: 'NOT_FOR_SALE' } as const;

		const bieter = await Character.findByPk(characterId, { transaction: t });
		if (!bieter) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const bisher: Bid[] = await gebote(auctionId, t);
		const bestes: Bid | undefined = ranking(bisher)[0];

		const geprueft = canBid(
			{ money: bieter.dataValues.money, isHighest: bestes?.bidderId === characterId },
			{
				open: !auktion.dataValues.closed && tick < auktion.dataValues.closesTick,
				highest: bestes?.amount ?? null
			},
			amount
		);
		if (!geprueft.ok) return geprueft;

		// Ein Bieter, eine Zeile: Ein neues Gebot ersetzt sein altes.
		await BidRow.upsert(
			{ AuctionId: auctionId, CharacterId: characterId, amount, tick },
			{ transaction: t }
		);
		return { ok: true } as const;
	});
}

// --- Zuschlag ------------------------------------------------------------------------

export interface AuctionTick {
	closed: number;
	awarded: number;
}

/**
 * Fällige Versteigerungen zuschlagen.
 *
 * Vorher bieten die NPCs — wie beim Wählen erst zum Schluss: Ein Gebot ist eine
 * Entscheidung, und wer sie am ersten Tag trifft, hatte nur weniger Zeit, sich den Preis
 * anzusehen.
 */
export async function advanceAuctions(regionId: string, tick: number): Promise<AuctionTick> {
	const faellige = await Auction.findAll({
		where: { RegionId: regionId, closed: false, closesTick: { [Op.lte]: tick } }
	});

	let zugeschlagen = 0;
	for (const auktion of faellige) {
		await npcsBietenLassen(auktion.dataValues.id, regionId, tick);

		const alle: Bid[] = await gebote(auktion.dataValues.id);
		const kassen = new Map<string, number>();
		for (const gebot of alle) {
			const person = await Character.findByPk(gebot.bidderId);
			// Ein Toter zahlt nicht — sein Gebot fällt beim Zuschlag heraus, ohne dass es
			// jemand löschen müsste.
			if (person && person.dataValues.deathTick === null) {
				kassen.set(gebot.bidderId, person.dataValues.money);
			}
		}

		const sieger: Bid | undefined = award(alle, kassen);
		await auktion.update({ closed: true });
		if (!sieger) continue;

		await sequelize.transaction(async (t: Transaction) => {
			await Character.increment('money', {
				by: -sieger.amount,
				where: { id: sieger.bidderId },
				transaction: t
			});
			await treasuryService.einnehmen(regionId, sieger.amount, 'AUCTION', t);
			// Der Heimfall ist mit dem Zuschlag vorbei (5.101).
			await Plot.update(
				{ ownerType: 'CHARACTER', OwnerCharacterId: sieger.bidderId, escheatedTick: null },
				{ where: { id: auktion.dataValues.PlotId }, transaction: t }
			);
			// **Das Haus wechselt mit dem Boden** (Punkt 79). Bei erschlossenem Bauland steht
			// keines darauf; bei einem heimgefallenen Nachlass schon, und ohne diese Zeile
			// gehörte der Grund dem Ersteigerer und die Kate weiter der Stadt. Zwei
			// Eigentümer für ein Anwesen sind kein Zustand, den das Spiel kennt.
			await Building.update(
				{ ownerType: 'CHARACTER', OwnerCharacterId: sieger.bidderId, forSalePrice: null },
				{ where: { PlotId: auktion.dataValues.PlotId, ownerType: 'CITY' }, transaction: t }
			);
			await chronicleService.record(
				'AUCTION_WON',
				regionId,
				tick,
				{ subjectId: sieger.bidderId, value: sieger.amount },
				t
			);
		});
		zugeschlagen++;
	}

	return { closed: faellige.length, awarded: zugeschlagen };
}

/**
 * NPCs bieten mit.
 *
 * Sonst wäre jede Versteigerung ohne anwesenden Spieler eine Formsache, und die Stadt
 * bekäme für ihr erschlossenes Land nie mehr als das Mindestgebot.
 *
 * **Mitbieten darf seit 5.97 jeder Volljährige, der zahlen kann** (Punkt 113). Bis dahin
 * bot nur, wer noch kein Grundstück hatte — für Bauland plausibel, für einen Betrieb
 * verkehrt: Der einzige Bäcker der Stadt besaß ein Wohnhaus und durfte deshalb die
 * heimgefallene Bäckerei nicht ersteigern. Sie kam fünfzehnmal unter den Hammer, ohne ein
 * Gebot.
 *
 * **Wie weit einer geht, hängt an seinem Nutzen** (`interesseAn`), und ausgemacht wird es
 * als Steigerung (`npcBidding`): Es steht am Ende genau ein Gebot, das des Bieters mit dem
 * höchsten Limit, einen Schritt über dem Zweiten.
 */
async function npcsBietenLassen(
	auctionId: string,
	regionId: string,
	tick: number
): Promise<number> {
	const auktion = await Auction.findByPk(auctionId);
	if (!auktion) return 0;
	const haus = await Building.findOne({ where: { PlotId: auktion.dataValues.PlotId } });
	const vorlage = haus ? buildingService.getBuildingOption(haus.dataValues.optionId) : undefined;
	// Einmal je Versteigerung, nicht je Bieter: Die Knappheit ist eine Frage an die Stadt.
	const knapp: boolean =
		vorlage?.type === 'CRAFT' &&
		(
			await supplyService.knappeHandwerke(
				[vorlage],
				await buildingService.getBuildingsInRegion(regionId),
				regionId
			)
		).length > 0;

	const npcs = await Character.findAll({
		where: { RegionId: regionId, deathTick: null, role: 'NPC', money: { [Op.gt]: 0 } }
	});

	const limits: BidLimit[] = [];
	for (const npc of npcs) {
		const werte = npc.dataValues;
		if (ageInYears(werte.birthTick, tick) < AGE_OF_MAJORITY) continue;
		const interesse: BidInterest = await interesseAn(werte.id, vorlage, knapp);
		limits.push({ bidderId: werte.id, limit: npcBidLimit(werte.money, interesse) });
	}

	const bestes: Bid | null = ranking(await gebote(auctionId))[0] ?? null;
	const wahl = npcBidding(limits, bestes);
	if (!wahl) return 0;

	await BidRow.upsert({
		AuctionId: auctionId,
		CharacterId: wahl.bidderId,
		amount: wahl.amount,
		tick
	});
	return 1;
}

/**
 * Will er auf dem Bauland etwas bauen? (5.100, Punkt 113)
 *
 * **Haben ist nur dann besser als brauchen, wenn einer etwas damit vorhat.** Bis hierher
 * bot für Bauland jeder mit — wer schon Grund hatte, mit „geringem Interesse". Im Messlauf
 * zu 5.99 ging das so aus: Ein einziger reicher Zimmerer mit Haus und Werkstatt ersteigerte
 * 27 von 39 Bauplätzen, weil fünf Prozent von 1500 Münzen mehr sind als ein Viertel von
 * 200, und baute auf keinem. Alle anderen Käufer bauten sofort.
 *
 * Vorhaben heißt: **ein eigenes Dach** oder **eine eigene Werkstatt**, wo noch keine steht.
 * Und wer schon einen unbebauten Bauplatz hat, braucht keinen zweiten — er hat ja, wo er
 * bauen kann.
 *
 * **Was hier fehlt, ist festgehalten:** Ein Unternehmer, der einen zweiten Betrieb gründet
 * und Leute einstellt, kommt in der Entscheidungslogik nicht vor. Sobald es ihn gibt,
 * gehört er hierher.
 */
async function bauabsicht(characterId: string): Promise<BidInterest> {
	const grund = await Plot.findAll({
		where: { OwnerCharacterId: characterId, type: 'BUILDING_LAND' },
		attributes: ['id']
	});
	for (const flaeche of grund) {
		const bebaut = await Building.count({ where: { PlotId: flaeche.dataValues.id } });
		if (bebaut === 0) return 'NONE';
	}

	const eigene = await buildingService.getBuildingsOfCharacter(characterId);
	const hat = (typ: string): boolean =>
		eigene.some((eigenes) => buildingService.getBuildingOption(eigenes.optionId)?.type === typ);
	return hat('RESIDENCE') && hat('CRAFT') ? 'NONE' : 'MEDIUM';
}

/**
 * Was einem NPC das Versteigerte nützt (5.97, Punkt 113).
 *
 * - **Ein Betrieb**: viel, wer sein Handwerk kann — er holt daraus, was ein Anfänger nicht
 *   schafft. Ist die Ware knapp, will ihn auch, wer keine eigene Werkstatt hat, aber nur
 *   mittel: **Das Können geht der Knappheit vor**, sonst setzte bei Brotmangel jeder die
 *   Hälfte seines Geldes auf die Bäckerei, und sie ginge wieder an den Reichsten statt an
 *   den Bäcker.
 * - **Ein Wohnhaus**: viel, wer kein eigenes Dach hat.
 * - **Bauland**: mittel, wer darauf etwas bauen will; sonst nichts (`bauabsicht`).
 * - **Alles andere**: wenig. Damit bleibt kein Nachlass liegen, nur weil gerade niemand
 *   Passendes in der Stadt lebt.
 */
async function interesseAn(
	characterId: string,
	vorlage: BuildingTemplate | undefined,
	knapp: boolean
): Promise<BidInterest> {
	if (!vorlage) return bauabsicht(characterId);

	if (vorlage.type === 'CRAFT') {
		if (vorlage.skill && (await skillService.getLevel(characterId, vorlage.skill)) > 0) {
			return 'HIGH';
		}
		if (!knapp) return 'LOW';
		const eigene = await buildingService.getBuildingsOfCharacter(characterId);
		const hatWerkstatt: boolean = eigene.some(
			(eigenes) => buildingService.getBuildingOption(eigenes.optionId)?.type === 'CRAFT'
		);
		return hatWerkstatt ? 'LOW' : 'MEDIUM';
	}

	if (vorlage.type === 'RESIDENCE') {
		const eigene = await buildingService.getBuildingsOfCharacter(characterId);
		const hatDach: boolean = eigene.some(
			(eigenes) => buildingService.getBuildingOption(eigenes.optionId)?.type === 'RESIDENCE'
		);
		return hatDach ? 'LOW' : 'HIGH';
	}

	return 'LOW';
}

// --- Anzeigen ------------------------------------------------------------------------

export interface AuctionOnList {
	id: string;
	address: string;
	closesTick: number;
	/**
	 * Das Haus, das mitversteigert wird — bei erschlossenem Bauland keines (Punkt 79).
	 *
	 * Ohne diese Angabe böte man auf „Erbgasse 3" und bekäme eine Kate dazu, von der auf
	 * der Seite nichts stand. Was ein Anwesen wert ist, hängt daran.
	 */
	buildingName: string | null;
	highest: number | null;
	highestBidderName: string | null;
	mine: boolean;
	nextBid: number;
}

export async function getOpenAuctions(
	regionId: string,
	viewerId?: string
): Promise<AuctionOnList[]> {
	const offene = await Auction.findAll({
		where: { RegionId: regionId, closed: false },
		order: [['closesTick', 'ASC']]
	});

	const liste: AuctionOnList[] = [];
	for (const auktion of offene) {
		const flaeche = await Plot.findByPk(auktion.dataValues.PlotId);
		if (!flaeche) continue;

		const bestes: Bid | undefined = ranking(await gebote(auktion.dataValues.id))[0];
		const bieter = bestes ? await Character.findByPk(bestes.bidderId) : null;

		const haus = await Building.findOne({ where: { PlotId: auktion.dataValues.PlotId } });

		liste.push({
			id: auktion.dataValues.id,
			address: flaeche.dataValues.address,
			closesTick: auktion.dataValues.closesTick,
			buildingName: haus?.dataValues.name ?? null,
			highest: bestes?.amount ?? null,
			// Mit Hausnamen (5.10): Gegen wen man bietet, ist bei einer Versteigerung unter
			// Familien die eigentliche Auskunft.
			highestBidderName: bieter
				? ((await nameService.displayName(bieter.dataValues.id)) ?? null)
				: null,
			mine: bestes?.bidderId === viewerId,
			nextBid: nextBid(bestes?.amount ?? null)
		});
	}
	return liste;
}
