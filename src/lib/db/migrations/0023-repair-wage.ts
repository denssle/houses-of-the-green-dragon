import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Die Spalte für den Reparaturauftrag (5.27, Punkt 74).
 *
 * `null` heißt **kein Auftrag** — und das ist für jedes bestehende Haus richtig, denn bis
 * zu diesem Schritt konnte niemand einen erteilen. Die Migration braucht deshalb keinen
 * Nachtrag: Der Standardwert sagt schon die Wahrheit über alles, was steht.
 *
 * Getrennt von `offeredWage`: Das ist der Lohn einer Anstellung, dies der Preis für eine
 * Arbeit. Wer beides in ein Feld legte, könnte nicht gleichzeitig einen Gesellen suchen
 * und sein Dach richten lassen.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const spalten = await queryInterface.describeTable('buildings');
	if (spalten.repairWage) return;

	await queryInterface.addColumn('buildings', 'repairWage', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('buildings', 'repairWage');
}
