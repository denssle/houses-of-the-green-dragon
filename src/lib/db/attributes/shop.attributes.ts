/**
 * Das Lager eines Betriebs und die Preisschilder daran.
 *
 * **Der Betrieb hat einen eigenen Vorrat** — nicht der Eigentümer stellvertretend. Das
 * macht aus einem Gebäude ein Ding mit eigener Bilanz: Man legt Ware ein, hängt ein
 * Preisschild dran, und was verkauft wird, geht daraus weg. Vor allem aber ist es der
 * Ort, in den ab der Anstellung fremde Hände produzieren; ohne ihn wäre ein Betrieb nur
 * ein Schaufenster für das Inventar seines Besitzers.
 *
 * Beide Tabellen sind **spärlich**: Kein Posten, keine Zeile.
 */
export interface BuildingStockAttributes {
	BuildingId: string;
	itemId: string;
	quantity: number;
}

export type BuildingStockCreationAttributes = BuildingStockAttributes;

/**
 * Ein ausgehängtes Angebot.
 *
 * Die Ware liegt **im Angebot**, nicht daneben: Beim Aushängen wandert sie aus dem Lager
 * (eigener Laden) oder aus der eigenen Habe (Marktstand) hierher. Damit kann niemand
 * dieselben zehn Laibe an drei Ständen gleichzeitig anbieten, und ein Kauf braucht keine
 * zweite Prüfung, ob es sie noch gibt.
 *
 * `SellerCharacterId` steht dabei, weil am Marktplatz mehrere Verkäufer nebeneinander
 * anbieten — im eigenen Laden ist es immer der Eigentümer.
 */
export interface ShopOfferAttributes {
	id: string;
	BuildingId: string;
	SellerCharacterId: string;
	itemId: string;
	quantity: number;
	pricePerUnit: number;
}

export type ShopOfferCreationAttributes = ShopOfferAttributes;
