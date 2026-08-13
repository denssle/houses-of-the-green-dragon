import { TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Wann jemand stirbt.
 *
 * Das Risiko folgt einer Gompertz-Kurve: Vor `MORTALITY_ONSET_AGE` passiert nichts,
 * danach verdoppelt es sich alle `MORTALITY_DOUBLING_YEARS` Jahre. Das ergibt ein
 * mittleres Sterbealter um 70 mit einem langen Schwanz — einzelne werden neunzig, und
 * genau das macht den Übergang zur nächsten Generation zu einer Frage, die man nicht
 * ausrechnen, sondern nur vorbereiten kann.
 *
 * Bewusst **keine** harte Obergrenze: Ein Alter, ab dem der Tod sicher ist, macht aus
 * dem Lebensende einen Schalter. Ein Greis, der alle überlebt, ist eine Geschichte.
 *
 * Krankheit, Hunger und Kälte kommen später hinzu (offene Punkte 4 und 5) — sie werden
 * das Risiko erhöhen, nicht ersetzen. Deshalb rechnet diese Datei ausschließlich mit dem
 * Alter und kennt keine anderen Ursachen.
 */

/** Vor diesem Alter stirbt niemand am Alter. */
export const MORTALITY_ONSET_AGE = 40;

/** Das Risiko im ersten betroffenen Jahr. */
export const MORTALITY_BASE_PER_YEAR = 0.005;

/** Nach so vielen Jahren hat sich das Risiko verdoppelt. */
export const MORTALITY_DOUBLING_YEARS = 8;

/**
 * Die Wahrscheinlichkeit, im Lauf eines Spieljahres zu sterben.
 *
 * Gedeckelt bei 1: Die Verdopplung läuft sonst über jede Wahrscheinlichkeit hinaus, und
 * bei 130 Jahren käme rechnerisch mehr als Gewissheit heraus.
 */
export function deathProbabilityPerYear(age: number): number {
	if (age < MORTALITY_ONSET_AGE) return 0;
	const verdopplungen: number = (age - MORTALITY_ONSET_AGE) / MORTALITY_DOUBLING_YEARS;
	return Math.min(1, MORTALITY_BASE_PER_YEAR * Math.pow(2, verdopplungen));
}

/**
 * Dieselbe Wahrscheinlichkeit, heruntergerechnet auf einen einzelnen Tick.
 *
 * Über die Gegenwahrscheinlichkeit, nicht durch Teilen: Gesucht ist der Wert, der
 * `TICKS_PER_YEAR` mal hintereinander angewandt genau das Jahresrisiko ergibt. Ein
 * simples `p / TICKS_PER_YEAR` läge bei kleinen Werten nah dran, bei großen deutlich
 * daneben — und vor allem hinge das tatsächliche Sterbealter dann daran, wie lang ein
 * Tick ist. Die Zeitskala soll das Spiel schneller machen, nicht tödlicher.
 */
export function deathProbabilityPerTick(age: number): number {
	const proJahr: number = deathProbabilityPerYear(age);
	if (proJahr <= 0) return 0;
	if (proJahr >= 1) return 1;
	return 1 - Math.pow(1 - proJahr, 1 / TICKS_PER_YEAR);
}

/**
 * Der Wurf für einen Tick.
 *
 * Der Zufall kommt als Parameter herein, damit die Regel prüfbar bleibt — ein Test soll
 * das Sterben erzwingen oder ausschließen können, ohne den Zufallsgenerator zu ersetzen.
 */
export function diesThisTick(age: number, roll: number): boolean {
	return roll < deathProbabilityPerTick(age);
}
