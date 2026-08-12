/**
 * Fehde oder Freundschaft zwischen zwei Häusern — ebenfalls spärlich gespeichert, und
 * ebenfalls abklingend: Auch eine Feindschaft, die niemand nährt, wird mit der Zeit
 * gleichgültig.
 *
 * Der Wert wächst auf zwei Wegen: inkrementell, wenn sich Mitglieder der beiden Häuser
 * gut oder schlecht behandeln, und sprunghaft, wenn ein Oberhaupt Fehde, Frieden oder
 * ein Bündnis erklärt.
 */
export interface DynastyRelationshipAttributes {
	fromDynastyId: string;
	toDynastyId: string;
	standing: number;
	lastChangedTick: number;
}

export type DynastyRelationshipCreationAttributes = DynastyRelationshipAttributes;
