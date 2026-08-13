import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.7b: Gesetze und die Grundsteuer.
 *
 * `laws` führt **Erlasse**, keine geltenden Sätze: eine Zeile je Änderung, es gilt die
 * jüngste je Art. Dazu `lastTaxTick` an der Stadt — der einzige Zustand, den die
 * Grundsteuer braucht, weil sie als einzige Abgabe an der Zeit hängt und nicht an einer
 * Handlung.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.createTable('laws', {
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		RegionId: { type: DataTypes.STRING, allowNull: false },
		kind: { type: DataTypes.STRING, allowNull: false },
		value: { type: DataTypes.INTEGER, allowNull: false },
		enactedTick: { type: DataTypes.INTEGER, allowNull: false },
		EnactedByCharacterId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});

	await queryInterface.addColumn('regions', 'lastTaxTick', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('regions', 'lastTaxTick');
	await queryInterface.dropTable('laws');
}
