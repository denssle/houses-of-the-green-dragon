import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.6a: Hunger und Habe.
 *
 * Zwei Spalten am Charakter und eine neue Tabelle.
 *
 * `satiety` und `lastNeedTick` gehören zusammen wie `condition` und `lastConditionTick`
 * beim Gebäude: Der Stand wird beim Lesen aus den verstrichenen Ticks gerechnet, nicht
 * fortgeschrieben. Der Bestand startet **satt** — wer schon lebt, hat bis heute gegessen.
 *
 * `inventories` ist spärlich: Wer nie ein Brot hatte, hat keine Zeile.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.addColumn('characters', 'satiety', {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 100
	});
	await queryInterface.addColumn('characters', 'lastNeedTick', {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 0
	});

	// Der Bestand soll nicht rückwirkend seit Weltbeginn gehungert haben: Sein Stichtag
	// ist die aktuelle Weltzeit, nicht null.
	await queryInterface.sequelize.query(
		'UPDATE characters SET lastNeedTick = (SELECT currentTick FROM worlds LIMIT 1)'
	);

	await queryInterface.createTable('inventories', {
		CharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		itemId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('inventories');
	await queryInterface.removeColumn('characters', 'lastNeedTick');
	await queryInterface.removeColumn('characters', 'satiety');
}
