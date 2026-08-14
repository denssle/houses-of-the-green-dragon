import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 5.5: Wann ein Mensch zuletzt hereingeschaut hat.
 *
 * Die Selbstverwaltung eines abwesenden Spielers braucht ein Maß für Abwesenheit, und
 * keines der vorhandenen Felder taugt dafür. `lastTickProcessed` wird bei **jedem** Zugriff
 * fortgeschrieben, auch von der Selbstverwaltung selbst — wer danach ginge, sähe einen
 * Charakter, der sich durch sein eigenes Handeln für anwesend erklärt.
 *
 * `lastSeenTick` setzt allein der Mensch, indem er eine Seite aufruft. Es ist der einzige
 * Wert in dieser Welt, der nicht von ihr selbst geschrieben wird.
 *
 * Bestandscharaktere bekommen `null` — das gilt als „nie gesehen" und ist für einen NPC
 * ohnehin richtig. Ein gespielter Charakter erhält seinen Stempel beim nächsten Aufruf;
 * bis dahin greift die Selbstverwaltung, und das ist nach einem Serverstart genau richtig.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.addColumn('characters', 'lastSeenTick', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('characters', 'lastSeenTick');
}
