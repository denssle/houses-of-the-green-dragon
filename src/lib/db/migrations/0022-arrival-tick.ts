import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Die Spalte für den Tag der Ankunft (5.24, Punkt 71).
 *
 * `null` heißt **hier geboren** — und das ist für jeden bestehenden Charakter richtig, denn
 * bis zu diesem Schritt konnte niemand zuziehen. Genau deshalb braucht die Migration keinen
 * Nachtrag: Der Standardwert sagt schon die Wahrheit über alle, die es gibt.
 *
 * Woran die Spalte hängt: Wer zuzieht, darf erst nach einer Wahlperiode mitwählen
 * (`CITIZENSHIP_AFTER_YEARS`). Ohne diese Frist gewänne eine Wahl, wer Leute ansiedelt —
 * das Bürgerrecht in seiner kleinsten Form.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const spalten = await queryInterface.describeTable('characters');
	if (spalten.arrivedTick) return;

	await queryInterface.addColumn('characters', 'arrivedTick', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('characters', 'arrivedTick');
}
