import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.2: Der Erblasser benennt seinen Erben.
 *
 * Eine nullbare Spalte, deshalb anfügbar statt Neuanlage — anders als bei `expiresAt`
 * in 0002 gibt es hier keinen Wert, der erfunden werden müsste: Leer heißt „noch nicht
 * benannt", und das ist für jeden bestehenden Charakter die Wahrheit.
 *
 * Bewusst **kein** Fremdschlüssel auf `characters`. Der Verweis zeigt auf einen anderen
 * Charakter, und ein `ON DELETE`-Verhalten gäbe es hier nicht sinnvoll: Gelöscht wird
 * ohnehin niemand, Tote bleiben mit `deathTick` stehen. Ob der Benannte noch lebt,
 * entscheidet die Erbfolge beim Todesfall — nicht die Datenbank beim Schreiben.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.addColumn('characters', 'heirId', {
		type: DataTypes.STRING,
		allowNull: true,
		defaultValue: null
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('characters', 'heirId');
}
