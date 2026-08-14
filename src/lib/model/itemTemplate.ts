/**
 * Die Waren — als Code, wie die Gebäudevorlagen.
 *
 * Preise und Wirkungen sollen sich ändern lassen, ohne dass Bestände davon unberührt
 * bleiben: Ein Laib Brot im Lager ist ein Laib Brot, keine eingefrorene Kopie der Werte
 * von damals.
 *
 * **Der Prüfstein ist derselbe wie bei Fertigkeiten und Persönlichkeitsachsen: Wo wirkt
 * die Ware?** Ein Gegenstand, der nur Geld in Punkte verwandelt, ist Dekoration. Deshalb
 * beginnt der Katalog mit **einer** Ware — Brot stillt den Hunger, und der Hunger ist
 * gebaut. Werkzeug, Kleidung, Tränke und Waffen kommen mit den Systemen, in die sie
 * eingreifen (siehe Punkt 15 in `OFFENE_PUNKTE.md`).
 */
export interface ItemTemplate {
	itemId: string;
	name: string;
	description: string;
	/** Wie viel Sättigung ein Stück bringt. Fehlt der Wert, ist es nicht essbar. */
	nourishment?: number;
	/**
	 * Was die Stadt dafür nimmt, solange es noch keine Betriebe gibt, die es herstellen.
	 * Ab 4.6c setzen Verkäufer ihre eigenen Preise.
	 */
	basePrice: number;
}

const WAREN: ItemTemplate[] = [
	{
		itemId: 'GRAIN',
		name: 'Getreide',
		description: 'Roggen vom Acker, ungemahlen.',
		// Der Preis ist der, zu dem die Stadt notfalls einspringt — ein Anhaltspunkt fuer
		// die Kette, kein Marktpreis. Den setzen ab 4.6d die Verkaeufer selbst.
		basePrice: 1
	},
	{
		itemId: 'FLOUR',
		name: 'Mehl',
		description: 'Fein gemahlener Roggen.',
		basePrice: 2
	},
	{
		itemId: 'BREAD',
		name: 'Brot',
		description: 'Ein Laib grobes Roggenbrot.',
		// Zweieinhalb Laibe füllen einen leeren Magen — und halten damit gut vier
		// Realtage. Ein Vorrat für eine Woche ist eine überschaubare Menge.
		nourishment: 40,
		basePrice: 4
	},

	// --- Die Baukette (4.10) ---------------------------------------------------------
	//
	// Alle sechs haben dieselbe Wirkung: Sie werden beim **Bauen und Renovieren**
	// verbraucht. Damit hat Holz einen Preis, weil jemand ein Haus will — und nicht, weil
	// eine Tabelle ihn festlegt.
	{
		itemId: 'WOOD',
		name: 'Holz',
		description: 'Stämme aus dem Eichwald, roh.',
		basePrice: 2
	},
	{
		itemId: 'STONE',
		name: 'Bruchstein',
		description: 'Rohe Blöcke aus dem Steinbruch.',
		basePrice: 3
	},
	{
		itemId: 'ORE',
		name: 'Eisenerz',
		description: 'Was die Grube hergibt — noch nicht viel wert.',
		basePrice: 3
	},
	{
		itemId: 'PLANK',
		name: 'Bretter',
		description: 'Gesägt und gehobelt, bereit für den Dachstuhl.',
		basePrice: 6
	},
	{
		itemId: 'BLOCK',
		name: 'Quader',
		description: 'Behauener Stein für Mauern und Fundamente.',
		basePrice: 8
	},
	{
		itemId: 'IRON',
		name: 'Eisen',
		description: 'Nägel, Bänder, Beschläge — was ein Haus zusammenhält.',
		basePrice: 9
	}
];

export function getItemTemplates(): ItemTemplate[] {
	return WAREN;
}

export function getItemTemplate(itemId: string): ItemTemplate | undefined {
	return WAREN.find((ware) => ware.itemId === itemId);
}
