import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.7a: Wahlen, Kandidaturen und Stimmen.
 *
 * Drei Tabellen und **keine vierte für Ämter**: Wer ein Amt innehat, ergibt sich aus der
 * letzten abgeschlossenen Wahl — der bestplatzierte Kandidat, der noch lebt. Eine
 * Ämtertabelle daneben könnte vom Wahlergebnis abweichen; eine Rechnung kann das nicht.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.createTable('elections', {
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		RegionId: { type: DataTypes.STRING, allowNull: false },
		office: { type: DataTypes.STRING, allowNull: false },
		openedTick: { type: DataTypes.INTEGER, allowNull: false },
		closesTick: { type: DataTypes.INTEGER, allowNull: false },
		termEndsTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		closed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});

	await queryInterface.createTable('candidacies', {
		ElectionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		CharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		standingSinceTick: { type: DataTypes.INTEGER, allowNull: false },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});

	await queryInterface.createTable('votes', {
		ElectionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		VoterCharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		CandidateCharacterId: { type: DataTypes.STRING, allowNull: false },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('votes');
	await queryInterface.dropTable('candidacies');
	await queryInterface.dropTable('elections');
}
