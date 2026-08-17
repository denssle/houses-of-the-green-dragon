/**
 * Was sich an einem Gebäude tun lässt.
 *
 * Der Prototyp kannte daneben `SLEEP` und `BECOME_CITIZEN` — beides ist mit Phase 3.3
 * entfallen: Aktionspunkte wachsen je Tick von selbst nach, womit Schlafen nichts
 * bewirkte, und ein Bürgerrecht kennt das Konzept nicht (jeder Charakter hat eine
 * Stimme). Erholung bekommt mit den Bedürfnissen aus 4.6 eine Wirkung; dann kommt sie
 * wieder — dann aber mit Folgen.
 *
 * **`WORK` ist mit 5.26 gefallen.** Es war die Tagelöhnerei in der städtischen Schmiede:
 * hineingehen, eine Schicht arbeiten, drei Münzen mitnehmen — und niemand bekam etwas
 * dafür. Solange die Münzen aus dem Nichts kamen, fiel das nicht auf; seit der Lohn eine
 * Kasse hat (5.24), war es ein Fass ohne Boden. Keine mittelalterliche Stadt hat
 * Tagelöhner als Sozialsystem beschäftigt.
 *
 * An seine Stelle tritt `REPAIR_FOR_HIRE`: **Arbeit, die etwas hinterlässt.** Wer an einem
 * öffentlichen Bau arbeitet, setzt ihn instand; die Stadt zahlt dafür denselben Lohn wie
 * zuvor, bekommt aber einen Gegenwert. Damit ist die Ausgabe gedeckt — und der
 * Bürgermeister zahlt Menschen statt abstrakter Kosten, denn instand gesetzt wurde auch
 * vorher schon, nur zahlte er an niemanden.
 */
export type BuildingAction = 'REPAIR_FOR_HIRE';
