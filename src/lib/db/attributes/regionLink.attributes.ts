/**
 * Eine Wegverbindung zwischen zwei Orten, gemessen in Ticks.
 *
 * Die Karte ist damit eine Liste von Orten mit Entfernungen und kein Kachelraster: Für
 * Reisezeit, Transportkosten und Fernhandel genügt das, und ein neuer Ort ist eine
 * Zeile statt einer Kartografie.
 *
 * Die Verbindung wird in beide Richtungen abgelegt — wer von A nach B will, findet die
 * Zeile ohne ein `OR` über zwei Spalten.
 */
export interface RegionLinkAttributes {
	fromRegionId: string;
	toRegionId: string;
	distanceInTicks: number;
}

export type RegionLinkCreationAttributes = RegionLinkAttributes;
