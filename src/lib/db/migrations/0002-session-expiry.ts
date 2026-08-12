import { DataTypes, type QueryInterface } from 'sequelize';
import { SESSION_TOKEN_INDEX } from '$lib/db/attributes/sessionToken.attributes';

/**
 * Phase 2.2: Sitzungen bekommen eine Frist und einen Index.
 *
 * Zwei Änderungen an `sessionTokens`:
 *
 * - `expiresAt` — wann die Sitzung endet. Als Spalte, nicht aus `updatedAt` erschlossen
 *   (siehe `sessionToken.attributes.ts`).
 * - ein eindeutiger Index auf `token`: Jeder Request schlägt jetzt über diese Spalte
 *   nach, ohne Index wäre das ein Tabellenscan je Seitenaufruf.
 *
 * Die Tabelle wird dafür neu angelegt statt erweitert. Zwei Gründe: SQLite kann eine
 * `NOT NULL`-Spalte ohne Vorgabewert nicht anfügen, und ein Vorgabewert für einen
 * Ablaufzeitpunkt wäre eine Erfindung. Vor allem aber verliert dieser Schritt nichts:
 * Bis hierher stand die Identität im Cookie selbst, die Tabelle wurde nie beschrieben —
 * und jede vorhandene Sitzung wäre nach dem Umbau ohnehin ungültig. Wer angemeldet war,
 * meldet sich einmal neu an.
 */

const spalten = {
	UserId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
	token: { type: DataTypes.STRING, allowNull: false },
	createdAt: { type: DataTypes.DATE, allowNull: false },
	updatedAt: { type: DataTypes.DATE, allowNull: false }
};

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('sessionTokens');
	await queryInterface.createTable('sessionTokens', {
		...spalten,
		expiresAt: { type: DataTypes.DATE, allowNull: false }
	});
	await queryInterface.addIndex('sessionTokens', ['token'], {
		name: SESSION_TOKEN_INDEX,
		unique: true
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.dropTable('sessionTokens');
	await queryInterface.createTable('sessionTokens', spalten);
}
