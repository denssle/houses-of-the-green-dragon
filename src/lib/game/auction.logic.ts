import type { ActionFailureReason } from '$lib/game/actionFailure';
import { canAfford, TAGELOHN } from '$lib/game/economy';
import { REPAIR_ACTION_POINT_COST, repairWage } from '$lib/game/buildingAction.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Erschließung und Versteigerung.
 *
 * **Neues Bauland ist eine Amtshandlung, seine Vergabe ein Wettbewerb.** Der
 * Bürgermeister lässt Grundstücke ausweisen — die Stadt wächst in ihr Umland hinein —,
 * und wer darauf bauen darf, entscheidet das höchste Gebot. Damit hat das Amt eine dritte
 * Aufgabe, und die Stadtkasse bekommt zum ersten Mal eine Einnahme, die größer sein kann
 * als die Ausgabe.
 *
 * **Und seit 5.92 ist das Ausweisen selbst Arbeit** (Punkt 102): Was der Bürgermeister
 * beschließt, ist eine Baustelle, kein Kauf. Vermesser und Wegebauer machen daraus in
 * zwanzig Schichten ein Grundstück, die Stadt zahlt ihnen Tagelohn — und erst das fertige
 * Grundstück kommt unter den Hammer.
 *
 * **Das Höchstgebot gewinnt — wenn es zahlen kann.** Wer beim Zuschlag nicht mehr genug
 * hat, wird übergangen, und der Nächste rückt nach. Dieselbe Rechnung wie bei der
 * Amtsnachfolge (4.7a): Es gibt keine Reservierung von Geld, die mitgeführt werden
 * müsste, und keinen Zustand, der von der Wirklichkeit abweichen kann. Wer bietet, ohne
 * zu zahlen, verliert nichts außer dem Zuschlag — und das ist die einzige Strafe, die
 * ohne ein Schuldrecht auskommt.
 */

/**
 * Wie viele Schichten ein Grundstück bis zur Erschließung braucht.
 *
 * **Erschließen ist Arbeit — Wege, Gräben, Vermessung**, und seit 5.92 ist das keine
 * Redewendung mehr, sondern die Rechnung (Punkt 102). Bis dahin zog die Stadt sechzig
 * Münzen je Parzelle aus ihrer Kasse und niemand bekam sie; im Messlauf nach 5.89 war das
 * der **einzige** verbliebene Weg, auf dem Geld aus der Welt verschwand — hundert Prozent
 * des vernichteten Betrags.
 *
 * **Zwanzig Schichten, wie beim Rohbau** (5.76): Zum Tagelohn sind das sechzig Münzen,
 * und damit liegt die Erschließung genau dort, wo ihr Münzpreis lag. Das ist Absicht —
 * der nächste Messlauf soll zeigen, wohin dasselbe Geld fließt, und nicht, dass
 * Erschließen billiger wurde.
 */
export const DEVELOPMENT_SHIFTS_PER_PLOT = 20;

/**
 * Was eine Erschließung die Stadt an Lohn kostet — die Zahl, die früher der Preis war.
 *
 * Gebraucht wird sie nicht mehr beim Beschließen (dort kostet nichts mehr, siehe
 * `developLand`), sondern für die **Rücklage** des Bürgermeisters: Sie ist der Maßstab,
 * an dem er misst, ob seine Kasse knapp oder üppig ist (`treasuryReserve`).
 */
export function developmentWageBill(plots: number): number {
	return plots * DEVELOPMENT_SHIFTS_PER_PLOT * TAGELOHN;
}

/** Ob auf dieser Fläche noch erschlossen wird — die Frage, nicht die Zahl. */
export function isUnderDevelopment(plot: { developmentShifts: number | null }): boolean {
	return plot.developmentShifts !== null;
}

export type SurveyOutcome =
	| {
			ok: true;
			actionPoints: number;
			money: number;
			earned: number;
			treasury: number;
			shifts: number;
	  }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Schicht auf einer Erschließung — Vermessen, Graben, Wegebau (5.92).
 *
 * **Dieselbe Bauart wie `repairForHire`**, und das ist kein Zufall: Es ist dieselbe
 * Abmachung. Einer legt einen Aktionspunkt hinein, der Auftraggeber zahlt, und am Ende
 * steht etwas, das vorher nicht da war. Hier ist der Auftraggeber immer die Stadt — Boden
 * weist niemand sonst aus —, und deshalb steht hier auch kein Aushang: Es gilt der
 * Tagelohn, wie an jedem städtischen Bau.
 *
 * **Der Lohn ist derselbe Betrag wie dort** (`repairWage`, Aushang mal Können), und zwar
 * aus der Lehre von 5.82: Wer die Deckung prüft, muss dieselbe Zahl ausrechnen wie der,
 * der zahlt. Eine zweite Lohnformel wäre eine zweite Gelegenheit, dass beide auseinander
 * laufen.
 */
export function surveyShift(
	worker: { actionPoints: number; money: number; buildingSkill: number },
	city: { treasury: number },
	shiftsDone: number
): SurveyOutcome {
	if (shiftsDone >= DEVELOPMENT_SHIFTS_PER_PLOT) return { ok: false, reason: 'NOTHING_TO_DO' };
	if (worker.actionPoints < REPAIR_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}

	const lohn: number = repairWage(TAGELOHN, worker.buildingSkill);
	if (!canAfford(city.treasury, lohn)) return { ok: false, reason: 'EMPLOYER_BROKE' };

	return {
		ok: true,
		actionPoints: worker.actionPoints - REPAIR_ACTION_POINT_COST,
		money: worker.money + lohn,
		earned: lohn,
		treasury: city.treasury - lohn,
		shifts: shiftsDone + 1
	};
}

/** Wie viele Grundstücke eine Erschließung höchstens auf einmal ausweist. */
export const MAX_PLOTS_PER_DEVELOPMENT = 4;

/**
 * Wie lange eine Versteigerung läuft.
 *
 * Ein halbes Spieljahr — ein Realtag. Kurz genug, dass die Stadt nicht monatelang auf
 * ihr Geld wartet, lang genug, dass auch mitbieten kann, wer nur abends hereinschaut.
 */
export const AUCTION_TICKS: number = Math.round(TICKS_PER_YEAR / 2);

/**
 * Unter diesem Gebot geht nichts weg — **eine Münze** (5.97, Punkt 113).
 *
 * Bis hierher stand hier der Grundstückspreis, vierzig Münzen. Zusammen mit dem Viertel,
 * das ein NPC höchstens bot, hieß das: Mitbieten kann nur, wer 160 Münzen hat. Im Messlauf
 * zu 5.95 kam die heimgefallene Bäckerei fünfzehnmal unter den Hammer und bekam kein
 * einziges Gebot. Den Preis soll die Konkurrenz machen, nicht eine Schwelle: Wer etwas
 * wirklich will, bietet hoch, und wer allein ist, bekommt es billig.
 */
export const MINIMUM_BID = 1;

/**
 * Um wie viel ein Gebot das bisherige übertreffen muss.
 *
 * Ohne Mindestschritt endete jede Versteigerung in einem Wettlauf um einzelne Münzen —
 * bei Spielern, die zu verschiedenen Zeiten online sind, gewönne schlicht der, der
 * zuletzt hereinschaut.
 */
export const BID_INCREMENT = 5;

export type BidOutcome = { ok: true } | { ok: false; reason: ActionFailureReason };

export function canBid(
	bidder: { money: number; isHighest: boolean },
	auction: { open: boolean; highest: number | null },
	amount: number
): BidOutcome {
	if (!auction.open) return { ok: false, reason: 'NOT_FOR_SALE' };
	if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'NOTHING_TO_DO' };

	const noetig: number = auction.highest === null ? MINIMUM_BID : auction.highest + BID_INCREMENT;
	if (amount < noetig) return { ok: false, reason: 'BID_TOO_LOW' };
	// Geboten wird nur, was man hat. Das ist keine Reservierung — bis zum Zuschlag darf
	// er das Geld ausgeben und verliert dann eben den Zuschlag.
	if (bidder.money < amount) return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	// Sich selbst zu überbieten treibt nur den eigenen Preis.
	if (bidder.isHighest) return { ok: false, reason: 'ALREADY_OWNED' };

	return { ok: true };
}

/** Was als Nächstes geboten werden müsste. */
export function nextBid(highest: number | null): number {
	return highest === null ? MINIMUM_BID : highest + BID_INCREMENT;
}

/** Ein Gebot, wie es die Ablage hergibt. */
export interface Bid {
	bidderId: string;
	amount: number;
	tick: number;
}

/**
 * Die Reihenfolge beim Zuschlag.
 *
 * Höchstes Gebot zuerst; bei gleichem Betrag das ältere — wer zuerst so weit ging, war
 * zuerst bereit. Je Bieter zählt nur sein höchstes Gebot: Sonst stünde derselbe Mann
 * dreimal in der Reihe und rückte hinter sich selbst nach.
 */
export function ranking(bids: Bid[]): Bid[] {
	const bestes = new Map<string, Bid>();
	for (const gebot of bids) {
		const bisher = bestes.get(gebot.bidderId);
		if (!bisher || gebot.amount > bisher.amount) bestes.set(gebot.bidderId, gebot);
	}

	return [...bestes.values()].sort((a, b) => {
		if (b.amount !== a.amount) return b.amount - a.amount;
		return a.tick - b.tick;
	});
}

/**
 * Wer den Zuschlag bekommt.
 *
 * Der Höchstbietende, der noch zahlen kann. Wer inzwischen zu wenig hat, wird übergangen
 * — ohne Strafe, aber ohne Grundstück.
 */
export function award(bids: Bid[], purse: Map<string, number>): Bid | undefined {
	return ranking(bids).find((gebot) => (purse.get(gebot.bidderId) ?? 0) >= gebot.amount);
}

/**
 * Wie sehr ein NPC etwas will — und damit, wie hoch er geht (5.97, Punkt 113).
 *
 * - **`HIGH`**: Er kann damit etwas anfangen, das er sonst nicht hat — das Handwerk des
 *   Betriebs, dessen Ware knapp ist, oder das erste eigene Dach.
 * - **`MEDIUM`**: Er hat Verwendung, aber keine dringende — Bauland für den, der noch
 *   keinen Grund besitzt.
 * - **`LOW`**: Er nähme es, wenn es billig ist. Damit bleibt kein Nachlass liegen, nur
 *   weil gerade niemand Passendes in der Stadt ist.
 */
export type BidInterest = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Welchen Teil seines Geldes ein NPC dafür einsetzt.
 *
 * **Das Viertel ist geblieben, für den mittleren Fall.** Bis 5.97 bot jeder pauschal ein
 * Viertel seines Vermögens, gleich ob er mit dem Grundstück etwas anfangen konnte — wer am
 * meisten hatte, bekam den Zuschlag, und die Bäckerei ging an den Reichsten statt an den
 * Bäcker. Die Hälfte für den, der es braucht, ist die Obergrenze, unter der er nicht
 * verhungert: Ein Brot kostet vier Münzen, und wer hundert hat, behält fünfzig.
 */
export const NPC_BID_SHARE: Record<BidInterest, number> = {
	HIGH: 0.5,
	MEDIUM: 0.25,
	LOW: 0.05
};

/** Wie weit ein NPC höchstens geht. */
export function npcBidLimit(money: number, interest: BidInterest): number {
	return Math.floor(Math.max(0, money) * NPC_BID_SHARE[interest]);
}

/** Was ein NPC höchstens zu zahlen bereit ist — eine Zeile je Bieter. */
export interface BidLimit {
	bidderId: string;
	limit: number;
}

/**
 * Wie die NPCs eine Versteigerung unter sich ausmachen — das Gebot, das am Ende steht.
 *
 * **Eine Steigerung, kein Durchgang.** Bis 5.97 bot jeder NPC der Reihe nach einmal den
 * Mindestschritt, und es gewann, wer in der Reihe zuletzt noch mithielt — nicht, wer am
 * meisten wollte. Hier wird ausgerechnet, wie eine echte Steigerung endet: Es bleibt der
 * mit dem höchsten Limit übrig, und er zahlt einen Schritt über dem, was der Zweite noch
 * mitgegangen wäre — mehr nicht, und nie mehr als sein eigenes Limit.
 *
 * **Ein bestehendes Gebot zählt mit.** Hat ein Spieler geboten, muss der NPC ihn
 * übertreffen; ist der Höchstbietende selbst einer der NPCs, erhöht er nur, wenn ihn ein
 * anderer sonst überböte.
 *
 * `undefined`, wenn kein NPC das nötige Gebot aufbringen will.
 */
export function npcBidding(
	limits: BidLimit[],
	highest: Bid | null
): { bidderId: string; amount: number } | undefined {
	const reihe = [...limits].filter((zeile) => zeile.limit > 0).sort((a, b) => b.limit - a.limit);
	const erster = reihe[0];
	if (!erster) return undefined;

	const bisher: number | null = highest?.amount ?? null;
	const fuehrtSchon: boolean = highest?.bidderId === erster.bidderId;

	// Was der Erste überbieten muss: den Zweiten unter den NPCs — und, wenn er nicht selbst
	// vorne liegt, das stehende Gebot.
	const zweiter: number | undefined = reihe[1]?.limit;
	const gegner: number[] = [
		...(zweiter !== undefined ? [zweiter] : []),
		...(bisher !== null && !fuehrtSchon ? [bisher] : [])
	];
	const noetig: number = gegner.length === 0 ? MINIMUM_BID : Math.max(...gegner) + BID_INCREMENT;
	const gebot: number = Math.min(erster.limit, noetig);

	if (fuehrtSchon) {
		// Er liegt vorn; er erhöht nur, wenn es jemand anderes darüber schaffte.
		return bisher !== null && gebot > bisher
			? { bidderId: erster.bidderId, amount: gebot }
			: undefined;
	}
	if (gebot < nextBid(bisher)) return undefined;
	return { bidderId: erster.bidderId, amount: gebot };
}
