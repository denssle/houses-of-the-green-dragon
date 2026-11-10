import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Sequelize } from 'sequelize';
import { createMigrator } from '$lib/db/migrations';

/**
 * Eine Sicherung der laufenden Welt in den Messlauf laden (0.9.4, Punkt 122).
 *
 * **Warum es das braucht.** Ein Messlauf mit Saat baut eine frische Stadt, keine Kopie von
 * Grünau. Die Hungersnot vom Oktober 2026 kam in keinem gesäten Lauf vor — einen Gegenlauf
 * „ohne die Steuerspitze" gegen einen Lauf zu stellen, in dem gar nicht gehungert wird,
 * misst nichts. Aus einer Sicherung von vor der Hungersnot lässt sich dagegen **dieselbe
 * Stadt** weiterlaufen lassen, einmal so und einmal anders.
 *
 * **Der Weg:** Die Testdatenbank ist SQLite im Arbeitsspeicher, die Sicherung ein
 * MariaDB-Dump. Statt SQL zu übersetzen, baut dieser Lader das Schema mit **denselben
 * Migrationen**, die der Dump schon hinter sich hatte (`SequelizeMeta`), schreibt die
 * Zeilen hinein und lässt dann die übrigen Migrationen laufen — genau wie es ein Deploy
 * mit dieser Sicherung täte. Damit greifen auch Datenmigrationen wie 0029 (Tote geben ihre
 * Stelle zurück) und 0030 (Vormundschaft).
 *
 * **Was er versteht:** das Format von `mysqldump` mit `--extended-insert`, eine Zeile je
 * Datensatz, wie es `scripts/backup.sh` und der Dump vor jedem Deploy schreiben. Gezippt
 * oder nicht.
 */

export interface DumpTabelle {
	spalten: string[];
	zeilen: unknown[][];
}

/** Liest Tabellen, Spaltennamen und Zeilen aus dem Text eines Dumps. */
export function parseDump(text: string): Map<string, DumpTabelle> {
	const tabellen = new Map<string, DumpTabelle>();
	let schemaVon: string | null = null;
	let datenFuer: DumpTabelle | null = null;

	for (const zeile of text.split('\n')) {
		const anlage = /^CREATE TABLE `([^`]+)`/.exec(zeile);
		if (anlage) {
			schemaVon = anlage[1];
			tabellen.set(schemaVon, { spalten: [], zeilen: [] });
			continue;
		}
		if (schemaVon !== null) {
			const spalte = /^ {2}`([^`]+)`/.exec(zeile);
			if (spalte) tabellen.get(schemaVon)!.spalten.push(spalte[1]);
			else if (zeile.startsWith(')')) schemaVon = null;
			continue;
		}

		const einfuegen = /^INSERT INTO `([^`]+)` VALUES/.exec(zeile);
		if (einfuegen) {
			datenFuer = tabellen.get(einfuegen[1]) ?? null;
			if (!datenFuer) throw new Error(`Daten für ${einfuegen[1]}, aber kein CREATE TABLE davor`);
			// Steht die erste Zeile gleich dahinter (ohne Zeilenumbruch), gehört sie dazu.
			const rest: string = zeile.slice(einfuegen[0].length).trim();
			if (rest.startsWith('(')) datenFuer.zeilen.push(...werteZeilen(rest));
			if (rest.endsWith(';')) datenFuer = null;
			continue;
		}
		if (datenFuer !== null) {
			datenFuer.zeilen.push(...werteZeilen(zeile));
			if (zeile.trimEnd().endsWith(';')) datenFuer = null;
		}
	}
	return tabellen;
}

/**
 * Eine Zeile `(…),(…);` in ihre Werte zerlegen.
 *
 * Die Escapes sind die von MySQL: `\'`, `\\`, `\n`, `\r`, `\t`, `\0`, `\Z`; dazu `''` für
 * ein Hochkomma. `NULL` wird `null`, Zahlen bleiben Zahlen.
 */
export function werteZeilen(text: string): unknown[][] {
	const ergebnis: unknown[][] = [];
	let i = 0;
	const n: number = text.length;

	while (i < n) {
		while (i < n && text[i] !== '(') i++;
		if (i >= n) break;
		i++;
		const werte: unknown[] = [];
		for (;;) {
			while (text[i] === ' ') i++;
			if (text[i] === "'") {
				i++;
				let wert = '';
				for (;;) {
					const zeichen: string = text[i];
					if (zeichen === undefined) throw new Error('Zeichenkette ohne Ende im Dump');
					if (zeichen === '\\') {
						const folge: string = text[i + 1];
						wert +=
							({ n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' } as Record<string, string>)[
								folge
							] ?? folge;
						i += 2;
					} else if (zeichen === "'" && text[i + 1] === "'") {
						wert += "'";
						i += 2;
					} else if (zeichen === "'") {
						i++;
						break;
					} else {
						wert += zeichen;
						i++;
					}
				}
				werte.push(wert);
			} else {
				let roh = '';
				while (i < n && text[i] !== ',' && text[i] !== ')') roh += text[i++];
				roh = roh.trim();
				werte.push(roh === 'NULL' ? null : Number(roh));
			}
			while (text[i] === ' ') i++;
			if (text[i] === ',') {
				i++;
				continue;
			}
			if (text[i] === ')') {
				i++;
				break;
			}
			throw new Error(`Unerwartetes Zeichen im Dump: ${text.slice(i, i + 20)}`);
		}
		ergebnis.push(werte);
	}
	return ergebnis;
}

/**
 * Den Dump in die (leere) Verbindung laden und auf den heutigen Stand migrieren.
 *
 * Gibt zurück, auf welchem Stand der Dump war und welche Migrationen danach liefen — für
 * den Kopf des Berichts, damit niemand vergisst, dass ein Teil der Welt nachgezogen wurde.
 */
export async function ladeDump(
	sequelize: Sequelize,
	pfad: string
): Promise<{ stand: string; nachgezogen: string[] }> {
	const roh: Buffer = readFileSync(pfad);
	const text: string = (pfad.endsWith('.gz') ? gunzipSync(roh) : roh).toString('utf8');
	const tabellen = parseDump(text);

	const meta = tabellen.get('SequelizeMeta');
	if (!meta || meta.zeilen.length === 0) throw new Error('Der Dump hat keine SequelizeMeta');
	const gelaufen: string[] = meta.zeilen.map((zeile) => String(zeile[0])).sort();
	const stand: string = gelaufen[gelaufen.length - 1];

	const migrator = createMigrator(sequelize);
	await migrator.up({ to: stand });

	const qi = sequelize.getQueryInterface();
	await sequelize.query('PRAGMA foreign_keys = OFF');
	for (const [name, tabelle] of tabellen) {
		if (name === 'SequelizeMeta' || tabelle.zeilen.length === 0) continue;
		const objekte = tabelle.zeilen.map((werte) =>
			Object.fromEntries(tabelle.spalten.map((spalte, k) => [spalte, werte[k]]))
		);
		// In Häppchen: SQLite kennt eine Obergrenze für Platzhalter je Anweisung.
		for (let ab = 0; ab < objekte.length; ab += 200) {
			await qi.bulkInsert(name, objekte.slice(ab, ab + 200));
		}
	}

	const nachgezogen = await migrator.up();
	return { stand, nachgezogen: nachgezogen.map((m) => m.name) };
}
