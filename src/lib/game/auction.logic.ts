import type { ActionFailureReason } from '$lib/game/actionFailure';
import { PLOT_PRICE } from '$lib/game/economy';
import { TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Erschließung und Versteigerung.
 *
 * **Neues Bauland ist eine Amtshandlung, seine Vergabe ein Wettbewerb.** Der
 * Bürgermeister lässt aus der Stadtkasse Grundstücke ausweisen — die Stadt wächst in ihr
 * Umland hinein —, und wer darauf bauen darf, entscheidet das höchste Gebot. Damit hat
 * das Amt eine dritte Aufgabe, und die Stadtkasse bekommt zum ersten Mal eine Einnahme,
 * die größer sein kann als die Ausgabe.
 *
 * **Das Höchstgebot gewinnt — wenn es zahlen kann.** Wer beim Zuschlag nicht mehr genug
 * hat, wird übergangen, und der Nächste rückt nach. Dieselbe Rechnung wie bei der
 * Amtsnachfolge (4.7a): Es gibt keine Reservierung von Geld, die mitgeführt werden
 * müsste, und keinen Zustand, der von der Wirklichkeit abweichen kann. Wer bietet, ohne
 * zu zahlen, verliert nichts außer dem Zuschlag — und das ist die einzige Strafe, die
 * ohne ein Schuldrecht auskommt.
 */

/**
 * Was die Stadt das Erschließen eines Grundstücks kostet.
 *
 * Über dem alten Festpreis (40): Erschließen ist Arbeit — Wege, Gräben, Vermessung —,
 * und die Stadt soll dabei nicht automatisch verdienen. Ob es sich lohnt, entscheidet
 * die Versteigerung, und damit die Frage, wie knapp Bauland gerade ist.
 */
export const DEVELOPMENT_COST_PER_PLOT = 60;

/** Wie viele Grundstücke eine Erschließung höchstens auf einmal ausweist. */
export const MAX_PLOTS_PER_DEVELOPMENT = 4;

/**
 * Wie lange eine Versteigerung läuft.
 *
 * Ein halbes Spieljahr — ein Realtag. Kurz genug, dass die Stadt nicht monatelang auf
 * ihr Geld wartet, lang genug, dass auch mitbieten kann, wer nur abends hereinschaut.
 */
export const AUCTION_TICKS: number = Math.round(TICKS_PER_YEAR / 2);

/** Unter diesem Gebot geht nichts weg. */
export const MINIMUM_BID: number = PLOT_PRICE;

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
 * Was ein NPC zu bieten bereit ist.
 *
 * Ein Viertel seines Vermögens, und nur, wenn er überhaupt etwas übrig hat. Ein NPC, der
 * alles auf ein Grundstück wirft, verhungert daneben; einer, der gar nicht bietet, macht
 * jede Versteigerung ohne Spieler zur Formsache.
 */
export const NPC_BID_SHARE = 0.25;

export function npcBid(money: number, highest: number | null): number | undefined {
	const grenze: number = Math.floor(money * NPC_BID_SHARE);
	const noetig: number = nextBid(highest);
	return grenze >= noetig ? noetig : undefined;
}
