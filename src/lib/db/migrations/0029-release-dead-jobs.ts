import type { QueryInterface } from 'sequelize';

/**
 * Tote geben ihre Stelle zurück (0.7.0).
 *
 * `die()` beendete bis hierher keine Anstellung. Weil eine belegte Stelle für die Zählung
 * belegt bleibt, wer auch immer darauf steht, waren in Grünau am 07.11.2026 sieben von elf
 * Verträgen die von Toten — darunter die einzige Stelle der Mühle. Seit 0.7.0 endet der
 * Vertrag mit dem Tod; diese Migration räumt auf, was bis dahin liegen geblieben ist.
 *
 * Eine Chronikzeile gibt es dafür nicht. Das Ende des Vertrags fiel auf den Tod, und der
 * steht schon dort.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.sequelize.query(
		`DELETE FROM employments WHERE EmployeeCharacterId IN (
			SELECT id FROM characters WHERE deathTick IS NOT NULL
		)`
	);
}

export async function down(): Promise<void> {
	// Tote stellt niemand wieder ein.
}
