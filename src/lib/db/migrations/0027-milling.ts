import type { QueryInterface } from 'sequelize';

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
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.sequelize.query(`
		INSERT INTO skills (CharacterId, type, level, progress, createdAt, updatedAt)
		SELECT s.CharacterId, 'MILLING', s.level, s.progress, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
			)
			AND NOT EXISTS (
				SELECT 1 FROM skills m WHERE m.CharacterId = s.CharacterId AND m.type = 'MILLING'
			)
	`);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.sequelize.query(`DELETE FROM skills WHERE type = 'MILLING'`);
}
