import type { ActionFailureReason } from '$lib/game/actionFailure';
import { AGE_OF_MAJORITY, ageInYears, TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Wahlen und Ämter.
 *
 * **Es gibt keine Ämtertabelle.** Der Amtsinhaber ergibt sich aus der letzten
 * abgeschlossenen Wahl: Es ist der bestplatzierte Kandidat, der noch lebt. Damit ist die
 * Nachfolge beim Tod keine Sonderbehandlung, sondern dieselbe Rechnung — der
 * Zweitplatzierte rückt nach, weil er nach dem Toten der Beste ist. Eine zweite Ablage
 * daneben könnte mit dem Wahlergebnis auseinanderlaufen; diese kann es nicht.
 *
 * **Jeder Erwachsene hat eine Stimme.** Nicht der Grundbesitz, nicht das Haus — die
 * Person. Damit zählt Hausmacht: viele Kinder, viele gut behandelte Angestellte, viele
 * Freunde. Genau das soll der Hebel sein, und nicht das Vermögen.
 */

/** Die Ämter, die es gibt. Weitere kommen mit ihren Aufgaben. */
export const OFFICES = ['MAYOR'] as const;
export type Office = (typeof OFFICES)[number];

export const OFFICE_NAMES: Record<Office, string> = {
	MAYOR: 'Bürgermeister'
};

/**
 * Wie lange eine Amtszeit dauert.
 *
 * Fünf Spieljahre sind zehn Realtage — lang genug, dass ein Bürgermeister etwas zustande
 * bringt und man ihn danach dafür belangen kann, kurz genug, dass ein schlechter nicht
 * eine Generation lang bleibt. Ein Charakter erlebt in seinem Leben gut zehn Wahlen.
 */
export const TERM_YEARS = 5;
export const TERM_TICKS: number = TERM_YEARS * TICKS_PER_YEAR;

/**
 * Wie lange zwischen Ausrufung und Auszählung Zeit ist.
 *
 * Ein Spieljahr — zwei Realtage. Wer nur alle paar Tage hereinschaut, soll seine Stimme
 * abgeben können, ohne den Tag der Auszählung zu treffen.
 */
export const CAMPAIGN_TICKS: number = TICKS_PER_YEAR;

/** Wer wählen und gewählt werden darf. */
export function isEligible(birthTick: number, currentTick: number): boolean {
	// Dieselbe Grenze wie fürs Heiraten, Arbeiten und Erben — eine Zahl weniger, die man
	// kennen muss. Und Kleinkinder wählen nicht, was die Sorge aus Punkt 9 erledigt.
	return ageInYears(birthTick, currentTick) >= AGE_OF_MAJORITY;
}

export type CandidacyOutcome = { ok: true } | { ok: false; reason: ActionFailureReason };

export function canStand(
	candidate: { birthTick: number; alreadyStanding: boolean },
	election: { open: boolean },
	currentTick: number
): CandidacyOutcome {
	if (!election.open) return { ok: false, reason: 'NO_ELECTION' };
	if (!isEligible(candidate.birthTick, currentTick)) return { ok: false, reason: 'TOO_YOUNG' };
	if (candidate.alreadyStanding) return { ok: false, reason: 'ALREADY_STANDING' };
	return { ok: true };
}

export type VoteOutcome = { ok: true } | { ok: false; reason: ActionFailureReason };

export function canVote(
	voter: { birthTick: number; alreadyVoted: boolean },
	election: { open: boolean; candidates: string[] },
	candidateId: string,
	currentTick: number
): VoteOutcome {
	if (!election.open) return { ok: false, reason: 'NO_ELECTION' };
	if (!isEligible(voter.birthTick, currentTick)) return { ok: false, reason: 'TOO_YOUNG' };
	if (voter.alreadyVoted) return { ok: false, reason: 'ALREADY_VOTED' };
	if (!election.candidates.includes(candidateId)) return { ok: false, reason: 'NO_SUCH_PERSON' };
	return { ok: true };
}

/** Ein Kandidat mit seinen Stimmen. */
export interface Tally {
	candidateId: string;
	votes: number;
}

/**
 * Die Rangfolge einer Wahl.
 *
 * Bei Gleichstand entscheidet die Reihenfolge der Kandidatur: Wer sich zuerst aufstellen
 * ließ, steht vorn. Ein Münzwurf wäre gerechter und wäre schlechter — er machte das
 * Ergebnis von einem Zufall abhängig, den niemand nachvollziehen kann, und bei jedem
 * Nachrücken müsste neu geworfen werden.
 */
export function ranking(tallies: Tally[], candidateOrder: string[]): string[] {
	return [...tallies]
		.sort((a, b) => {
			if (b.votes !== a.votes) return b.votes - a.votes;
			return candidateOrder.indexOf(a.candidateId) - candidateOrder.indexOf(b.candidateId);
		})
		.map((eintrag) => eintrag.candidateId);
}

/**
 * Wer das Amt jetzt innehat.
 *
 * Der bestplatzierte Kandidat, der noch lebt — daraus ergibt sich die Nachfolge beim Tod
 * von selbst. `undefined`, wenn niemand mehr übrig ist; dann muss neu gewählt werden.
 */
export function currentHolder(rankedIds: string[], living: Set<string>): string | undefined {
	return rankedIds.find((id) => living.has(id));
}

/**
 * Wen ein NPC wählt.
 *
 * Den, zu dem er die größte Zuneigung hat — es gibt kein eigenes Wahlkampfsystem. Wer
 * über Generationen Beziehungen gepflegt, anständig entlohnt und die Familie vergrößert
 * hat, hat Stimmen; wer die Stadt gegen sich aufgebracht hat, verliert sie.
 *
 * Bei gleicher Zuneigung entscheidet der Ehrgeiz des Wählers **nicht** — er stimmt für
 * den Erstgenannten. Nur wer selbst antritt, wählt sich selbst.
 */
export function npcChoice(
	voterId: string,
	affections: { candidateId: string; affection: number }[]
): string | undefined {
	if (affections.length === 0) return undefined;

	const eigene = affections.find((eintrag) => eintrag.candidateId === voterId);
	if (eigene) return voterId;

	return affections.reduce((bester, eintrag) =>
		eintrag.affection > bester.affection ? eintrag : bester
	).candidateId;
}

/**
 * Ab welchem Ehrgeiz sich ein NPC zur Wahl stellt.
 *
 * Über dem Durchschnitt, aber nicht am Rand: Ein Wahlzettel, auf dem jeder steht, macht
 * die Wahl zur Lotterie — einer, auf dem nie jemand steht, macht sie zur Formsache. Der
 * erste Wert (40) war zu hoch: Unter den acht Gründern der Stadt lag niemand darüber, und
 * die Wahl lief dreimal ins Leere. Bei 30 sind es drei von acht.
 */
export const AMBITION_TO_STAND = 30;

export function wouldStand(ambition: number): boolean {
	return ambition >= AMBITION_TO_STAND;
}
