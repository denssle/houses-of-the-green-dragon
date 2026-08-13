import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.6c: Pachtverhältnisse über Abbauflächen.
 *
 * Ohne Fremdschlüssel, wie die übrigen Verweise auf Charaktere: Gelöscht wird niemand,
 * und ob der Pächter noch lebt, entscheidet die Regel beim Zugriff — beim Tod fällt die
 * Pacht an die Stadt zurück (Punkt 8), und das ist eine Spielregel, keine
 * Datenbankbedingung.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.createTable('leases', {
		PlotId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		CharacterId: { type: DataTypes.STRING, allowNull: false },
		sinceTick: { type: DataTypes.INTEGER, allowNull: false },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('leases');
}
