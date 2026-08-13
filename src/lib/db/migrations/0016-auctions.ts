import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.9a: Versteigerungen für neu erschlossenes Bauland.
 *
 * Zwei Tabellen und **kein Feld für den Gewinner**: Wer den Zuschlag bekommt, ergibt sich
 * aus den Geboten — das höchste, dessen Bieter noch zahlen kann.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.createTable('auctions', {
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		PlotId: { type: DataTypes.STRING, allowNull: false },
		RegionId: { type: DataTypes.STRING, allowNull: false },
		openedTick: { type: DataTypes.INTEGER, allowNull: false },
		closesTick: { type: DataTypes.INTEGER, allowNull: false },
		closed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});

	await queryInterface.createTable('bids', {
		AuctionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		CharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		amount: { type: DataTypes.INTEGER, allowNull: false },
		tick: { type: DataTypes.INTEGER, allowNull: false },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('bids');
	await queryInterface.dropTable('auctions');
}
