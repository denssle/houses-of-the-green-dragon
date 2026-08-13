import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.4: Schwangerschaft und Heiratsantrag.
 *
 * Drei nullbare Spalten am Charakter, allesamt anfügbar:
 *
 * - `pregnantSinceTick` / `pregnantByFatherId` — seit wann und von wem. Zwei Spalten
 *   statt einer eigenen Tabelle, weil es je Frau höchstens eine Schwangerschaft zugleich
 *   gibt und die Geburt beide wieder leert. Eine Tabelle wäre erst dann richtig, wenn
 *   die Geschichte der Schwangerschaften erhalten bleiben soll — die steht aber ohnehin
 *   im Stammbaum der Kinder.
 * - `proposedToId` — ein offener Heiratsantrag. NPCs brauchen ihn nicht, sie entscheiden
 *   im selben Zug; zwei Spieler sind aber selten zugleich online.
 *
 * Wieder ohne Fremdschlüssel, aus demselben Grund wie bei `heirId` in 0003: Die Verweise
 * zeigen auf andere Charaktere, gelöscht wird niemand, und ob der Verwiesene noch lebt,
 * entscheidet die Regel beim Zugriff — nicht die Datenbank beim Schreiben.
 */

const SPALTEN = {
	pregnantSinceTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
	pregnantByFatherId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
	proposedToId: { type: DataTypes.STRING, allowNull: true, defaultValue: null }
} as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
	for (const [name, definition] of Object.entries(SPALTEN)) {
		await queryInterface.addColumn('characters', name, definition);
	}
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	for (const name of Object.keys(SPALTEN)) {
		await queryInterface.removeColumn('characters', name);
	}
}
