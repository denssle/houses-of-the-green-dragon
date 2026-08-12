import { type Options, Sequelize } from 'sequelize';
import { env } from '$env/dynamic/private';

/**
 * Wo die Daten liegen, hängt davon ab, wofür der Prozess läuft.
 *
 * - `TEST`: SQLite im Arbeitsspeicher. Jeder Testlauf beginnt bei null, nichts bleibt
 *   liegen, nichts muss aufgeräumt werden.
 * - `LOCAL`: SQLite als Datei. Bewusst nicht im Arbeitsspeicher wie bei Festival — dies
 *   hier ist ein Spiel mit gewachsener Welt: Wer lokal eine Stadt aufbaut, Charaktere
 *   altern lässt und dann den Server neu startet, will sie wiederfinden.
 * - `PRODUCTION`: MariaDB auf dem Uberspace.
 */
export type DatabaseMode = 'TEST' | 'LOCAL' | 'PRODUCTION';

/** Die lokale Datenbankdatei. Der Ordner darüber wird in `startDB()` angelegt. */
export const LOCAL_STORAGE_PATH = '.data/dev.sqlite';

export function detectMode(): DatabaseMode {
	if (
		process.env.VITEST === 'true' ||
		process.env.NODE_ENV === 'test' ||
		process.env.PLAYWRIGHT === 'true'
	) {
		return 'TEST';
	}
	// Bewusst ein ausdrückliches Bekenntnis in der .env und nicht „keine Zugangsdaten
	// gefunden, dann eben SQLite“: Sonst liefe eine Produktion mit fehlenden Variablen
	// scheinbar erfolgreich an und schriebe die Welt in eine Datei, die beim nächsten
	// Deploy verschwindet. Fehlende Zugangsdaten müssen laut sein, nicht bequem.
	if (env.MARIA_DB_NAME === 'dev') {
		return 'LOCAL';
	}
	return 'PRODUCTION';
}

/**
 * Prüft die Zugangsdaten, bevor eine Verbindung aufgebaut wird.
 *
 * Ohne sie verbindet sich der mariadb-Treiber als Benutzer '' ohne Passwort und bricht
 * mit einem nichtssagenden "Access denied for ''@..." (Fehler 1045) ab. Häufigste
 * Ursache: `node build` lädt – anders als `vite dev` – keine .env; das Startskript muss
 * sie per --env-file mitgeben.
 *
 * Bewusst eine Funktion und KEIN Check auf Modulebene: `vite build` importiert die
 * Servermodule in seiner Analysephase, ein Fehler beim Import würde also schon den Build
 * abbrechen – auch in der CI, die diese Variablen gar nicht kennt. Aufgerufen wird sie
 * in `startDB()`, wo die Verbindung tatsächlich zustande kommt.
 */
export function assertDatabaseCredentials(mode: DatabaseMode = detectMode()): void {
	if (mode === 'PRODUCTION' && !(env.MARIA_DB_USER && env.MARIA_DB_PASSWORD)) {
		throw new Error(
			'DB-Zugangsdaten fehlen: MARIA_DB_USER und/oder MARIA_DB_PASSWORD sind nicht gesetzt. ' +
				'Liegt eine .env im Arbeitsverzeichnis und wird sie geladen? Für lokale Entwicklung ' +
				'ohne MariaDB stattdessen MARIA_DB_NAME=dev setzen.'
		);
	}
}

export function buildOptions(mode: DatabaseMode = detectMode()): Options {
	switch (mode) {
		case 'TEST':
			return { dialect: 'sqlite', storage: ':memory:', logging: false };
		case 'LOCAL':
			return { dialect: 'sqlite', storage: LOCAL_STORAGE_PATH, logging: false };
		case 'PRODUCTION':
			return {
				dialect: 'mariadb',
				host: 'localhost',
				username: env.MARIA_DB_USER,
				password: env.MARIA_DB_PASSWORD,
				// Uberspace vergibt Datenbanken als <benutzer>_<name>.
				database: env.MARIA_DB_USER + '_' + env.MARIA_DB_NAME
			};
	}
}

export const mode: DatabaseMode = detectMode();
export const sequelize: Sequelize = new Sequelize(buildOptions(mode));
