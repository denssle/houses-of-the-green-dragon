import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Die Spalte, die den Rohbau vom fertigen Haus trennt (5.76, Punkt 102).
 *
 * Seit diesem Schritt entsteht ein Gebäude nicht mehr fertig, sondern als Rohbau, den
 * Arbeit vollendet. **Der Standardwert sagt schon die Wahrheit über alles, was steht:**
 * Was vor dieser Migration gebaut wurde, ist fertig — ein Nachtrag ist deshalb nicht
 * nötig, wie schon bei `repairWage`.
 *
 * **Die Richtung des Feldes ist mit Bedacht gewählt.** „Fertig" ist der Normalfall und
 * `false` der Standard; nur `build()` setzt es. Andersherum — ein `completedTick`, das
 * `null` heißt „im Bau" — hätte jede Stelle, die ein Gebäude anlegt, zum Mitdenken
 * gezwungen: Seed, Pachthof, öffentlicher Bau und achtzehn Testdateien. Wer eine davon
 * vergisst, legt einen unbenutzbaren Rohbau an, und niemand sieht es, bis jemand darin
 * wohnen will.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const spalten = await queryInterface.describeTable('buildings');
	if (spalten.underConstruction) return;

	await queryInterface.addColumn('buildings', 'underConstruction', {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('buildings', 'underConstruction');
}
