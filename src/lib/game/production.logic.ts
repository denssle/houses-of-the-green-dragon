import type { ActionFailureReason } from '$lib/game/actionFailure';
import type { SkillType } from '$lib/game/skill.logic';
import { skillFactor } from '$lib/game/skill.logic';
import { outputFactor } from '$lib/game/building.logic';
import type { Season } from '$lib/game/time';

/**
 * Herstellen und Ernten.
 *
 * Die Kette ist die eigentliche Aussage: Getreide wächst auf einem gepachteten Acker,
 * die Mühle macht Mehl daraus, der Bäcker Brot. Damit hat jede Ware eine
 * nachvollziehbare Herkunft, und ein Engpass wirkt sich die Kette entlang aus — wer den
 * Acker hält, bestimmt mittelbar, was ein Laib kostet.
 *
 * **Gearbeitet wird zunächst auf eigene Rechnung**: Wer mahlt, mahlt sein eigenes
 * Getreide und behält das Mehl. Ein Betrieb, der seine Angestellten für Lohn arbeiten
 * lässt und den Ertrag behält, braucht Anstellungsverhältnisse — die kommen mit 4.6d.
 * Bis dahin ist die Mühle ein Werkzeug, kein Arbeitgeber.
 */

/** Ein Rezept: was hineingeht, was herauskommt, was es kostet. */
export interface Recipe {
	/** Was verbraucht wird — Ware und Menge je Durchgang. */
	input: { itemId: string; quantity: number }[];
	outputItemId: string;
	/** Wie viel dabei herauskommt, bevor Können und Zustand mitreden. */
	baseOutput: number;
	actionPointCost: number;
	/** Welche Fertigkeit dabei wächst und den Ertrag hebt. */
	skill: SkillType;
	/** Nur zu diesen Jahreszeiten — leer heißt: das ganze Jahr über. */
	seasons?: Season[];
}

export type ProductionOutcome =
	| { ok: true; actionPoints: number; produced: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Wie viel ein Durchgang bringt.
 *
 * Drei Faktoren, und jeder war schon vorher da: das Können des Handwerkers (4.5a), der
 * Zustand des Betriebs (4.5) und die Grundmenge aus dem Rezept. Mindestens eines, sonst
 * wäre der Aktionspunkt verloren, ohne dass es jemand angesagt hätte — dieselbe Regel
 * wie beim Lohn.
 */
export function yieldOf(recipe: Recipe, skillLevel: number, condition: number): number {
	return Math.max(
		1,
		Math.round(recipe.baseOutput * skillFactor(skillLevel) * outputFactor(condition))
	);
}

/**
 * Einen Durchgang planen.
 *
 * Der Vorrat kommt als einfache Abbildung herein, damit die Regel ohne Datenbank prüfbar
 * bleibt. Was der Service daraus macht — abziehen, gutschreiben, Übung eintragen —,
 * entscheidet er selbst.
 */
export function produce(
	worker: { actionPoints: number; skillLevel: number },
	recipe: Recipe,
	stock: Record<string, number>,
	condition: number,
	season: Season
): ProductionOutcome {
	if (recipe.seasons && !recipe.seasons.includes(season)) {
		return { ok: false, reason: 'WRONG_SEASON' };
	}
	if (worker.actionPoints < recipe.actionPointCost) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}
	for (const zutat of recipe.input) {
		if ((stock[zutat.itemId] ?? 0) < zutat.quantity) {
			return { ok: false, reason: 'NOT_IN_STOCK' };
		}
	}

	return {
		ok: true,
		actionPoints: worker.actionPoints - recipe.actionPointCost,
		produced: yieldOf(recipe, worker.skillLevel, condition)
	};
}

/**
 * Der Zehnt: was von einer Ernte an die Stadt geht.
 *
 * Die Pacht ist im Konzept eine **laufende** Belastung, und laufend hieße ein eigener
 * Durchlauf über alle Pachtverhältnisse je Tick. Der Zehnt erreicht dasselbe ohne diese
 * Schleife: Wer nichts erntet, zahlt nichts — wer viel erntet, zahlt viel. Er trifft
 * damit den Ertrag statt der Zeit, was für einen Acker sogar treffender ist.
 *
 * Die zeitabhängige Pacht kommt zurück, sobald es Ämter gibt, die sie eintreiben (4.7).
 */
export const TITHE = 0.1;

export function titheOn(harvest: number): number {
	return Math.floor(harvest * TITHE);
}
