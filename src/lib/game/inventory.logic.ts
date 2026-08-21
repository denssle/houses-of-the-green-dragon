/**
 * Die Kammer: was ein Mensch bei sich behalten kann.
 *
 * Bis 5.33 war der persönliche Vorrat unbegrenzt. Das machte ihn zum bequemsten Lager der
 * Welt — er kostet nichts, verfällt nicht und wird bei Raubzügen verschont (`KONZEPT.md`,
 * Abschnitt 11: Er ist das, was zwischen einem Charakter und dem Verhungern steht). Wer
 * dreihundert Bretter mit sich herumtrug, hatte keinen Grund, je ein Betriebslager
 * anzurühren, und ein Kornspeicher war Verzierung.
 *
 * **Die Grenze hängt am Dach über dem Kopf.** Wer keines hat, trägt am Leib, was er hat;
 * eine Kate gibt eine Truhe dazu, ein Großhaus eine Kammer. Damit bekommt Wohnen einen
 * zweiten handfesten Zweck neben dem Kraftvorrat — und dieselbe Frage hat dieselbe
 * Antwort wie dort: Warum sollte man ein Haus besitzen, statt irgendwo unterzukommen?
 *
 * **Gezählt wird in Stücken, nicht in Pfund.** Ein Gewicht je Ware hätte mehr Farbe, aber
 * jede künftige Ware bräuchte einen Wert, und „17 von 60 Pfund" lässt sich schlechter
 * überschlagen als „17 von 60 Stück". Die Entscheidung kann später fallen, ohne dass
 * diese Datei mehr als ihre Innereien ändert.
 */

/**
 * Was jeder bei sich trägt, ganz ohne Dach.
 *
 * Nicht null: Obdachlosigkeit ist im Spiel eine Notlage und keine Sackgasse (dieselbe
 * Überlegung wie bei der städtischen Unterkunft). Wer nichts tragen könnte, könnte auch
 * kein Brot kaufen und käme nie wieder heraus.
 */
export const CARRIED_CAPACITY = 20;

/** Was in die Kammer passt: das, was man am Leib trägt, plus das, was das Dach hergibt. */
export function chamberCapacity(fromHome: number): number {
	return CARRIED_CAPACITY + Math.max(0, fromHome);
}

/**
 * Passt das noch hinein?
 *
 * **Wer schon darüber liegt, verliert nichts** — er kann nur nichts mehr aufnehmen. Das
 * ist der Fall, den ein Ausbau rückgängig macht, ein Verfall herbeiführt und ein Umzug in
 * beide Richtungen: Eine Grenze, die Bestände wegwirft, wäre eine Strafe für etwas, das
 * niemand entschieden hat.
 */
export function fitsInChamber(used: number, capacity: number, added: number): boolean {
	if (added <= 0) return true;
	return used + added <= capacity;
}
