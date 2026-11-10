import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Was beim letzten Grundsteuertermin geschuldet und was davon nicht einzutreiben war
 * (0.10.0, Punkt 122).
 *
 * Der Bürgermeister braucht beides, um ein knappes Jahr von einem fetten zu unterscheiden.
 * `null` heißt: noch kein Termin seit dieser Migration — das Amt entscheidet dann wie
 * bisher nach der Kasse, bis der nächste Termin die erste Zahl liefert.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const spalten = await queryInterface.describeTable('regions');
	if (!spalten.lastTaxDue) {
		await queryInterface.addColumn('regions', 'lastTaxDue', {
			type: DataTypes.INTEGER,
			allowNull: true,
			defaultValue: null
		});
	}
	if (!spalten.lastTaxShortfall) {
		await queryInterface.addColumn('regions', 'lastTaxShortfall', {
			type: DataTypes.INTEGER,
			allowNull: true,
			defaultValue: null
		});
	}
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('regions', 'lastTaxShortfall');
	await queryInterface.removeColumn('regions', 'lastTaxDue');
}
