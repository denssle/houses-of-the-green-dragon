import type { ActionFailureReason } from '$lib/game/actionFailure';
import { canAfford } from '$lib/game/economy';
import { type BuildingTemplate, levelOf, maxLevel } from '$lib/model/buildingTemplate';

/**
 * Anstellung: für fremde Rechnung arbeiten.
 *
 * Bis hierher war ein Betrieb ein **Werkzeug** — wer mahlte, mahlte sein eigenes
 * Getreide. Mit der Anstellung wird er ein **Arbeitgeber**: Der Angestellte setzt seine
 * Aktionspunkte ein, der Ertrag geht ins Betriebslager, und er bekommt dafür Lohn aus
 * der Kasse des Eigentümers.
 *
 * Damit schließt sich der Kreis, den das Konzept meint: „Angestellte NPCs arbeiten im
 * Betrieb, kosten Lohn und erzeugen Wert — das schließt den Kreis zur Familienmechanik:
 * viele Kinder sind Arbeitskraft."
 *
 * **Der Lohn kommt aus einer echten Kasse.** Wer niemanden bezahlen kann, hat keine
 * Angestellten — das ist der Unterschied zur städtischen Schmiede, die aus dem Nichts
 * zahlt und genau deshalb eine Krücke ist.
 */

/** Wie viele Leute auf einer Ausbaustufe Arbeit finden. */
export function positionsAt(template: BuildingTemplate, level: number): number {
	// Ein Betrieb ohne Rezept und ohne Lohn ist kein Arbeitsplatz — ein Wohnhaus stellt
	// niemanden ein.
	if (!template.recipes?.length && !levelOf(template, level).wagePerActionPoint) return 0;
	// Je Ausbaustufe eine Stelle mehr. Wer mehr Hände will, muss ausbauen — dieselbe
	// Leiter wie beim Wohnraum, und derselbe Grund: Wachstum soll etwas kosten.
	return Math.min(level, maxLevel(template));
}

export type HiringOutcome = { ok: true } | { ok: false; reason: ActionFailureReason };

/**
 * Darf hier jemand anfangen?
 *
 * Der Eigentümer stellt nicht sich selbst ein, und wer schon eine Stelle hat, hat eine.
 * Zwei Anstellungen zugleich wären kein Fehler der Welt, aber eine Buchhaltung mehr,
 * ohne dass jemand danach gefragt hätte.
 */
export function canTakeJob(
	applicant: { id: string; isAdult: boolean; hasJob: boolean },
	job: { ownerId: string | null; wage: number | null; positions: number; taken: number }
): HiringOutcome {
	if (job.wage === null) return { ok: false, reason: 'NO_JOB_OFFERED' };
	if (job.ownerId === applicant.id) return { ok: false, reason: 'ALREADY_OWNED' };
	if (!applicant.isAdult) return { ok: false, reason: 'TOO_YOUNG' };
	if (applicant.hasJob) return { ok: false, reason: 'ALREADY_EMPLOYED' };
	if (job.taken >= job.positions) return { ok: false, reason: 'NO_ROOM' };
	return { ok: true };
}

export type ShiftOutcome =
	| { ok: true; wage: number; employeeMoney: number; employerMoney: number; produced: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Schicht für fremde Rechnung.
 *
 * Der Ertrag geht ins Betriebslager, der Lohn aus der Kasse des Eigentümers an den
 * Angestellten. **Kann der Eigentümer nicht zahlen, findet die Schicht nicht statt** —
 * und zwar bevor Aktionspunkte verbraucht sind: Ein Angestellter, der umsonst arbeitet,
 * weil die Kasse leer war, hätte seinen Tag verloren, ohne es vorher wissen zu können.
 */
export function workShift(
	employee: { actionPoints: number; money: number },
	employer: { money: number },
	wagePerActionPoint: number,
	actionPointCost: number,
	produced: number
): ShiftOutcome {
	if (employee.actionPoints < actionPointCost) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}

	const lohn: number = wagePerActionPoint * actionPointCost;
	if (!canAfford(employer.money, lohn)) {
		return { ok: false, reason: 'EMPLOYER_BROKE' };
	}

	return {
		ok: true,
		wage: lohn,
		employeeMoney: employee.money + lohn,
		employerMoney: employer.money - lohn,
		produced
	};
}

/**
 * Lohnt sich die Stelle gegenüber dem, was man ohne sie verdient?
 *
 * Die Frage, nach der ein NPC eine Anstellung sucht: Er nimmt sie, wenn sie mehr bringt
 * als die Tagelöhnerei in der städtischen Schmiede. Kein Verhandeln, kein Warten auf ein
 * besseres Angebot — ein Blick auf den Aushang.
 */
export function isWorthTaking(offeredWage: number, fallbackWage: number): boolean {
	return offeredWage > fallbackWage;
}
