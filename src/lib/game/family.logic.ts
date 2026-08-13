import type { ActionFailureReason } from '$lib/game/actionFailure';
import type { Gender } from '$lib/db/attributes/enums';
import type { Kinship } from '$lib/game/relationship.logic';
import { AGE_OF_MAJORITY, ageInYears, TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Werben, Heiraten, Kinder bekommen — als reine Regeln.
 *
 * Die Fortpflanzung ist die zentrale Überlebensmechanik: Wer ohne Erben stirbt, dessen
 * Haus erlischt (4.2). Deshalb steht sie nicht am Ende einer Bedürfniskette, sondern
 * hängt an etwas, das der Spieler steuern kann — an Beziehungen (4.3) und an Bauwerken
 * (4.5).
 *
 * **Dieselben Regeln für Spieler und NPCs.** Ein zweiter Satz Regeln für die Simulation
 * würde unweigerlich von dem der Spieler abdriften, und Balancing wäre dann nicht mehr
 * möglich: Man wüsste nie, ob eine Beobachtung an der Welt liegt oder daran, dass die
 * NPCs anders rechnen.
 */

/** Ab dieser Zuneigung ist jemand bereit zu heiraten. */
export const MARRIAGE_MIN_AFFECTION = 50;

/** Was ein Werben kostet und einbringt. */
export const COURT_ACTION_POINT_COST = 2;
export const COURT_AFFECTION_GAIN = 15;

/**
 * Das fruchtbare Fenster der Frau. Beim Mann gilt nur die Volljährigkeit — was
 * biologisch grob stimmt und vor allem eine Stellschraube weniger ist.
 */
export const FERTILE_FROM_AGE = AGE_OF_MAJORITY;
export const FERTILE_TO_AGE = 45;

/** Neun Monate, in Ticks: drei Viertel eines Spieljahres. */
export const PREGNANCY_TICKS = Math.round(TICKS_PER_YEAR * 0.75);

/**
 * Die Wahrscheinlichkeit je Tick, dass ein Paar ein Kind bekommt.
 *
 * Angesetzt auf rund vier Kinder über ein fruchtbares Leben: Das Fenster umfasst 29
 * Jahre, also gut 1400 Ticks, von denen jede Schwangerschaft 36 belegt. Vier Kinder
 * sind mehr, als eine Dynastie zum Erben braucht — der Überschuss wandert in den
 * NPC-Pool und trägt die Bevölkerung (siehe `KONZEPT.md`).
 */
export const CONCEPTION_CHANCE_PER_TICK = 0.003;

// --- Heiraten ------------------------------------------------------------------------

/** Was von einem Menschen für die Eheprüfung gebraucht wird. */
export interface Candidate {
	id: string;
	gender: Gender;
	birthTick: number;
	spouseId: string | null;
}

export type MarriageCheck = { ok: true } | { ok: false; reason: ActionFailureReason };

/**
 * Darf geheiratet werden?
 *
 * Die Reihenfolge der Prüfungen ist bewusst: erst das Unmögliche (dieselbe Person,
 * Verwandtschaft), dann das Zustandsabhängige (verheiratet, zu jung), zuletzt das, was
 * sich ändern lässt (Zuneigung). So bekommt der Spieler immer den Grund genannt, an dem
 * er zuerst arbeiten müsste.
 */
export function canMarry(
	one: Candidate,
	other: Candidate,
	kinship: Kinship,
	affection: number,
	currentTick: number
): MarriageCheck {
	if (one.id === other.id) return { ok: false, reason: 'SAME_PERSON' };

	// Jede erkannte Verwandtschaft schließt die Ehe aus — Eltern, Kinder, Geschwister,
	// Großeltern. Weiter reicht der Stammbaum ohnehin nicht (siehe `kinshipBetween`),
	// Vettern dürfen also heiraten. Das ist mittelalterlich zutreffend und spart eine
	// Suche über beliebig viele Generationen.
	if (kinship !== 'NONE') return { ok: false, reason: 'CLOSE_KIN' };

	// Die Ehe ist im Spiel der Weg zu Kindern; das Geschlecht ist dafür der einzige
	// Grund, aus dem es überhaupt geführt wird (siehe `enums.ts`). Rechte hängen
	// ausdrücklich nicht daran: Erben, wählen, arbeiten und Ämter bekleiden können alle.
	if (one.gender === other.gender) return { ok: false, reason: 'SAME_GENDER' };

	if (one.spouseId !== null || other.spouseId !== null) {
		return { ok: false, reason: 'ALREADY_MARRIED' };
	}
	if (
		ageInYears(one.birthTick, currentTick) < AGE_OF_MAJORITY ||
		ageInYears(other.birthTick, currentTick) < AGE_OF_MAJORITY
	) {
		return { ok: false, reason: 'TOO_YOUNG' };
	}
	if (affection < MARRIAGE_MIN_AFFECTION) {
		return { ok: false, reason: 'TOO_LITTLE_AFFECTION' };
	}
	return { ok: true };
}

// --- Werben --------------------------------------------------------------------------

export type CourtOutcome =
	| { ok: true; actionPoints: number; delta: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Werben — die stärkere Form des Zeitverbringens.
 *
 * Zwei Aktionspunkte für fünfzehn statt einem für sechs: etwas ergiebiger je Punkt, aber
 * vor allem in größeren Schritten. Von „gleichgültig" bis zur Heiratsbereitschaft sind
 * es damit rund vier Besuche — nah genug, um erreichbar zu sein, weit genug, dass eine
 * Ehe eine Entscheidung bleibt und kein Knopfdruck.
 */
export function court(
	suitor: { actionPoints: number; regionId: string },
	other: { regionId: string }
): CourtOutcome {
	if (suitor.regionId !== other.regionId) {
		return { ok: false, reason: 'WRONG_REGION' };
	}
	if (suitor.actionPoints < COURT_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}
	return {
		ok: true,
		actionPoints: suitor.actionPoints - COURT_ACTION_POINT_COST,
		delta: COURT_AFFECTION_GAIN
	};
}

// --- Kinder --------------------------------------------------------------------------

/** Was über eine mögliche Mutter bekannt sein muss. */
export interface Mother {
	birthTick: number;
	spouseId: string | null;
	pregnantSinceTick: number | null;
	/** Freie Plätze im Wohnhaus. Ohne Dach über dem Kopf: null. */
	freeHomeSpace: number | null;
}

/**
 * Empfängt sie in diesem Tick?
 *
 * Die Wohnraumprüfung ist die Rückkopplung, die die Bevölkerung im Gleichgewicht hält:
 * Kinder kommen nur, wo Platz ist. Damit hängt die Geburtenrate an den Bauwerken aus
 * 4.5 — wer wachsen will, muss ausbauen, und knappes Bauland wirkt bis in die
 * Kinderstube. Eine Stadt, die voll ist, stagniert von selbst, statt bis zum Kollaps zu
 * wachsen.
 *
 * Wer kein Zuhause hat, bekommt keine Kinder. Hart, aber die Alternative wäre eine
 * Bevölkerung, die sich unabhängig von allem vermehrt. Die Unterkunft für Obdachlose
 * (öffentliches Gebäude, offener Punkt 12) ist der vorgesehene Ausweg.
 */
export function conceives(mother: Mother, currentTick: number, roll: number): boolean {
	if (mother.spouseId === null) return false;
	if (mother.pregnantSinceTick !== null) return false;

	const alter: number = ageInYears(mother.birthTick, currentTick);
	if (alter < FERTILE_FROM_AGE || alter > FERTILE_TO_AGE) return false;

	if (mother.freeHomeSpace === null || mother.freeHomeSpace < 1) return false;

	return roll < CONCEPTION_CHANCE_PER_TICK;
}

/** Ist die Schwangerschaft ausgetragen? */
export function isDue(pregnantSinceTick: number, currentTick: number): boolean {
	return currentTick - pregnantSinceTick >= PREGNANCY_TICKS;
}

/**
 * Welchem Haus ein Kind zufällt.
 *
 * Heiraten zwei Spielerhäuser, entscheidet der Zufall je Kind — kein Geschlecht
 * „heiratet hinein" und gibt sein Haus auf. Beide Spieler haben dieselbe Aussicht auf
 * einen Erben, und keiner muss fürchten, mit der Ehe seine Dynastie zu beenden.
 *
 * Hat nur ein Elternteil ein Haus, fallen alle Kinder daran; hat keiner eines, wächst
 * das Kind als Fremd-NPC auf.
 */
export function assignDynasty(
	motherDynastyId: string | null,
	fatherDynastyId: string | null,
	roll: number
): string | null {
	if (motherDynastyId === null) return fatherDynastyId;
	if (fatherDynastyId === null) return motherDynastyId;
	if (motherDynastyId === fatherDynastyId) return motherDynastyId;
	return roll < 0.5 ? motherDynastyId : fatherDynastyId;
}
