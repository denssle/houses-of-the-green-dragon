/**
 * Die Zeitrechnung der Welt.
 *
 * Ein Tick ist eine Stunde Echtzeit, 48 Ticks sind ein Spieljahr — also zwei Realtage.
 * Ein Charakter lebt damit gut vier Monate und wird nach 32 Realtagen volljährig: lang
 * genug, um einen Betrieb aufzubauen, kurz genug, um mehrere Generationen im Jahr zu
 * erleben (siehe `KONZEPT.md`).
 *
 * Alles hier steht an genau dieser Stelle und nirgends sonst. `TICKS_PER_YEAR` ist die
 * Zahl, die beim Balancing am ehesten noch einmal angefasst wird — verstreut in
 * Alterung, Verfall, Wahlperiode und Weltaufbau wäre sie nicht mehr änderbar.
 */

/** Wie viel Echtzeit ein Tick umfasst. */
export const HOURS_PER_TICK = 1;

/** Ein Spieljahr in Ticks. 48 Ticks = 2 Realtage. */
export const TICKS_PER_YEAR = 48;

/** Ein Aktionspunkt je Tick, angesammelt bis zu zwei Tagen Vorrat. */
export const ACTION_POINTS_PER_TICK = 1;
export const MAX_ACTION_POINTS = 48;

/** Ab diesem Alter gilt ein Charakter als erwachsen. */
export const AGE_OF_MAJORITY = 16;

/** Übliche Lebenserwartung in Jahren — rund vier Monate Echtzeit. */
export const LIFE_EXPECTANCY_YEARS = 70;

export function yearsToTicks(years: number): number {
	return years * TICKS_PER_YEAR;
}

export function ticksToYears(ticks: number): number {
	return Math.floor(ticks / TICKS_PER_YEAR);
}

/** Das Alter in vollen Spieljahren zum gegebenen Zeitpunkt. */
export function ageInYears(birthTick: number, currentTick: number): number {
	return ticksToYears(currentTick - birthTick);
}
