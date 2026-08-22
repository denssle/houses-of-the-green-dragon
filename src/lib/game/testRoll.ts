/**
 * Ein Würfel, der sich wiederholen lässt (Punkt 54).
 *
 * **Wofür.** Mehrere Tests bauen eine Welt auf und prüfen dann, was in ihr geschieht.
 * Solange `seedWorld` mit `Math.random` würfelt, prüfen sie jedes Mal eine andere Welt —
 * und schlagen gelegentlich fehl, ohne dass sich etwas geändert hätte. Ein Test, der
 * gelegentlich rot ist, ist auf Dauer schlimmer als keiner: Man gewöhnt sich an, ihn noch
 * einmal laufen zu lassen, und übersieht das eine Mal, bei dem er recht hatte.
 *
 * **Warum kein fester Wert.** `() => 0.5` wäre einfacher, macht aber alle Gründer
 * gleich — dieselbe Anlage, dasselbe Startkapital. Eine Welt ohne Unterschiede ist keine
 * Probe für ein Spiel, das von Unterschieden lebt. Diese Folge streut wie ein Würfel und
 * kommt bei gleichem Startwert doch immer gleich heraus.
 *
 * Das Verfahren ist `mulberry32` — vier Zeilen, gemeinfrei, gut genug für Testdaten und
 * ausdrücklich nicht für irgendetwas, das Sicherheit braucht.
 *
 * Gehört zur Spiellogik und nicht in eine Testdatei, weil ihn mehrere Specs teilen — und
 * weil ein Werkzeug, das nur in einer Datei lebt, beim zweiten Bedarf kopiert wird.
 */
export function seededRoll(seed: number = 1): () => number {
	let zustand: number = seed >>> 0;
	return () => {
		zustand = (zustand + 0x6d2b79f5) >>> 0;
		let t: number = zustand;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
