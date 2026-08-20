import { taxOn } from '$lib/game/law.logic';
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

/**
 * Der Betrieb, in dem gearbeitet wird.
 *
 * Zustand **und** Ausbau, als ein Wert: Beide gehören dem Gebäude und beide gehen in den
 * Ertrag ein. Als zwei Zahlen nebeneinander wären sie über kurz oder lang vertauscht —
 * `(rezept, koennen, 100, 2)` sagt nicht, welche welche ist.
 */
export interface Workshop {
	condition: number;
	/** Die Ausbaustufe, eins-basiert. Ein Acker hat keine und steht auf 1. */
	level: number;
}

/**
 * Wie viel mehr eine ausgebaute Werkstatt hergibt — je Stufe über der ersten.
 *
 * **Am Ausbau bemessen, nicht je Vorlage aufgezählt**, wie schon das Baumaterial: Jede
 * neue Werkstatt bringt ihre Steigerung von selbst mit, statt sie in einer Tabellenzeile
 * gepflegt zu bekommen, die man beim Hinzufügen vergisst.
 *
 * Die Hälfte je Stufe ist der Sinn des Ausbaus: Eine Zimmerei kostet knapp das Doppelte
 * des Sägeschuppens und macht aus denselben zwei Stämmen fünf Bretter statt drei. Damit
 * rechnet sich der Ausbau über die Zeit — und nur über die Zeit, denn die Aktionspunkte
 * je Durchgang bleiben dieselben.
 */
export const OUTPUT_PER_LEVEL = 0.5;

export function levelFactor(level: number): number {
	return 1 + Math.max(0, level - 1) * OUTPUT_PER_LEVEL;
}

export type ProductionOutcome =
	| { ok: true; actionPoints: number; produced: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Wie viel ein Durchgang bringt.
 *
 * Vier Faktoren: das Können des Handwerkers (4.5a), der Zustand des Betriebs (4.5), sein
 * Ausbau und die Grundmenge aus dem Rezept. Mindestens eines, sonst wäre der
 * Aktionspunkt verloren, ohne dass es jemand angesagt hätte — dieselbe Regel wie beim
 * Lohn.
 *
 * **Der Ausbau kam zuletzt dazu**, und er ist der einzige der drei Faktoren, den man
 * kaufen kann: Können muss man sich erarbeiten, der Zustand hält bestenfalls den vollen
 * Ertrag. Wer mehr will als das, baut aus.
 */
export function yieldOf(recipe: Recipe, skillLevel: number, workshop: Workshop): number {
	return Math.max(
		1,
		Math.round(
			recipe.baseOutput *
				skillFactor(skillLevel) *
				outputFactor(workshop.condition) *
				levelFactor(workshop.level)
		)
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
	workshop: Workshop,
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
		produced: yieldOf(recipe, worker.skillLevel, workshop)
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
 * Seit 4.7b ist der Satz ein **Gesetz** und kommt von außen herein; die laufende
 * Belastung gibt es daneben als Grundsteuer, und die trifft den Besitz statt den Ertrag.
 */
export function titheOn(harvest: number, percent: number): number {
	return taxOn(harvest, percent);
}
