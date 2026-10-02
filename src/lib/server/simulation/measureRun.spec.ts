import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import '$lib/db/db';
import { measure } from '$lib/server/simulation/measure';

/**
 * Der Messlauf — das Werkzeug, mit dem hier Befunde entstehen.
 *
 *     npm run measure                    500 Ticks
 *     MEASURE_TICKS=2000 npm run measure     (PowerShell: $env:MEASURE_TICKS=2000)
 *     MEASURE_SEED=86 npm run measure        dieselbe Stadt wie beim letzten Mal
 *     MEASURE_FOOD=20 npm run measure        jedem zwanzig Laibe in die Kammer
 *
 * **`MEASURE_SEED` ist der Unterschied zwischen Beschreiben und Belegen** (5.64). Ohne
 * Saat würfelt jeder Lauf eine eigene Stadt; zwei solche Läufe zu vergleichen misst die
 * Ausgangslage mit und nicht die Änderung. Wer eine Wirkung zeigen will, lässt denselben
 * Startwert vor und nach dem Eingriff laufen — wer wissen will, ob die Welt überhaupt
 * trägt, lässt ihn weg.
 *
 * **Warum als Spec und nicht als Skript:** Die Dienste hängen an den `$lib`-Aliasen, und
 * die löst hier nur Vite auf. Ein eigenständiges Skript bräuchte `vite-node` — eine
 * Abhängigkeit mehr für einen Weg, den Vitest ohnehin kennt. Er behauptet trotzdem nichts:
 * Ohne `MEASURE_TICKS` läuft er gar nicht erst, und mit läuft er ohne jede Erwartung durch.
 * Was der Bericht bedeutet, entscheidet der Mensch davor.
 *
 * Der Bericht geht nach `messung.txt` **und** auf die Ausgabe — die Datei, weil ein Lauf
 * über zweitausend Ticks eine gute halbe Stunde dauert und man ihn danach in Ruhe lesen
 * will, statt im Scrollback zu suchen.
 */

const ticks: number = Number(process.env.MEASURE_TICKS ?? 0);
const every: number = Number(process.env.MEASURE_EVERY ?? 250);
const saat: number | undefined =
	process.env.MEASURE_SEED === undefined ? undefined : Number(process.env.MEASURE_SEED);
/**
 * **`MEASURE_TRACE=Reimar`** schreibt das Leben eines Einzelnen Tick für Tick mit (5.88):
 * gewählte Handlung, Stufe, Fehlschlag und die rohen Schalter seines Zustands. Für die
 * Frage, die kein Aggregat beantwortet — warum tut *der* nichts.
 *
 * **`MEASURE_MONEY=400`** gibt jedem so viel in die Hand, auch jedem Zugezogenen. Ein
 * Werkzeug, um eine Sperre auszuschließen: Wenn niemand pachtet und niemand baut, ist die
 * erste Frage, ob es am Geld liegt.
 */
const verfolge: string | undefined = process.env.MEASURE_TRACE;
const startgeld: number | undefined =
	process.env.MEASURE_MONEY === undefined ? undefined : Number(process.env.MEASURE_MONEY);
/**
 * **`MEASURE_FOOD=20`** legt jedem so viele Laibe in die Kammer (5.95, Punkt 85).
 *
 * Das Gegenstück zu `MEASURE_MONEY`, und nach demselben Befund gebaut: Ohne Kornspeicher
 * (probeweise gestrichen in 5.95) verhungert die Stadt, und zwar mit vollen Beuteln. Geld
 * war nicht die Sperre — die Frage ist, ob die Brotkette anspringt, wenn sie Zeit bekommt.
 */
const startvorrat: number | undefined =
	process.env.MEASURE_FOOD === undefined ? undefined : Number(process.env.MEASURE_FOOD);

describe('Messlauf', () => {
	it.runIf(ticks > 0)(
		`läuft ${ticks} Ticks und schreibt den Bericht`,
		async () => {
			const bericht = await measure({ ticks, every, saat, verfolge, startgeld, startvorrat });
			const text: string = bericht.lines.join('\n');

			writeFileSync('messung.txt', text, 'utf8');
			console.log(text);
		},
		// Großzügig: Ein Tick kostet rund siebenhundert Millisekunden (Punkt 67), und wer
		// einen langen Lauf anstößt, will nicht am Zeitlimit scheitern.
		2 * 60 * 60 * 1000
	);
});
