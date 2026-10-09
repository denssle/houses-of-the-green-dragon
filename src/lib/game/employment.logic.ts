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
	| {
			ok: true;
			wage: number;
			employeeMoney: number;
			employerMoney: number;
			produced: number;
			/** Gearbeitet, aber nichts zu arbeiten gehabt — der Lohn lief trotzdem. */
			idle: boolean;
	  }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Schicht für fremde Rechnung.
 *
 * Der Ertrag geht ins Betriebslager, der Lohn aus der Kasse des Eigentümers an den
 * Angestellten. **Kann der Eigentümer nicht zahlen, findet die Schicht nicht statt** —
 * und zwar bevor Aktionspunkte verbraucht sind: Ein Angestellter, der umsonst arbeitet,
 * weil die Kasse leer war, hätte seinen Tag verloren, ohne es vorher wissen zu können.
 *
 * **Leerlauf ist kein Fehlschlag.** Fehlt im Betriebslager, was das Rezept verlangt, oder
 * steht die Jahreszeit gegen die Arbeit, dann ist der Angestellte trotzdem gekommen — und
 * er wird bezahlt. Für Arbeit zu sorgen ist Sache des Arbeitgebers, und hier zahlt er für
 * sein Versäumnis. Der Unterschied zur leeren Kasse ist genau dieser: Dort fehlt der
 * Lohn, hier fehlt die Arbeit. Nur eines davon kann der Angestellte am Abend in der Hand
 * halten.
 */
export function workShift(
	employee: { actionPoints: number; money: number },
	employer: { money: number },
	wagePerActionPoint: number,
	actionPointCost: number,
	produced: number,
	/** Nichts zu tun — kein Material im Lager oder die falsche Jahreszeit. */
	idle: boolean = false
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
		// Wer nichts herstellen konnte, hat nichts hergestellt. Der Lohn bleibt davon
		// unberührt, der Ertrag nicht.
		produced: idle ? 0 : produced,
		idle
	};
}

/**
 * Lohnt sich die Stelle gegenüber dem, was man ohne sie verdient?
 *
 * Die Frage, nach der ein NPC eine Anstellung sucht: Er nimmt sie, wenn sie mindestens so
 * viel bringt wie die Tagelöhnerei in der städtischen Schmiede. Kein Verhandeln, kein
 * Warten auf ein besseres Angebot — ein Blick auf den Aushang.
 *
 * **Bei gleichem Lohn zählt der Aushang, nicht das Mehr** (5.66). Bis hierher stand hier
 * ein `>`, und das machte die ganze Handlung zu totem Code: `TAGELOHN` ist der einzige
 * Lohn, den in dieser Welt je ein Aushang nennt — der Handwerker, der Leute sucht, bietet
 * ihn, und der Bürgermeister zahlt ihn seiner Wache. Drei ist nicht größer als drei, also
 * war `betterJobAvailable` immer falsch, `TAKE_JOB` fiel nie, und kein NPC hatte je eine
 * Stelle. In einem Messlauf über 1500 Ticks: ein ausgehängtes Angebot, null Bewerbungen.
 *
 * Die Absicht stand daneben schon geschrieben — `TAGELOHN` ist als die Zahl beschrieben,
 * unter der niemand jemanden fände, und der Handwerker bietet sie, weil mehr „großzügig
 * auf Kosten des eigenen Ertrags" wäre. Beides setzt voraus, dass gleicher Lohn genügt.
 * Die Prüfung verlangte mehr; sie war der Fehler, nicht die Höhe des Aushangs.
 *
 * **Der Gleichstand ist kein Gleichstand.** Wer angestellt ist, arbeitet im Betrieb: Sein
 * Lohn kommt aus dessen Kasse, sein Ertrag bleibt dort — und deshalb stellt jemand
 * überhaupt jemanden ein. Der Tagelöhner richtet dafür fremde Häuser her. Bei derselben
 * Zahl auf dem Zettel ist die Stelle die Arbeit, die etwas aufbaut.
 *
 * **Womit sie erkauft ist:** Der Angestellte hängt an der Kasse seines Chefs. Ist die
 * leer, geht er leer aus (`EMPLOYER_BROKE`), während die Stadtkasse noch gezahlt hätte —
 * und hier steht keine Prüfung auf die Zahlungskraft des Betriebs. Gemessen wurde das
 * Gegenteil des Befürchteten: Vorher scheiterten 228 Schichten an `EMPLOYER_BROKE`,
 * nachher keine einzige. Die leere Kasse war nie die eines Meisters, sondern die der
 * Stadt — weil jeder ohne Stelle in die öffentliche Instandsetzung ging und sie leer
 * arbeitete. Die Stadtkasse steht am Ende bei 574 statt bei 309.
 *
 * Die Prüfung gehört trotzdem hierher, sobald ein Betrieb einen Angestellten wirklich
 * über längere Zeit trägt. Denn genau das ist der neue Befund: Am Hof häuften sich 3082
 * Stämme, die niemand mehr versägte (`HARVEST` 208 → 647, `CRAFT` 608 → 512). Wer Leute
 * hat, erntet — verarbeiten muss er weiterhin selbst.
 */
export function isWorthTaking(offeredWage: number, fallbackWage: number): boolean {
	return offeredWage >= fallbackWage;
}

/**
 * Wie viele Schichten ein Arbeitgeber bezahlen können muss, damit einer zu ihm wechselt
 * (5.99, Punkt 115).
 *
 * Wer für eine knappe Ware die Stelle wechselt, gibt etwas auf. Ein Betrieb, dessen
 * Besitzer ihn nicht bezahlen kann, ist kein Wechsel, sondern ein Absturz — und
 * `WORK/EMPLOYER_BROKE` stand schon vorher mit dreihundert Fehlschlägen je Lauf im Bericht.
 * Zehn Schichten sind gut eine Woche Spielzeit: genug, dass die Ware des Betriebs bis dahin
 * verkauft ist und der Lohn aus ihrem Erlös kommt.
 */
export const SWITCH_RUNWAY_SHIFTS = 10;

/** Kann der Arbeitgeber einen, der zu ihm wechselt, eine Weile bezahlen? */
export function canCarryNewHand(employerMoney: number, wage: number): boolean {
	return employerMoney >= wage * SWITCH_RUNWAY_SHIFTS;
}
