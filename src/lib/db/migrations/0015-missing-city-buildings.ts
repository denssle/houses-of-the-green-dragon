import { randomUUID } from 'node:crypto';
import { type QueryInterface, QueryTypes } from 'sequelize';

/**
 * Städtische Gebäude nachtragen, die es beim Anlegen der Welt noch nicht gab.
 *
 * **Der Seed läuft nur einmal.** `seedWorld()` legt an, was eine *leere* Welt braucht —
 * eine Welt, die schon steht, sieht er nie wieder. Alles, was später dazukam, fehlt in
 * ihr für immer: Die Produktionswelt stammt aus Phase 2.4 und hatte deshalb weder
 * **Unterkunft** (seit 4.4) noch **Marktplatz** (seit 4.6d).
 *
 * Das ist kein Schönheitsfehler. Ohne Unterkunft hat niemand ein Dach, ohne Dach kommen
 * keine Kinder (4.4) — die Stadt stirbt still aus, und genau das war zu sehen: neun
 * Einwohner, keine Geburt in fünf Spieljahren. Ohne Marktplatz gibt es keinen Ort, an dem
 * jemand ohne eigenen Laden etwas verkaufen könnte.
 *
 * Die Migration ist **idempotent**: Wo das Gebäude schon steht, tut sie nichts. In einer
 * frischen Welt läuft sie vor dem Seed und findet keine Stadt — auch dann nichts. Sie ist
 * der Nachtrag für Bestandswelten und für nichts sonst.
 */

/** Was jede Stadt haben muss, seit es die Bauten gibt. */
const PFLICHTBAUTEN = [
	{ optionId: 3, name: 'Städtische Unterkunft' },
	{ optionId: 6, name: 'Marktplatz' }
] as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
	const staedte = await queryInterface.sequelize.query<{ id: string }>(
		"SELECT id FROM regions WHERE type = 'CITY'",
		{ type: QueryTypes.SELECT }
	);
	if (staedte.length === 0) return;

	const welt = await queryInterface.sequelize.query<{ currentTick: number }>(
		'SELECT currentTick FROM worlds LIMIT 1',
		{ type: QueryTypes.SELECT }
	);
	const jetzt: number = welt[0]?.currentTick ?? 0;

	for (const stadt of staedte) {
		for (const bau of PFLICHTBAUTEN) {
			const vorhanden = await queryInterface.sequelize.query<{ anzahl: number }>(
				`SELECT COUNT(*) AS anzahl FROM buildings b
				 JOIN plots p ON p.id = b.PlotId
				 WHERE p.RegionId = :region AND b.optionId = :option`,
				{ replacements: { region: stadt.id, option: bau.optionId }, type: QueryTypes.SELECT }
			);
			if (Number(vorhanden[0]?.anzahl ?? 0) > 0) continue;

			// Eigener oder herrenloser Grund, unbebaut — dieselbe Regel wie beim Bauen
			// durch den Bürgermeister (4.7c).
			const frei = await queryInterface.sequelize.query<{ id: string }>(
				`SELECT p.id FROM plots p
				 LEFT JOIN buildings b ON b.PlotId = p.id
				 WHERE p.RegionId = :region AND p.ownerType IN ('CITY', 'NONE') AND b.id IS NULL
				 LIMIT 1`,
				{ replacements: { region: stadt.id }, type: QueryTypes.SELECT }
			);
			const plotId: string | undefined = frei[0]?.id;
			// Kein Platz mehr: Dann muss die Stadt es selbst bauen. Eine Migration, die
			// dafür ein Grundstück erfände, schöbe der Stadt Bauland unter, das niemand
			// erschlossen hat.
			if (!plotId) continue;

			// Über `bulkInsert`/`bulkUpdate` statt über rohes SQL: Die Spalte `condition`
			// ist in MariaDB ein reserviertes Wort, und Sequelize setzt die Anführungszeichen
			// je Dialekt selbst. Von Hand geschrieben liefe es auf SQLite und fiele auf dem
			// Server um.
			await queryInterface.bulkUpdate('plots', { ownerType: 'CITY' }, { id: plotId });
			await queryInterface.bulkInsert('buildings', [
				{
					id: randomUUID(),
					name: bau.name,
					optionId: bau.optionId,
					level: 1,
					condition: 100,
					lastConditionTick: jetzt,
					PlotId: plotId,
					ownerType: 'CITY',
					createdAt: new Date(),
					updatedAt: new Date()
				}
			]);
		}
	}
}

export async function down(): Promise<void> {
	// Nichts zurückzunehmen: Was einer Stadt fehlte, soll ihr nicht wieder fehlen.
}
