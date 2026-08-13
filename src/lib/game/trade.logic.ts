import type { ActionFailureReason } from '$lib/game/actionFailure';
import { taxOn } from '$lib/game/law.logic';
import { canAfford } from '$lib/game/economy';

/**
 * Handel zum Festpreis.
 *
 * **Der Verkäufer legt den Preis fest und stellt die Ware in seinen Betrieb; wer
 * vorbeikommt, kauft oder lässt es.** Kein Orderbuch, kein Matching — und das ist keine
 * Bequemlichkeit, sondern eine Folge des Zeitmodells: Ein Orderbuch braucht Gegenparteien
 * in derselben Stunde, ein Preisschild verkauft auch nachts.
 *
 * **Jedes Handelshaus ist zugleich Verkaufsstelle.** Der Marktplatz ist deshalb kein
 * zweites System, sondern ein öffentliches Gebäude mit einer anderen Regel darüber, wer
 * dort ein Preisschild aushängen darf: im eigenen Laden nur der Eigentümer, am Markt
 * jeder — gegen Standgeld.
 */

/**
 * Was die Stadt für einen Stand am Markt nimmt, und was sie am Kauf mitverdient.
 *
 * Beides sind seit 4.7b **Gesetze**: Der Satz kommt von außen herein, weil ihn der
 * Bürgermeister verschieben kann. Die Regel bleibt hier, die Zahl nicht.
 */

/** Wer wo anbieten darf. */
export type ShopKind = 'OWN' | 'MARKET' | 'FORBIDDEN';

/**
 * Darf hier jemand etwas anbieten — und was kostet es ihn?
 *
 * Öffentliche Gebäude, die kein Marktplatz sind (Rathaus, Unterkunft), bleiben außen vor:
 * Ein Preisschild am Rathaus wäre kein Handel, sondern ein Schlupfloch am Standgeld
 * vorbei.
 */
export function shopKindFor(
	building: { ownerType: string; ownerCharacterId: string | null; isMarket: boolean },
	sellerId: string
): ShopKind {
	if (building.isMarket) return 'MARKET';
	if (building.ownerType === 'CHARACTER' && building.ownerCharacterId === sellerId) return 'OWN';
	return 'FORBIDDEN';
}

export function stallFeeFor(kind: ShopKind, stallFee: number): number {
	return kind === 'MARKET' ? stallFee : 0;
}

export type OfferOutcome =
	| { ok: true; sellerMoney: number; fee: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Ein Angebot aushängen.
 *
 * Die Ware wandert dabei **in das Angebot** — aus dem Betriebslager, wenn es der eigene
 * Laden ist, aus der eigenen Habe, wenn es der Markt ist. Damit kann niemand dieselben
 * zehn Laibe an drei Ständen gleichzeitig anbieten, und ein Kauf braucht keine zweite
 * Prüfung, ob die Ware noch da ist.
 */
export function offer(
	seller: { money: number },
	kind: ShopKind,
	available: number,
	quantity: number,
	pricePerUnit: number,
	stallFee: number
): OfferOutcome {
	if (kind === 'FORBIDDEN') return { ok: false, reason: 'PLOT_NOT_OWNED' };
	if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, reason: 'NOTHING_TO_DO' };
	if (!Number.isInteger(pricePerUnit) || pricePerUnit < 0) {
		return { ok: false, reason: 'NOTHING_TO_DO' };
	}
	if (available < quantity) return { ok: false, reason: 'NOT_IN_STOCK' };

	const standgeld: number = stallFeeFor(kind, stallFee);
	if (!canAfford(seller.money, standgeld)) return { ok: false, reason: 'NOT_ENOUGH_MONEY' };

	return { ok: true, sellerMoney: seller.money - standgeld, fee: standgeld };
}

export type PurchaseOutcome =
	| { ok: true; total: number; tax: number; buyerMoney: number; remaining: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Kaufen.
 *
 * Teilmengen sind erlaubt: Wer zwei Laibe braucht, muss nicht vierzig nehmen. Ein
 * Angebot, das dabei leer wird, verschwindet — der Service räumt es weg, so wie
 * Beziehungen und Vorräte auf null verschwinden.
 */
export function buy(
	buyer: { id: string; money: number },
	offerRow: { sellerId: string; quantity: number; pricePerUnit: number },
	wanted: number,
	salesTaxPercent: number
): PurchaseOutcome {
	if (offerRow.sellerId === buyer.id) return { ok: false, reason: 'ALREADY_OWNED' };
	if (!Number.isInteger(wanted) || wanted < 1) return { ok: false, reason: 'NOTHING_TO_DO' };
	if (offerRow.quantity < wanted) return { ok: false, reason: 'NOT_IN_STOCK' };

	const summe: number = offerRow.pricePerUnit * wanted;
	// Die Steuer kommt **oben drauf**, sie wird nicht vom Preis abgezogen: Der Verkäufer
	// bekommt, was am Schild steht, der Käufer zahlt mehr. Andersherum wäre jede
	// Steuererhöhung eine Enteignung des Verkäufers, der seinen Preis nie gesenkt hat.
	const steuer: number = taxOn(summe, salesTaxPercent);
	if (!canAfford(buyer.money, summe + steuer)) return { ok: false, reason: 'NOT_ENOUGH_MONEY' };

	return {
		ok: true,
		total: summe,
		tax: steuer,
		buyerMoney: buyer.money - summe - steuer,
		remaining: offerRow.quantity - wanted
	};
}
