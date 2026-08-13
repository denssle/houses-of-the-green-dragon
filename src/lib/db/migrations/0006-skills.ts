import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.5a: Können als eigene Tabelle.
 *
 * Anders als die Persönlichkeit (0005) gehört das Können **nicht** an den Charakter:
 * Dort ist es genau ein Satz Werte je Person, hier eine wachsende Liste — der Katalog
 * bekommt mit 4.6 den Handel, mit 4.7 die Redekunst und mit Punkt 6 das Kämpfen. Als
 * Spalten hieße jede neue Fertigkeit eine Migration am Charakter und eine Tabelle, die
 * überwiegend Nullen enthält.
 *
 * **Spärlich**: Wer eine Fertigkeit nie ausgeübt hat, hat keine Zeile. Das gilt als
 * Stufe null.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.createTable('skills', {
		CharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		type: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
		progress: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		createdAt: { type: DataTypes.DATE, allowNull: false },
		updatedAt: { type: DataTypes.DATE, allowNull: false }
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('skills');
}
