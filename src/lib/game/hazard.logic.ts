import { TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Unglücke: der Brand.
 *
 * **Es erfindet keinen neuen Zustand, es nimmt von dem, was da ist.** Ein Brand senkt den
 * Zustand eines Gebäudes — eine Größe, die es seit 4.6 gibt. Damit ist das Unglück von
 * Anfang an spürbar und braucht keine eigene Buchhaltung.
 *
 * **Es trifft, wo etwas zu holen ist.** Die Zielauswahl ist nach Wert gewichtet: Die
 * Feuersbrunst im nagelneuen Haus tut mehr weh als die in der halben Ruine.
 *
 * **Der Raubzug ist mit 5.40 herausgenommen** — nicht, weil er nicht funktionierte,
 * sondern weil er zu gut funktionierte: Ein Viertel der Stadtkasse, zweimal im Spieljahr,
 * deckelte sie strukturell unter dem Preis des Wachhauses, das die Raubzüge hätte
 * eindämmen sollen. Grünau stand nach 97 Spieljahren bei 109 Münzen und hatte nie eine
 * Wache. Eine Armutsfalle, aus der die Stadt nicht selbst herausfand.
 *
 * Damit ist auch die Wache vorerst ein Haus ohne Aufgabe. Beides gehört zusammen
 * überarbeitet (`OFFENE_PUNKTE.md`): Räuber, gegen die man sich wehren kann, und eine
 * Wache, die mehr tut, als eine Wahrscheinlichkeit zu senken. Die Ereignisart `RAID`
 * bleibt bekannt, weil die Chronik alte Raubzüge weiter erzählen können muss.
 */

export const HAZARD_KINDS = ['RAID', 'FIRE'] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

/**
 * Wie oft ein Unglück geschieht — als Erwartungswert je Spieljahr.
 *
 * Ein Brand alle zwei Jahre trifft statistisch jedes Gebäude selten genug, dass Bauen
 * sich noch lohnt. Die Zahl ist Balancing (Punkt 16) und steht deshalb hier und nicht
 * verstreut im Code.
 */
export const FIRES_PER_YEAR = 0.5;

export function chancePerTick(perYear: number): number {
	return perYear / TICKS_PER_YEAR;
}

export function fireChance(perYear: number = FIRES_PER_YEAR): number {
	return chancePerTick(perYear);
}

/** Ein mögliches Ziel mit dem, was dort auf dem Spiel steht. */
export interface Target<T> {
	ref: T;
	worth: number;
}

/**
 * Wen es trifft.
 *
 * Gewichtet nach Wert: Was das Zehnfache wert ist, wird zehnmal so wahrscheinlich
 * heimgesucht. Ziele ohne Wert fallen ganz heraus — sonst träfe der Würfel regelmäßig
 * ins Leere, und das Ereignis verpuffte, statt zu treffen.
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
