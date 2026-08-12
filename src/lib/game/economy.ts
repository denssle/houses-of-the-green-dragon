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

/** Reicht das Geld? Eine eigene Funktion, damit die Richtung des Vergleichs an einer
 * Stelle steht — im Prototyp war genau dieser Vergleich verdreht und verbot den Kauf,
 * sobald man genug hatte. */
export function canAfford(money: number, price: number): boolean {
	return money >= price;
}
