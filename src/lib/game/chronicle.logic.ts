/**
 * Die Chronik.
 *
 * **Ein Ereignis ist eine Zeile, kein Text.** Gespeichert werden Art, Zeitpunkt, Ort und
 * die Beteiligten als Kennungen; der Satz entsteht erst beim Anzeigen. Sonst fröre jede
 * Meldung ihre damalige Formulierung ein — und beim ersten Umbenennen stünde in der
 * Chronik ein Name, den es nicht mehr gibt. Dieselbe Trennung wie bei den Fehlergründen
 * in `actionFailure.ts`: Code hier, Sprache in der Oberfläche.
 *
 * **Vorerst wird alles festgehalten.** Solange die Welt eine Testumgebung ist, wiegt
 * Vollständigkeit schwerer als Ordnung: Was nicht mitgeschrieben wurde, lässt sich nicht
 * nachträglich beschaffen. Verdichten kann man später — dann mit Daten in der Hand statt
 * mit einer Vermutung darüber, was interessant gewesen wäre.
 */

export const EVENT_KINDS = [
	'BIRTH',
	'MARRIAGE',
	'DEATH',
	'INHERITANCE',
	'DYNASTY_EXTINCT',
	'ELECTION_OPENED',
	'ELECTION_CLOSED',
	'LAW_ENACTED',
	'BUILDING_BUILT',
	'BUILDING_RENOVATED',
	'BUILDING_RUINED',
	'JOB_TAKEN',
	'JOB_ENDED',
	'SCHOOL_ATTENDED',
	'RAID',
	'FIRE',
	'LAND_DEVELOPED',
	'AUCTION_WON'
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * Wer bei einem Ereignis vorkommt.
 *
 * Zwei Personen reichen für alles, was bisher geschieht: Wer heiratet, heiratet einen;
 * wer erbt, erbt von einem; wer eine Stelle antritt, tritt sie bei einem an. Ein dritter
 * Beteiligter wäre eine Ausnahme, die es noch nicht gibt.
 *
 * `value` ist die Zahl, um die es ging — Münzen, ein Steuersatz, ein Lebensalter. Was sie
 * bedeutet, ergibt sich aus der Art; ein eigenes Feld je Bedeutung wären vierzehn Spalten,
 * von denen dreizehn leer stünden.
 */
export interface EventFacts {
	subjectId?: string | null;
	objectId?: string | null;
	buildingId?: string | null;
	dynastyId?: string | null;
	value?: number | null;
	/** Für Arten mit Unterfällen — die Gesetzesart, die Fertigkeit, das Amt. */
	detail?: string | null;
}

/**
 * Betrifft dieses Ereignis dieses Haus?
 *
 * Die Frage hinter der Haus-Sicht der Chronik. Sie liegt hier und nicht in der Abfrage,
 * weil sie eine Regel ist und keine Technik: Ein Ereignis gehört einem Haus, wenn das
 * Haus selbst genannt ist **oder** einer seiner Angehörigen daran beteiligt war.
 */
export function concernsHouse(
	event: { dynastyId?: string | null; subjectId?: string | null; objectId?: string | null },
	dynastyId: string,
	memberIds: Set<string>
): boolean {
	if (event.dynastyId === dynastyId) return true;
	if (event.subjectId && memberIds.has(event.subjectId)) return true;
	return Boolean(event.objectId && memberIds.has(event.objectId));
}
