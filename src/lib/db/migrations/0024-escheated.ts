import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Die Spalte für den Heimfall (5.42, Punkt 79).
 *
 * **Was der Stadt gehört, gehört ihr aus zwei verschiedenen Gründen.** Das Rathaus und
 * die städtische Schmiede sind ihre Aufgabe — sie hält sie instand und schreibt ihre
 * Stellen aus. Eine Kate, deren Besitzer ohne Erben starb, ist das Gegenteil: Sie gehört
 * ihr nur, bis sich ein Käufer findet. Am `ownerType` war beides dasselbe, und deshalb
 * behandelte das Spiel beides gleich.
 *
 * Der Unterschied ist die **Herkunft**, und die lässt sich nicht aus der Bauart
 * ableiten: Ein geerbter Betrieb sähe aus wie die städtische Schmiede. Also wird sie
 * festgehalten — der Tick, an dem das Haus der Stadt zufiel.
 *
 * `null` heißt **von jeher städtisch** und ist für jedes bestehende Haus richtig: Was
 * heute im Stadtbesitz steht, stammt aus dem Weltaufbau. Grünau bestätigt es — Rathaus,
 * Schmiede, Unterkunft und Marktplatz, sonst nichts.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const spalten = await queryInterface.describeTable('buildings');
	if (spalten.escheatedTick) return;

	await queryInterface.addColumn('buildings', 'escheatedTick', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('buildings', 'escheatedTick');
}
