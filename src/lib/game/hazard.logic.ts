import { TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Unglücke: Raub und Brand.
 *
 * **Sie erfinden keinen neuen Zustand, sie nehmen von dem, was da ist.** Ein Raub
 * verschiebt Münzen und Waren, ein Brand senkt den Zustand eines Gebäudes — beides sind
 * Größen, die es seit 4.5 und 4.6 gibt. Damit ist ein Unglück von Anfang an spürbar und
 * braucht keine eigene Buchhaltung.
 *
 * **Es trifft, wo etwas zu holen ist.** Die Zielauswahl ist nach Beutewert gewichtet, und
 * das ist nicht nur stimmig, sondern nötig: Ein Räuber, der dem Verhungernden das letzte
 * Brot nimmt, erzeugt eine Spirale, aus der niemand mehr herauskommt. Wer nichts hat,
 * lohnt den Weg nicht.
 */

export const HAZARD_KINDS = ['RAID', 'FIRE'] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

/**
 * Wie oft ein Unglück geschieht — als Erwartungswert je Spieljahr.
 *
 * Zwei Raubzüge im Jahr sind spürbar, ohne dass Handel sinnlos würde; ein Brand alle zwei
 * Jahre trifft statistisch jedes Gebäude selten genug, dass Bauen sich noch lohnt. Beide
 * Zahlen sind Balancing (Punkt 16) und stehen deshalb hier und nicht verstreut im Code.
 */
export const RAIDS_PER_YEAR = 2;
export const FIRES_PER_YEAR = 0.5;

export function chancePerTick(perYear: number): number {
	return perYear / TICKS_PER_YEAR;
}

/**
 * Was die Wache ausrichtet.
 *
 * Jeder Wächter senkt die Wahrscheinlichkeit eines Raubzugs um ein Drittel des
 * Verbleibenden — drei Wächter lassen knapp dreißig Prozent übrig, aber **nie null**.
 * Eine Stadt, die sich vollständig freikaufen kann, hätte ein Problem gelöst statt es zu
 * verwalten; und ein Bürgermeister, der die Wache abschafft, soll den Unterschied merken,
 * nicht den Zusammenbruch erleben.
 *
 * Gegen Feuer hilft die Wache nicht. Dafür bräuchte es einen Brunnen — der gehört in den
 * Katalog öffentlicher Bauten (Punkt 12).
 */
export const GUARD_EFFECT = 1 / 3;

export function raidChance(guards: number, perYear: number = RAIDS_PER_YEAR): number {
	const grund: number = chancePerTick(perYear);
	return grund * Math.pow(1 - GUARD_EFFECT, Math.max(0, guards));
}

export function fireChance(perYear: number = FIRES_PER_YEAR): number {
	return chancePerTick(perYear);
}

/** Ein mögliches Ziel mit dem, was dort zu holen wäre. */
export interface Target<T> {
	ref: T;
	worth: number;
}

/**
 * Wen es trifft.
 *
 * Gewichtet nach Beutewert: Wer das Zehnfache besitzt, wird zehnmal so wahrscheinlich
 * heimgesucht. Ziele ohne Wert fallen ganz heraus — sonst überfiele der Würfel
 * regelmäßig leere Kammern, und das Ereignis verpuffte, statt zu treffen.
 */
export function pickTarget<T>(targets: Target<T>[], roll: number): T | undefined {
	const lohnende = targets.filter((ziel) => ziel.worth > 0);
	if (lohnende.length === 0) return undefined;

	const gesamt: number = lohnende.reduce((summe, ziel) => summe + ziel.worth, 0);
	let schwelle: number = roll * gesamt;

	for (const ziel of lohnende) {
		schwelle -= ziel.worth;
		if (schwelle <= 0) return ziel.ref;
	}
	return lohnende[lohnende.length - 1].ref;
}

/**
 * Wie viel eine Bande mitnimmt.
 *
 * Ein Viertel, aufgerundet — genug, dass es weh tut, wenig genug, dass niemand über Nacht
 * mittellos ist. Das Aufrunden sorgt dafür, dass auch beim kleinen Ziel etwas fehlt: Ein
 * Raub, bei dem nichts wegkommt, wäre eine Meldung ohne Folge.
 */
export const RAID_SHARE = 0.25;

export function loot(available: number): number {
	if (available <= 0) return 0;
	return Math.min(available, Math.ceil(available * RAID_SHARE));
}

/**
 * Was ein Brand anrichtet.
 *
 * Ein Drittel des Zustands, mindestens aber ein spürbarer Batzen. Ein Gebäude brennt
 * dabei **nicht bis zur Ruine**: Das erledigt der Verfall, wenn niemand es herrichtet —
 * und ein Brand, der ein Lebenswerk in einem Tick auslöscht, wäre kein Ereignis, sondern
 * eine Strafe.
 */
export const FIRE_DAMAGE_SHARE = 1 / 3;
export const FIRE_DAMAGE_MIN = 15;

export function fireDamage(condition: number): number {
	if (condition <= 0) return 0;
	return Math.min(condition, Math.max(FIRE_DAMAGE_MIN, Math.round(condition * FIRE_DAMAGE_SHARE)));
}
