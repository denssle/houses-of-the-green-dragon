import { SATIETY_WEAKENED } from '$lib/game/need.logic';

/**
 * Die Armenspeisung (0.11.0, Punkt 122).
 *
 * **Warum es sie gibt.** Im Oktober 2026 verhungerte Grünau, während die Stadtkasse die Hälfte
 * des Geldes der ganzen Welt hielt. Der Nachbau aus der Sicherung zeigte es Tick für Tick:
 * Selbst als der Bürgermeister die Grundsteuer auf zwei Münzen gesenkt hatte, blieb ein
 * Fünftel der Schuld uneinbringlich — es gab Leute, die gar kein Geld mehr hatten —, und
 * gestorben wurde, als die Kasse am vollsten war. Sie gab nur Löhne und das Amtsgehalt aus.
 *
 * **Was sie tut:** Die Stadt kauft Brot am Markt und gibt es in der Unterkunft an die aus,
 * die hungern und sich selbst nicht helfen können. Historisch die Almosen der Stadt und des
 * Spitals. Das Geld landet beim Bäcker und beim Bauern, also wieder im Umlauf — der eigentliche
 * Zweck, neben dem Brot.
 */

/** Wo ausgegeben wird: die städtische Unterkunft, das Auffangnetz der Stadt. */
export const UNTERKUNFT_OPTION_ID = 3;

/**
 * **Ab wann jemand gespeist wird:** wenn er geschwächt ist. Später als das Waisenhaus, das
 * schon bei leichtem Hunger auftischt — ein Kind kann nicht für sich sorgen, ein Erwachsener
 * soll es zuerst selbst versuchen.
 */
export const ALMOSEN_UNTER = SATIETY_WEAKENED;

export interface Beduerftiger {
	satiety: number;
	/** Liegt bei ihm oder in seinem Haushalt etwas Essbares? */
	hatEssen: boolean;
	/** Das meiste Geld, über das er oder sein Haushalt verfügt. */
	geld: number;
}

/**
 * Wer bekommt etwas? **Wer hungert, nichts daheim hat und sich kein Brot leisten kann.**
 *
 * Alle drei Bedingungen, mit Absicht: Wer Geld hat, soll es beim Bäcker ausgeben — sonst
 * kaufte die Stadt dem Wohlhabenden sein Brot, und das Geld liefe vom Steuerzahler zum
 * Bequemen statt zum Armen. Wer Brot daheim hat, isst das.
 */
export function needsAlms(person: Beduerftiger, brotpreis: number): boolean {
	return person.satiety < ALMOSEN_UNTER && !person.hatEssen && person.geld < brotpreis;
}

/**
 * Was die Kasse dafür hergibt: **nur, was über der Rücklage liegt.** Die Stadt gibt zurück,
 * was sie zu viel hat, und bleibt bei Löhnen und Instandhaltung handlungsfähig.
 */
export function almsBudget(treasury: number, reserve: number): number {
	return Math.max(0, treasury - reserve);
}

/** Für wie viele Laibe es Armengeld gibt (0.11.0): genug für ein paar Tage, kein Vermögen. */
export const ARMENGELD_LAIBE = 3;

/** Das Armengeld bei diesem Brotpreis. */
export function armengeld(brotpreis: number): number {
	return ARMENGELD_LAIBE * brotpreis;
}
