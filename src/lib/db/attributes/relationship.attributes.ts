/**
 * Die persönliche Zuneigung zwischen zwei Charakteren — gespeichert wird nur die
 * **Abweichung** vom Grundwert, nicht die Zuneigung selbst.
 *
 * Der Grundwert setzt sich aus Verwandtschaft (aus dem Stammbaum gerechnet) und dem
 * Stand der beiden Häuser zusammen; fehlt eine Zeile, gilt genau er. Ohne diese
 * Sparsamkeit wüchse die Tabelle quadratisch mit der Einwohnerzahl und enthielte fast
 * nur Nullen.
 *
 * Die Richtung ist asymmetrisch: A kann B schätzen, ohne dass es erwidert wird.
 * `affection` darf negativ werden und den Grundwert unterschreiten — ein misshandeltes
 * Kind hasst seinen Vater trotz Verwandtschaftsbonus.
 */
export interface RelationshipAttributes {
	fromCharacterId: string;
	toCharacterId: string;
	affection: number;
	lastChangedTick: number;
}

export type RelationshipCreationAttributes = RelationshipAttributes;
