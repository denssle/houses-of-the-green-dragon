import type { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

/** Vertrag, den jede Datei in `migrations/` erfüllen muss. */
export interface MigrationModule {
	up(queryInterface: QueryInterface): Promise<void>;
	down(queryInterface: QueryInterface): Promise<void>;
}

// Migrationen als Modul-Array statt als Ordner im Dateisystem: `vite build` bündelt den
// Server nach build/ – ein migrations/-Ordner läge dort nicht und würde auch nicht
// mitgersynct. `import.meta.glob` sammelt die Dateien zur Bauzeit ein, sie landen mit im
// Bündel; kein Extra-Schritt beim Deploy, keine CLI auf dem Host.
const modules = import.meta.glob<MigrationModule>('./migrations/*.ts', { eager: true });

/**
 * Baut die umzug-Instanz für die gegebene Verbindung. Ausgeführte Migrationen werden
 * über SequelizeStorage in der Tabelle `SequelizeMeta` protokolliert; `up()` führt nur
 * Ausstehendes aus und ist damit bei jedem Start wiederholbar.
 *
 * Läuft beim Serverstart in `startDB()` – bei einem einzelnen Node-Prozess unkritisch;
 * mehrere Instanzen bräuchten eine Sperre.
 */
export function createMigrator(sequelize: Sequelize): Umzug<QueryInterface> {
	const migrations = Object.entries(modules)
		.map(([path, module]) => ({
			// './migrations/0001-initial-schema.ts' → '0001-initial-schema'
			name: path.split('/').pop()!.replace(/\.ts$/, ''),
			up: ({ context }: { context: QueryInterface }) => module.up(context),
			down: ({ context }: { context: QueryInterface }) => module.down(context)
		}))
		// Dateiname bestimmt die Reihenfolge (0001-, 0002-, …)
		.sort((a, b) => a.name.localeCompare(b.name));

	return new Umzug({
		migrations,
		context: sequelize.getQueryInterface(),
		storage: new SequelizeStorage({ sequelize }),
		logger: console
	});
}
