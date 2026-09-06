/**
 * Was Dinge kosten und was Arbeit einbringt.
 *
 * Wie `time.ts` eine Sammelstelle für Zahlen, die beim Balancing wieder angefasst
 * werden — verstreut über Services und Routen wären sie nicht mehr auffindbar. Preise
 * von Gebäuden stehen bewusst nicht hier, sondern in ihrer Vorlage
 * (`buildingTemplate.ts`), weil sie je Gebäude verschieden sind.
 */

/**
 * Was ein Baugrundstück in der Stadt kostet.
 *
 * Ein Festpreis für alle Lagen — noch. Sobald Grundstücke gehandelt werden (4.5), setzt
 * der Markt den Preis und dieser hier gilt nur noch für nie vergebenes Stadtland. Er
 * liegt bewusst unter dem billigsten Gebäude: Der erste Schritt ins Eigentum soll früh
 * möglich sein, teuer wird das Haus darauf.
 */
export const PLOT_PRICE = 40;

/**
 * Was die städtische Schmiede zahlt — die Messlatte, ab der sich eine feste Stelle lohnt.
 *
 * Sie ist eine Eigenschaft der Krücke aus 3.3 und nicht der Anstellung: Fällt die Schmiede
 * weg, fällt auch diese Zahl. Bis dahin ist sie der Lohn, den jeder sicher bekommt — und
 * damit die Zahl, an der sich jedes Angebot messen lassen muss. Auch der Bürgermeister
 * zahlt sie seiner Wache; wer weniger böte, fände niemanden.
 */
export const TAGELOHN = 3;

/** Reicht das Geld? Eine eigene Funktion, damit die Richtung des Vergleichs an einer
 * Stelle steht — im Prototyp war genau dieser Vergleich verdreht und verbot den Kauf,
 * sobald man genug hatte. */
export function canAfford(money: number, price: number): boolean {
	return money >= price;
}

/**
 * Was der Kornspeicher über dem Grundpreis nimmt (Punkt 85).
 *
 * **Er ist die Notversorgung und nicht die Konkurrenz.** Bis hierher verkaufte er zum
 * Grundpreis — unbegrenzt, ohne Zutaten, ohne Aktionspunkte, ohne Standgeld. Wer ein
 * Backhaus baute, träte gegen einen Anbieter an, der zum Selbstkostenpreis von null
 * anbietet; damit lohnte kein Backhaus, und die Brotkette wurde nie gebaut.
 *
 * Der Aufschlag dreht die Reihenfolge um: Ein NPC sucht ohnehin **zuerst das billigste
 * Angebot in der Stadt** und geht erst danach zum Amt (siehe `BUY_FOOD` im
 * `npcService`). Verkauft ein Bäcker zum Grundpreis — und mehr nimmt ein NPC nicht —,
 * liegt er ab jetzt sicher darunter.
 *
 * **Die Zahl hat zwei Seiten**, und das ist der Grund, dass sie hier steht und nicht in
 * der Vorlage: Der Kornspeicher ist über vierzig Prozent der Stadteinnahmen. Wer ihn
 * verteuert, füllt nebenbei die Kasse — und verteuert das Brot der Ärmsten, also genau
 * derer, die in Punkt 100 verhungern. Die Hälfte obendrauf ist deshalb bewusst maßvoll:
 * Brot kostet 6 statt 4, ein voller Magen also anderthalb statt einer Münze je zweieinhalb
 * Laibe.
 */
export const GRANARY_MARKUP = 1.5;

/**
 * Was ein Stück beim Kornspeicher kostet.
 *
 * Aufgerundet, weil die Welt in ganzen Münzen rechnet — und aufgerundet statt
 * abgerundet, damit der Aufschlag bei billiger Ware nicht verschwindet.
 */
export function granaryPrice(basePrice: number): number {
	return Math.ceil(basePrice * GRANARY_MARKUP);
}
