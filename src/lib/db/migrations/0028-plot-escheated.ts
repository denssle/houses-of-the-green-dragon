import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Wann ein Grundstück der Stadt zufiel (5.101, Punkt 113).
 *
 * Am Gebäude steht das seit 5.42 (`escheatedTick`), am Grundstück nicht. Solange ein
 * Nachlass bebaut war, genügte das: Versteigert wurde das Haus, und der Boden ging mit.
 * Ein **leerer** Bauplatz aus einem Nachlass sah aber aus wie ursprünglicher Stadtgrund —
 * und der bleibt bewusst bei der Stadt, für Schule und Unterkunft. Im Messlauf zu 5.99
 * waren das 27 Bauplätze eines einzigen Verstorbenen, die nie wieder vergeben wurden.
 *
 * **`null` für alles, was vor dieser Migration der Stadt gehört**, und das ist ehrlich:
 * Woher es kam, weiß niemand mehr. Es bleibt Stadtgrund, wie es bisher Stadtgrund war.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const spalten = await queryInterface.describeTable('plots');
	if (spalten.escheatedTick) return;

	await queryInterface.addColumn('plots', 'escheatedTick', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('plots', 'escheatedTick');
}
