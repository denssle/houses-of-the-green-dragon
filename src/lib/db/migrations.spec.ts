import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Sequelize } from 'sequelize';
import { createMigrator } from '$lib/db/migrations';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';

/**
 * Der Abgleich zwischen Migration und Modellen.
 *
 * In Produktion baut ausschließlich die Migration das Schema, im Testlauf ausschließlich
 * `sync()` aus den Modellen. Driften beide auseinander, bleibt der Unterschied
 * unsichtbar, bis er in Produktion zuschlägt — an einer fehlenden Spalte oder einem
 * anderen Vorgabewert. Genau diese Lücke schließt dieser Test.
 */

/** Nur das, was das Schema ausmacht — Reihenfolge und Metadaten des Treibers nicht. */
function spalten(beschreibung: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(beschreibung).map(([name, feld]) => {
			const { type, allowNull, defaultValue, primaryKey } = feld as Record<string, unknown>;
			return [name, { type, allowNull, defaultValue, primaryKey }];
		})
	);
}

/**
 * Name, Eindeutigkeit und Spalten eines Index — mehr macht ihn nicht aus. Seit Phase 2.2
 * hängt an einem Index echtes Verhalten: Der Sitzungs-Token wird bei jedem Request über
 * ihn nachgeschlagen.
 */
function indizes(beschreibung: unknown) {
	return (beschreibung as unknown[])
		.map((index) => {
			const { name, unique, fields } = index as {
				name: string;
				unique: boolean;
				fields?: { attribute: string }[];
			};
			return { name, unique, felder: (fields ?? []).map((feld) => feld.attribute) };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

describe('Migration und Modelle ergeben dasselbe Schema', () => {
	let migriert: Sequelize;
	let tabellen: string[];

	beforeAll(async () => {
		// Aus den Modellen — die geteilte Testverbindung liegt ohnehin im Arbeitsspeicher.
		await sequelize.sync();

		// Aus der Migration — eine zweite, unabhängige Datenbank.
		migriert = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
		await createMigrator(migriert).up();

		tabellen = (await migriert.getQueryInterface().showAllTables())
			.map(String)
			// umzugs eigenes Protokoll gehört nicht zum Schema.
			.filter((name) => name !== 'SequelizeMeta')
			.sort();
	});

	afterAll(async () => {
		await migriert.close();
	});

	it('legt dieselben Tabellen an', async () => {
		const ausModellen = (await sequelize.getQueryInterface().showAllTables()).map(String).sort();

		expect(tabellen).toEqual(ausModellen);
	});

	it('legt in jeder Tabelle dieselben Spalten an', async () => {
		for (const tabelle of tabellen) {
			const ausMigration = spalten(await migriert.getQueryInterface().describeTable(tabelle));
			const ausModellen = spalten(await sequelize.getQueryInterface().describeTable(tabelle));

			// Der Tabellenname im Vergleich, damit ein Fehlschlag verrät, wo es klemmt.
			expect({ tabelle, ...ausMigration }).toEqual({ tabelle, ...ausModellen });
		}
	});

	it('legt dieselben Indizes an', async () => {
		for (const tabelle of tabellen) {
			const ausMigration = indizes(await migriert.getQueryInterface().showIndex(tabelle));
			const ausModellen = indizes(await sequelize.getQueryInterface().showIndex(tabelle));

			expect({ tabelle, indizes: ausMigration }).toEqual({ tabelle, indizes: ausModellen });
		}
	});

	it('lässt sich vollständig zurückrollen', async () => {
		const zumZurueckrollen = new Sequelize({
			dialect: 'sqlite',
			storage: ':memory:',
			logging: false
		});
		const migrator = createMigrator(zumZurueckrollen);

		await migrator.up();
		await migrator.down({ to: 0 as never });

		const übrig = (await zumZurueckrollen.getQueryInterface().showAllTables())
			.map(String)
			.filter((name) => name !== 'SequelizeMeta');
		expect(übrig).toEqual([]);
		await zumZurueckrollen.close();
	});
});
