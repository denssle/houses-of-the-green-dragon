import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Die Spalte, die das erschlossene Grundstück von der Baustelle trennt (5.92, Punkt 102).
 *
 * Seit diesem Schritt kostet die Erschließung keine Münzen mehr, sondern Arbeit: Der
 * Bürgermeister lässt ausweisen, und Vermesser und Wegebauer machen daraus in Schichten
 * ein Grundstück, auf dem sich bauen lässt. Bis dahin steht hier die Zahl der geleisteten
 * Schichten.
 *
 * **`null` heißt: hier ist nichts im Gange** — das Grundstück ist fertig erschlossen. Das
 * ist die Richtung, in die ein Fehler fallen soll, dieselbe Überlegung wie bei
 * `underConstruction` (5.76): Alles, was vor dieser Migration angelegt wurde, ist fertig,
 * und jede Stelle, die künftig ein Grundstück anlegt, ohne an die Erschließung zu denken,
 * bekommt ebenfalls ein fertiges. Andersherum entstünden stillschweigend Flächen, die
 * niemand bebauen kann — im Seed, im Pachthof und in jeder Testdatei.
 *
 * Die Null ist deshalb **nicht** der Normalfall, sondern der erste Tag einer Baustelle.
 * Wer prüft, fragt `isUnderDevelopment()` und nicht die Zahl.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const spalten = await queryInterface.describeTable('plots');
	if (spalten.developmentShifts) return;

	await queryInterface.addColumn('plots', 'developmentShifts', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('plots', 'developmentShifts');
}
