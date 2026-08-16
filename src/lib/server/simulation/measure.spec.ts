import { describe, expect, it } from 'vitest';
import '$lib/db/db';
import { measure } from '$lib/server/simulation/measure';

/**
 * Das Messwerkzeug selbst (5.21).
 *
 * **Ein Werkzeug, dem man beim Messen nicht trauen kann, ist schlimmer als keines** — es
 * kostet dieselbe Zeit und führt in die Irre. Deshalb dieser kurze Lauf: Er prüft nicht,
 * ob die Welt sich gut entwickelt (dafür ist `worldComesAlive.spec.ts` da), sondern nur,
 * dass der Bericht die Abschnitte enthält, wegen derer es das Werkzeug gibt.
 *
 * Kurz gehalten, weil ein Tick rund siebenhundert Millisekunden kostet (Punkt 67).
 */

describe('Das Messwerkzeug', () => {
	it('berichtet Handlungen, Müßiggangsgründe und Fehlschläge', async () => {
		const bericht = await measure({ ticks: 5, every: 5 });
		const text: string = bericht.lines.join('\n');

		// Ohne Abschluss geprüft: Die Überschrift trägt Tickzahl und Dauer im Titel.
		expect(text).toContain('=== HANDLUNGEN (');
		// Der eigentliche Grund für das Werkzeug: `IDLE` ohne Aufschlüsselung sagt nichts.
		expect(text).toContain('=== WARUM MÜSSIGGANG ===');
		expect(text).toContain('=== WORAN ES SCHEITERTE ===');
		expect(text).toContain('Geld bei Leuten:');

		// Der Zwischenstand kommt nach `every` Ticks — hier also genau einmal.
		expect(bericht.lines.filter((zeile) => zeile.startsWith('--- Tick'))).toHaveLength(1);
	}, 60_000);

	it('nennt für jeden Müßiggang einen Grund', async () => {
		// Die Diagnose darf keine Lücke haben: Wo `IDLE` steht, muss auch ein Grund stehen,
		// sonst ist die Zahl wieder nur eine Zahl.
		const bericht = await measure({ ticks: 3, every: 100 });
		const text: string = bericht.lines.join('\n');

		const muessig: number = Number(/^ {2}IDLE: (\d+)$/m.exec(text)?.[1] ?? 0);
		if (muessig === 0) return;

		const abschnitt: string = text.split('=== WARUM MÜSSIGGANG ===')[1].split('===')[0];
		const summe: number = [...abschnitt.matchAll(/: (\d+)$/gm)].reduce(
			(zwischenstand, treffer) => zwischenstand + Number(treffer[1]),
			0
		);

		expect(summe).toBe(muessig);
	}, 60_000);
});
