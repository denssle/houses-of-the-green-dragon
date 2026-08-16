import { type BuildingTemplate, buildPrice } from '$lib/model/buildingTemplate';
import { wageAt } from '$lib/game/building.logic';
import { skillFactor } from '$lib/game/skill.logic';
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
	/** Die Stufe der Fertigkeit, die dieser Betrieb verlangt — null bei Ungelernten. */
	skillLevel: number;
}

export type WorkOutcome =
	| { ok: true; actionPoints: number; money: number; earned: number; employerMoney: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Schicht: Aktionspunkte hinein, Lohn heraus.
 *
 * Der Lohn kommt aus der Gebäudevorlage, nicht aus einer Konstanten — so zahlt die
 * Schmiede mehr als die Kate, und eine Änderung wirkt sofort für alle Betriebe. Ein
 * richtiges Anstellungsverhältnis mit Vertrag und Laufzeit kommt erst mit 4.6; bis dahin
 * arbeitet man tageweise für den, bei dem man gerade steht.
 *
 * **Und der Lohn hat seit 5.24 einen Zahler** (Punkt 66). Bis dahin stand hier schlicht
 * `money: worker.money + earned` — niemand wurde belastet. Wer in der städtischen Schmiede
 * eine Schicht arbeitete, **erschuf** seine drei Münzen; `economy.ts` nennt die Tagelöhnerei
 * selbst „die Krücke aus 3.3", nur war sie längst die Hauptgeldquelle der Welt: In Grünau
 * besitzt niemand einen Betrieb, also lebt jeder davon.
 *
 * Das widersprach der Regel, die `KONZEPT.md` für die Wirtschaft aufstellt — Geld wechselt
 * den Besitzer, es entsteht und vergeht nicht. Jetzt gilt hier dieselbe Regel wie beim
 * Anstellungslohn (`workShift`): **Wer nicht zahlen kann, bei dem wird nicht gearbeitet**,
 * und zwar bevor Aktionspunkte verbraucht sind.
 */
export function work(
	worker: Worker,
	workplace: { regionId: string; template: BuildingTemplate; level: number; condition: number },
	employer: { money: number }
): WorkOutcome {
	// Der Lohn hängt an vier Dingen: an der Vorlage, an der Ausbaustufe, am Zustand und
	// am Können des Arbeiters. Eine verfallene Hütte produziert weniger, ein Meister
	// mehr — damit ist die Schicht nicht mehr für jeden dieselbe.
	const grundlohn: number = wageAt(workplace.template, workplace.level, workplace.condition);
	if (grundlohn === 0) {
		return { ok: false, reason: 'NOT_A_WORKPLACE' };
	}
	// Gerundet und nicht abgerundet: Bei einem Grundlohn von 3 Münzen verschluckte das
	// Abrunden die ersten drei Stufen vollständig — wer zwanzig Schichten gearbeitet hat,
	// verdiente noch immer dasselbe und sähe für seine Mühe nichts. Am laufenden Server
	// aufgefallen, und es ist kein Rechenfehler, sondern eine Frage der Rückmeldung.
	const lohn: number = Math.max(1, Math.round(grundlohn * skillFactor(worker.skillLevel)));
	// Wer in Grünau steht, kann nicht im Eichwald arbeiten. Wege kosten Zeit (4.9), aber
	// die Prüfung gibt es ab heute — sonst gewöhnt sich die Oberfläche an das Gegenteil.
	if (worker.regionId !== workplace.regionId) {
		return { ok: false, reason: 'WRONG_REGION' };
	}
	if (worker.actionPoints < WORK_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}

	const earned: number = lohn * WORK_ACTION_POINT_COST;

	// **Zuletzt geprüft, aber vor jedem Verbrauch.** Wer umsonst arbeitete, weil die Kasse
	// leer war, hätte seinen Tag verloren, ohne es vorher wissen zu können — dasselbe
	// Argument wie bei `workShift`, und deshalb dieselbe Reihenfolge.
	if (!canAfford(employer.money, earned)) {
		return { ok: false, reason: 'EMPLOYER_BROKE' };
	}

	return {
		ok: true,
		actionPoints: worker.actionPoints - WORK_ACTION_POINT_COST,
		money: worker.money + earned,
		earned,
		employerMoney: employer.money - earned
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
	if (!canAfford(builder.money, buildPrice(template))) {
		return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	}
	const preis: number = buildPrice(template);
	return { ok: true, money: builder.money - preis, spent: preis };
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
