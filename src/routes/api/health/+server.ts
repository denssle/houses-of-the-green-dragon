import { sequelize } from '$lib/db/sequelize';
import { createMigrator } from '$lib/db/migrations';
import * as worldService from '$lib/server/service/worldService';

/** Antwortkörper von GET /api/health. */
interface HealthResponse {
	status: 'ok' | 'error';
	/** Version aus package.json — zeigt, ob ein Deploy tatsächlich angekommen ist. */
	version: string;
	dialect: string;
	/** Nur im MariaDB-Zweig gefüllt: Anzahl noch nicht ausgeführter Migrationen. */
	pendingMigrations?: number;
	/** Der Stand der Weltuhr. Bleibt er über Deploys hinweg stehen, läuft der Takt nicht. */
	currentTick?: number;
}

/**
 * GET /api/health
 *
 * Bereitschaftscheck, nicht bloß Erreichbarkeit: Er prüft, dass die Datenbank benutzbar
 * ist, dass keine Migration aussteht — und dass die Welt eine Uhr hat.
 *
 * Ein `curl` gegen `/` wäre wertlos: Diese Route landet ohne Sitzungscookie im Redirect
 * auf die Anmeldung und antwortet auch bei toter Datenbank. Der Deploy hielte einen
 * Ausfall dann für einen Erfolg.
 *
 * Bewusst ohne Anmeldung erreichbar — der Hook reicht sie vor der Sitzungsauflösung
 * durch, damit sie gerade dann noch antwortet, wenn die Datenbank klemmt. Fehlerdetails
 * gehen deshalb nur ins Serverlog: Datenbankfehler enthalten Benutzer- und Hostnamen.
 */
export async function GET(): Promise<Response> {
	const body: HealthResponse = {
		status: 'ok',
		version: process.env.npm_package_version ?? 'unknown',
		dialect: sequelize.getDialect()
	};

	try {
		// `authenticate()` setzt ein echtes `SELECT 1+1` ab, ist also ein vollwertiger
		// Roundtrip. Bewusst keine eigene Query: Auf MariaDB bricht Sequelize beim
		// Aufbereiten eines `SELECT 1` ab, weil der Treiber das Ergebnis-Array mit einer
		// nicht löschbaren `meta`-Eigenschaft liefert — unter SQLite fällt das nicht auf.
		await sequelize.authenticate();

		if (sequelize.getDialect() === 'mariadb') {
			// Im SQLite-Zweig baut `sync()` das Schema aus den Modellen auf; dort gibt es
			// kein SequelizeMeta und alle Migrationen gälten fälschlich als offen.
			const pending = await createMigrator(sequelize).pending();
			body.pendingMigrations = pending.length;

			if (pending.length > 0) {
				// Der Prozess läuft, aber das Schema passt nicht zum Code: `startDB()` führt
				// Migrationen beim Start aus, offene bedeuten also, dass etwas schiefging.
				console.error(
					'Bereitschaftscheck: ausstehende Migrationen:',
					pending.map((migration) => migration.name)
				);
				return json({ ...body, status: 'error' }, 503);
			}
		}

		// Ohne Weltuhr gibt es kein Spiel — jede Handlung rechnet gegen sie. Fehlt sie,
		// ist der Weltaufbau nicht gelaufen, und das soll der Deploy merken.
		body.currentTick = await worldService.currentTick();

		return json(body, 200);
	} catch (e) {
		console.error('Bereitschaftscheck fehlgeschlagen:', e);
		return json({ ...body, status: 'error' }, 503);
	}
}

/** Antwort ohne Caching — ein Bereitschaftscheck darf nie aus einem Proxy-Cache kommen. */
function json(body: HealthResponse, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
}
