import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.6e: Anstellungsverhältnisse und der Aushang am Betrieb.
 *
 * `offeredWage` am Gebäude ist der Aushang — was der Betrieb **künftigen** Angestellten
 * bietet. Was ein bestehendes Verhältnis zahlt, steht in `employments`: Senkt der
 * Eigentümer morgen den Aushang, gilt das für den Nächsten, nicht rückwirkend für den,
 * der schon da ist.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.addColumn('buildings', 'offeredWage', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});

	await queryInterface.createTable('employments', {
		EmployeeCharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		BuildingId: { type: DataTypes.STRING, allowNull: false },
		wagePerActionPoint: { type: DataTypes.INTEGER, allowNull: false },
		sinceTick: { type: DataTypes.INTEGER, allowNull: false },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('employments');
	await queryInterface.removeColumn('buildings', 'offeredWage');
}
