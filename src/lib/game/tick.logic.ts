import {
	ACTION_POINTS_PER_TICK,
	HOURS_PER_TICK,
	MAX_ACTION_POINTS,
	MS_PER_TICK
} from '$lib/game/time';

/**
 * Die Zeitrechnung als reine Funktionen: Wie viele Ticks fällig sind, was davon gelebt
 * wurde und wie viel Kraft daraus nachwächst. Alles ohne Datenbank und ohne Uhr — die
 * Zeit wird hereingereicht, damit sich ein dreitägiger Ausfall in einem Test nachstellen
 * lässt, statt drei Tage zu warten.
 */

/**
 * Was beim Weiterstellen der Weltuhr zu tun ist. `null`, solange noch kein voller Tick
 * vergangen ist.
 */
export interface WorldAdvance {
	/** Um so viele Ticks rückt die Weltzeit vor. */
	ticks: number;
	/**
	 * Davon verpasst: Ticks, in denen der Server nicht lief. Sie zählen für die Weltuhr,
	 * aber niemand bekommt etwas für sie.
	 */
	missed: number;
	/** Der neue Ankerpunkt in Echtzeit. */
	lastTickAt: Date;
}

/**
 * Rechnet aus, wie weit die Weltuhr vorzustellen ist.
 *
 * Der neue Ankerpunkt ist **nicht** `now`, sondern der alte plus die vollen Ticks. Sonst
 * ginge bei jedem Durchlauf der angebrochene Rest verloren und die Weltzeit bliebe
 * langsam, aber stetig hinter der Echtzeit zurück.
 *
 * Was über den ersten Tick hinausgeht, gilt als **verpasst**: Läuft der Server, kommt
 * dieser Takt im Minutenrhythmus vorbei und findet höchstens einen fälligen Tick vor.
 * Mehrere bedeuten, dass der Prozess dazwischen nicht lief.
 */
export function planWorldAdvance(lastTickAt: Date, now: Date): WorldAdvance | null {
	const vergangen: number = now.getTime() - lastTickAt.getTime();

	// Ein ungültiger Ankerpunkt ergibt NaN, und NaN rechnet sich stillschweigend durch bis
	// in ein `UPDATE worlds SET currentTick = NULL`. Die Datenbank fängt das zwar ab, aber
	// mit einer Meldung, die das Symptom nennt und nicht die Ursache. Passiert ist das
	// beim Nachstellen von Hand: Wer `lastTickAt` in einem Format schreibt, das Sequelize
	// nicht als Datum liest, bekommt hier ein `Invalid Date` herein.
	if (!Number.isFinite(vergangen)) {
		throw new Error(
			`Ungültiger Ankerpunkt der Weltzeit: ${String(lastTickAt)}. ` +
				'Steht in `worlds.lastTickAt` ein Datum, das der Treiber lesen kann?'
		);
	}

	if (vergangen < MS_PER_TICK) return null;

	const ticks: number = Math.floor(vergangen / MS_PER_TICK);
	return {
		ticks,
		missed: ticks - 1,
		lastTickAt: new Date(lastTickAt.getTime() + ticks * MS_PER_TICK)
	};
}

/**
 * Wie viele Minuten bis zum nächsten Tick — und damit bis zum nächsten Aktionspunkt.
 *
 * **Die Auskunft, die nirgends stand** (Punkt 57). „Warte, bis wieder Aktionspunkte da
 * sind" nennt kein Maß: Wer das liest, weiß nicht, ob er in zehn Minuten wiederkommt oder
 * morgen. Die Zahl ergibt sich aus dem Ankerpunkt der Weltuhr, den es ohnehin gibt.
 *
 * Aufgerundet, weil „in 0 Minuten" nach einem Fehler aussieht und nicht nach gleich.
 */
export function minutesToNextTick(lastTickAt: Date, now: Date = new Date()): number {
	const seitdem: number = now.getTime() - lastTickAt.getTime();
	if (!Number.isFinite(seitdem)) return HOURS_PER_TICK * 60;

	const offen: number = MS_PER_TICK - (seitdem % MS_PER_TICK);
	return Math.max(1, Math.ceil(offen / 60_000));
}

/**
 * Wie viel Aktionsbudget aus den verstrichenen Ticks nachgewachsen ist.
 *
 * Faul ausgewertet: Es gibt keinen Durchlauf über alle Charaktere, der stündlich einen
 * Punkt verteilt — die Zahl ergibt sich beim Zugriff aus der Differenz. Gedeckelt, damit
 * ein halbes Jahr Abwesenheit nicht in einem einzigen Zug abgearbeitet werden kann.
 *
 * Ein Rückwärtsgang ist ausgeschlossen: Steht `lastTickProcessed` in der Zukunft — nach
 * einem übersprungenen Ausfall ist das der Normalfall —, wächst nichts nach, aber es geht
 * auch nichts verloren.
 */
export function regrownActionPoints(
	actionPoints: number,
	lastTickProcessed: number,
	currentTick: number,
	max: number = MAX_ACTION_POINTS
): number {
	const verstrichen: number = Math.max(0, currentTick - lastTickProcessed);
	return Math.min(max, actionPoints + verstrichen * ACTION_POINTS_PER_TICK);
}
