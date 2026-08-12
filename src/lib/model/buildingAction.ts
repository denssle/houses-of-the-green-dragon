/**
 * Was sich an einem Gebäude tun lässt.
 *
 * Vorerst nur Arbeiten. Der Prototyp kannte daneben `SLEEP` und `BECOME_CITIZEN` —
 * beides ist mit Phase 3.3 entfallen: Aktionspunkte wachsen je Tick von selbst nach,
 * womit Schlafen nichts bewirkte, und ein Bürgerrecht kennt das Konzept nicht (jeder
 * Charakter hat eine Stimme). Erholung bekommt mit den Bedürfnissen aus 4.6 eine
 * Wirkung; dann kommt sie wieder — dann aber mit Folgen.
 */
export type BuildingAction = 'WORK';
