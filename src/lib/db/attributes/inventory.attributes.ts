/**
 * Was jemand besitzt — **spärlich gespeichert**, wie Zuneigung und Können.
 *
 * Wer nie ein Brot hatte, hat dazu keine Zeile; das gilt als null Stück. Bei einem
 * wachsenden Warenkatalog und einer wachsenden Bevölkerung wäre alles andere Ballast.
 * Zeilen, die auf null fallen, verschwinden beim Schreiben.
 */
export interface InventoryAttributes {
	CharacterId: string;
	itemId: string;
	quantity: number;
}

export type InventoryCreationAttributes = InventoryAttributes;
