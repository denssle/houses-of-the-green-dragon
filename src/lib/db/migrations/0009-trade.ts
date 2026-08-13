import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.6d: Betriebslager und Preisschilder.
 *
 * Zwei Tabellen. `buildingStocks` ist der Vorrat eines Betriebs — der Ort, in den ab der
 * Anstellung fremde Hände produzieren. `shopOffers` hält die ausgehängten Angebote; die
 * Ware liegt dabei **im Angebot** und nicht daneben, damit dieselben zehn Laibe nicht an
 * drei Ständen zugleich hängen.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.createTable('buildingStocks', {
		BuildingId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		itemId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});

	await queryInterface.createTable('shopOffers', {
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		BuildingId: { type: DataTypes.STRING, allowNull: false },
		SellerCharacterId: { type: DataTypes.STRING, allowNull: false },
		itemId: { type: DataTypes.STRING, allowNull: false },
		quantity: { type: DataTypes.INTEGER, allowNull: false },
		pricePerUnit: { type: DataTypes.INTEGER, allowNull: false },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('shopOffers');
	await queryInterface.dropTable('buildingStocks');
}
