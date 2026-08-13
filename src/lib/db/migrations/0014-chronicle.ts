import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.7d: die Chronik.
 *
 * Eine Tabelle für alles, was geschieht. Ohne Fremdschlüssel auf Charaktere und Gebäude:
 * Die Chronik soll den Tod und den Abriss überdauern — ein Eintrag, der mit seinem
 * Gegenstand verschwindet, wäre keine Chronik.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.createTable('events', {
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		RegionId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		kind: { type: DataTypes.STRING, allowNull: false },
		tick: { type: DataTypes.INTEGER, allowNull: false },
		subjectId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		objectId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		buildingId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		dynastyId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		value: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		detail: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});

	await queryInterface.addIndex('events', ['RegionId', 'tick']);
	await queryInterface.addIndex('events', ['subjectId']);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('events');
}
