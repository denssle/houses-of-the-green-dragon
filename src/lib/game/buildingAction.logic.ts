import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { canAfford } from '$lib/game/economy';

/**
 * Die Regeln hinter den Gebäudehandlungen — als reine Funktionen, ohne Datenbank.
 *
 * Sie bekommen den Zustand hereingereicht und geben zurück, wie er danach aussieht; wer
 * das Ergebnis schreibt, entscheidet der Service. Diese Trennung ist hier besonders viel
 * wert, weil sich an genau diesen Zahlen das Balancing abspielt: Sie lassen sich prüfen,
 * ohne eine Welt aufzubauen.
 *
 * Fehlschläge tragen einen Grund als Code aus `actionFailure.ts`, keinen fertigen Satz.
 */

/** Wie viel Zustand ein Charakter für eine Schicht einsetzt. */
export const WORK_ACTION_POINT_COST = 1;

// --- Arbeiten ------------------------------------------------------------------------

/** Der Ausschnitt des Charakters, auf den es beim Arbeiten ankommt. */
export interface Worker {
	actionPoints: number;
	money: number;
	regionId: string;
}

export type WorkOutcome =
	| { ok: true; actionPoints: number; money: number; earned: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Schicht: Aktionspunkte hinein, Lohn heraus.
 *
 * Der Lohn kommt aus der Gebäudevorlage, nicht aus einer Konstanten — so zahlt die
 * Schmiede mehr als die Kate, und eine Änderung wirkt sofort für alle Betriebe. Ein
 * richtiges Anstellungsverhältnis mit Vertrag und Laufzeit kommt erst mit 4.6; bis dahin
 * arbeitet man tageweise für den, bei dem man gerade steht.
 */
export function work(
	worker: Worker,
	workplace: { regionId: string; template: BuildingTemplate }
): WorkOutcome {
	if (!workplace.template.wagePerActionPoint) {
		return { ok: false, reason: 'NOT_A_WORKPLACE' };
	}
	// Wer in Grünau steht, kann nicht im Eichwald arbeiten. Wege kosten Zeit (4.9), aber
	// die Prüfung gibt es ab heute — sonst gewöhnt sich die Oberfläche an das Gegenteil.
	if (worker.regionId !== workplace.regionId) {
		return { ok: false, reason: 'WRONG_REGION' };
	}
	if (worker.actionPoints < WORK_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}

	const earned: number = workplace.template.wagePerActionPoint * WORK_ACTION_POINT_COST;
	return {
		ok: true,
		actionPoints: worker.actionPoints - WORK_ACTION_POINT_COST,
		money: worker.money + earned,
		earned
	};
}

// --- Bauen ---------------------------------------------------------------------------

/** Das Grundstück, auf dem gebaut werden soll — so, wie das Bauen es sieht. */
export interface BuildSite {
	ownerCharacterId: string | null;
	regionId: string;
	hasBuilding: boolean;
}

export type BuildOutcome =
	| { ok: true; money: number; spent: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Ob gebaut werden darf und was danach in der Kasse ist.
 *
 * Die Reihenfolge der Prüfungen ist die der Ursachen: Erst muss der Platz einem gehören,
 * dann frei sein, dann darf das Gebäude überhaupt noch einmal gebaut werden, und zuletzt
 * zählt das Geld. So nennt die Rückmeldung immer den ersten wirklichen Grund und nicht
 * „zu wenig Geld“ für ein Grundstück, das gar nicht bebaubar ist.
 */
export function build(
	builder: { id: string; money: number },
	site: BuildSite,
	template: BuildingTemplate,
	limitReached: boolean
): BuildOutcome {
	if (site.ownerCharacterId !== builder.id) {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}
	if (site.hasBuilding) {
		return { ok: false, reason: 'PLOT_ALREADY_BUILT' };
	}
	if (limitReached) {
		return { ok: false, reason: 'LIMIT_REACHED' };
	}
	if (!canAfford(builder.money, template.price)) {
		return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	}
	return { ok: true, money: builder.money - template.price, spent: template.price };
}

// --- Grundstück kaufen ---------------------------------------------------------------

export type BuyPlotOutcome =
	| { ok: true; money: number; spent: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Nie vergebenes Stadtland kaufen. Das Geld geht an die Stadt — sie ist es, die den
 * Boden hergibt, und ihre Kasse ist ab 4.7 der politische Hebel.
 */
export function buyPlot(
	buyer: { money: number; regionId: string },
	plot: { ownerCharacterId: string | null; ownerType: string; regionId: string },
	price: number
): BuyPlotOutcome {
	if (plot.ownerType !== 'NONE') {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}
	if (buyer.regionId !== plot.regionId) {
		return { ok: false, reason: 'WRONG_REGION' };
	}
	if (!canAfford(buyer.money, price)) {
		return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	}
	return { ok: true, money: buyer.money - price, spent: price };
}
