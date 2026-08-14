import { TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Kleidung und Duftwasser — was das Auftreten ausmacht.
 *
 * **Beide wirken auf dieselbe Größe: die Zuneigung.** Sie ist seit 4.3 gebaut, und damit
 * ist der Prüfstein erfüllt, an dem Waren sonst scheitern — eine Ware ohne Wirkung ist
 * Dekoration. Kleidung gegen Kälte müsste dagegen auf Krankheit wirken, und die gibt es
 * noch nicht (Punkt 5).
 *
 * **Der Unterschied liegt darin, wie sie sich verbrauchen.** Ein Gewand wird *getragen*:
 * Es wirkt bei jedem Umgang und hält einige Jahre, dann ist es hin. Ein Duftwasser wird
 * *aufgebraucht*: einmal, beim Werben, und dann ist es weg. Daraus ergeben sich zwei
 * verschiedene Berufe — der Schneider lebt von Dauerkundschaft, der Alchemist vom Anlass.
 */

/** Was ein getragenes Gewand jeder sozialen Handlung zuschlägt. */
export const GARMENT_BONUS = 5;

/**
 * Wie lange ein Gewand hält.
 *
 * Drei Spieljahre — sechs Realtage. Lang genug, dass der Kauf sich lohnt, kurz genug,
 * dass der Schneider mehr als einmal im Leben gebraucht wird. **Das ist Punkt 20 im
 * Kleinen**: Ohne Verschleiß kauft jeder genau ein Gewand, und danach hat das Handwerk
 * nichts mehr zu tun.
 */
export const GARMENT_LIFETIME_YEARS = 3;
export const GARMENT_LIFETIME_TICKS: number = GARMENT_LIFETIME_YEARS * TICKS_PER_YEAR;

/** Ist das Gewand noch heil? */
export function garmentIntact(wornSinceTick: number | null, currentTick: number): boolean {
	if (wornSinceTick === null) return false;
	return currentTick - wornSinceTick < GARMENT_LIFETIME_TICKS;
}

/** Wie viele Spieljahre es noch hält — für die Anzeige. */
export function garmentYearsLeft(wornSinceTick: number | null, currentTick: number): number {
	if (!garmentIntact(wornSinceTick, currentTick)) return 0;
	const übrig: number = GARMENT_LIFETIME_TICKS - (currentTick - wornSinceTick!);
	return Math.ceil(übrig / TICKS_PER_YEAR);
}

/**
 * Was ein Duftwasser beim Werben zuschlägt.
 *
 * Deutlich mehr als das Gewand, und nur dieses eine Mal: Es ist der Aufwand für einen
 * Anlass, nicht für den Alltag. Wer eine Ehe will, für die die Zuneigung noch nicht
 * reicht, kann sie mit ein paar Fläschchen erkaufen — teuer, aber schneller als
 * Geduld.
 */
export const PERFUME_BONUS = 10;

/**
 * Der Zuschlag auf eine soziale Handlung.
 *
 * Das Duftwasser zählt nur, wo es hingehört: beim Werben. Beim bloßen Zeitverbringen
 * wäre es verschwendet — und das ist die Regel, die verhindert, dass jemand sich
 * durchparfümiert, um Freundschaften zu schließen.
 */
export function affectionBonus(state: { garmentIntact: boolean; perfumeUsed: boolean }): number {
	return (state.garmentIntact ? GARMENT_BONUS : 0) + (state.perfumeUsed ? PERFUME_BONUS : 0);
}

/**
 * Wie viele Aktionspunkte ein Stärkungstrank zurückgibt.
 *
 * **Nicht mehr als ein Bruchteil des Tagesbudgets.** Aktionspunkte sind die
 * Hauptressource; ein Trank, der sie beliebig ersetzt, kaufte Zeit — und wer mehr Geld
 * hat, hätte einfach mehr Tag. Acht Punkte sind ein Sechstel des vollen Vorrats: spürbar,
 * wenn es klemmt, und zu wenig, um damit ein zweites Leben zu führen.
 */
export const TONIC_ACTION_POINTS = 8;

/**
 * Ein Trank füllt nur auf, was fehlt.
 *
 * Über die Obergrenze hinaus wirkt er nicht — sonst hortete man Punkte für einen Tag, an
 * dem alles auf einmal geschieht, und die Drosselung über das Aktionsbudget wäre
 * ausgehebelt.
 */
export function tonicRestores(current: number, maximum: number): number {
	return Math.max(0, Math.min(TONIC_ACTION_POINTS, maximum - current));
}
