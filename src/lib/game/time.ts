/**
 * Die Zeitrechnung der Welt.
 *
 * Ein Tick ist eine Stunde Echtzeit, 50 Ticks sind ein Spieljahr — also gut zwei Realtage.
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

/** Dasselbe in Millisekunden — das Maß, in dem der Takt rechnet. */
export const MS_PER_TICK = HOURS_PER_TICK * 60 * 60 * 1000;

/**
 * Ein Spieljahr in Ticks — fünfzig Stunden, also gut zwei Realtage.
 *
 * **Warum nicht 48.** Achtundvierzig Stunden wären exakt zwei Tage, und damit läge jede
 * Uhrzeit für immer an derselben Stelle des Spieljahres: Wer täglich um sieben spielt,
 * sähe bis in alle Ewigkeit dieselben zwei Jahreszeiten und nie die anderen beiden.
 * Fünfzig Stunden lassen den Kalender durch den Tagesablauf wandern — nach ein paar
 * Wochen hat jeder alles einmal erlebt.
 *
 * Die krumme Zahl ist der Preis dafür, und sie ist es wert: Alles andere hier hängt an
 * ihr und rechnet sich mit.
 */
export const TICKS_PER_YEAR = 50;

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

/**
 * Die Jahreszeiten.
 *
 * Sie brauchen **keine einzige Spalte**: Die Jahreszeit ergibt sich aus dem Stand der
 * Weltuhr innerhalb des Jahres, ist also eine reine Rechnung. Alles andere wäre eine
 * zweite Wahrheit neben `currentTick`, die damit auseinanderlaufen könnte.
 */
export const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_NAMES: Record<Season, string> = {
	SPRING: 'Frühling',
	SUMMER: 'Sommer',
	AUTUMN: 'Herbst',
	WINTER: 'Winter'
};

/** Welche Jahreszeit gerade ist. */
export function seasonOf(currentTick: number): Season {
	const imJahr: number = ((currentTick % TICKS_PER_YEAR) + TICKS_PER_YEAR) % TICKS_PER_YEAR;
	const anteil: number = imJahr / TICKS_PER_YEAR;
	return SEASONS[Math.min(SEASONS.length - 1, Math.floor(anteil * SEASONS.length))];
}

/** Das wievielte Spieljahr die Welt gerade zählt. */
export function yearOf(currentTick: number): number {
	return Math.floor(currentTick / TICKS_PER_YEAR);
}

/**
 * Was Frost mit Bauarbeiten macht.
 *
 * Ein Viertel Aufschlag im Winter — spürbar genug, dass man Renovierungen in den Herbst
 * legt, klein genug, dass niemand vier Monate warten muss. Die Jahreszeit greift damit
 * in etwas ein, das es schon gibt; Ernte und Winterkleidung kommen mit 4.6, wo es Waren
 * gibt, die man ernten und tragen kann.
 */
export const WINTER_BUILDING_SURCHARGE = 0.25;

export function buildingCostFactor(season: Season): number {
	return season === 'WINTER' ? 1 + WINTER_BUILDING_SURCHARGE : 1;
}
