import { type QueryInterface, QueryTypes } from 'sequelize';

/**
 * Mahlen wird eine eigene Fertigkeit (5.96).
 *
 * Bis hierher trugen Mühle und Bäckerei beide `BAKING`. Damit galt das Backen beim Zuzug
 * als versorgt, sobald irgendwo eine Mühle in Bürgerhand stand (`skillToBring` bringt
 * bevorzugt, was fehlt) — und im Messlauf zu 5.95 stand eine Stadt ohne einen einzigen
 * Bäcker da, die trotzdem keinen anzog.
 *
 * **Wer heute mahlt, behält, was er kann.** Seine Übung steht als `BAKING` in der
 * Tabelle; ohne diese Migration finge der Müller der laufenden Welt bei null an, während
 * sein Können als Backen weiterläge, das er nie geübt hat. Übertragen wird deshalb an
 * jeden, der eine Mühle besitzt oder in einer angestellt ist, eine `MILLING`-Zeile mit
 * derselben Stufe. Die `BAKING`-Zeile bleibt: Was einer gelernt hat, verliert er nicht,
 * weil sich der Katalog ändert.
 *
 * Wer keine Mühle hat, bekommt nichts — ein Bäcker hat nie gemahlen.
 *
 * **Erst lesen, dann schreiben — nicht in einem Zug.** Die erste Fassung war ein einziges
 * `INSERT … SELECT … WHERE NOT EXISTS (SELECT … FROM skills …)`: Einfügen in eine Tabelle
 * und im selben Satz in einer Unterabfrage aus ihr lesen. SQLite lässt das zu, MySQL
 * ausdrücklich nicht, und ob MariaDB es tut, ließ sich hier nicht prüfen — live läuft
 * MariaDB. Getrennt in Lesen und Schreiben, ist es auf jeder Datenbank derselbe Vorgang.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const muellerInnen = await queryInterface.sequelize.query<{
		CharacterId: string;
		level: number;
		progress: number;
	}>(
		`SELECT s.CharacterId, s.level, s.progress
		FROM skills s
		WHERE s.type = 'BAKING'
			AND (
				s.CharacterId IN (
					SELECT OwnerCharacterId FROM buildings
					WHERE optionId = 4 AND ownerType = 'CHARACTER' AND OwnerCharacterId IS NOT NULL
				)
				OR s.CharacterId IN (
					SELECT e.EmployeeCharacterId FROM employments e
					JOIN buildings b ON b.id = e.BuildingId
					WHERE b.optionId = 4
				)
			)`,
		{ type: QueryTypes.SELECT }
	);
	if (muellerInnen.length === 0) return;

	const schon = new Set(
		(
			await queryInterface.sequelize.query<{ CharacterId: string }>(
				`SELECT CharacterId FROM skills WHERE type = 'MILLING'`,
				{ type: QueryTypes.SELECT }
			)
		).map((zeile) => zeile.CharacterId)
	);
	const jetzt = new Date();
	const neu = muellerInnen
		.filter((zeile) => !schon.has(zeile.CharacterId))
		.map((zeile) => ({
			CharacterId: zeile.CharacterId,
			type: 'MILLING',
			level: zeile.level,
			progress: zeile.progress,
			createdAt: jetzt,
			updatedAt: jetzt
		}));
	if (neu.length > 0) await queryInterface.bulkInsert('skills', neu);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.sequelize.query(`DELETE FROM skills WHERE type = 'MILLING'`);
}
