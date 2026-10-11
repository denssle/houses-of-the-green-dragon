/**
 * **Sequelizes Vorsorge-Stack ohne Vites Übersetzung** (Punkt 67, gemessen 09.10.2026).
 *
 * Sequelize 6 legt bei **jeder** SQLite-Abfrage ein `new Error()` an und liest dessen
 * `.stack` aus — auch wenn die Abfrage gelingt, für den Fall, dass sie es nicht tut
 * (`dialects/sqlite/query.js`). Unter Vitest hängt an diesem Auslesen Vites
 * Source-Map-Übersetzung, die jeden Frame einzeln zurückrechnet. Im CPU-Profil eines Ticks
 * war das ein Sechstel der Zeit; ohne sie läuft ein Tick bei 14 Einwohnern gut 20 % schneller.
 *
 * Erkannt wird genau dieser Stack — leere Meldung, angelegt in Sequelizes SQLite-Abfrage —
 * und mit Node-Bordmitteln formatiert. **Was dabei verloren geht:** Scheitert in einem Test
 * eine Abfrage, nennt ihr Stack die übersetzten statt der ursprünglichen Zeilennummern.
 * Alle anderen Fehler laufen weiter durch Vites Übersetzung.
 *
 * Nur für Tests: Im Betrieb gibt es keine Source-Map-Übersetzung, die hier zu sparen wäre.
 */
const uebersetzt = Error.prepareStackTrace;

Error.prepareStackTrace = (fehler, frames) => {
	if (
		fehler.message === '' &&
		frames[0]?.getFileName()?.includes('sequelize/lib/dialects/sqlite/query.js')
	) {
		return `${fehler}\n${frames.map((frame) => `    at ${frame}`).join('\n')}`;
	}
	return uebersetzt ? uebersetzt(fehler, frames) : `${fehler}`;
};
