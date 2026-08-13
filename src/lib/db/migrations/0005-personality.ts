import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize';

/**
 * Phase 4.4a: Jeder Charakter bekommt eine Grundpersönlichkeit.
 *
 * Sechs Achsen als Spalten am Charakter — nicht als eigene Tabelle und nicht als
 * JSON-Feld. Jeder hat genau einen Satz, er entsteht bei der Geburt und ändert sich nie;
 * eine Tabelle brächte einen Verbund für jeden Zugriff, ein JSON-Feld nähme die
 * Möglichkeit, danach zu sortieren — und genau das wird ab 4.7 gebraucht: „Wer ist der
 * Ehrgeizigste in der Stadt" ist die Kandidatensuche.
 *
 * **Der Bestand wird ausgewürfelt.** Die Vorgabe 0 wäre bequem, hieße aber: eine Stadt
 * voller vollkommen durchschnittlicher Menschen, die auch nach Generationen noch
 * durchschnittlich sind, weil sich Mittelmaß vererbt. Wer schon lebt, hat keine Eltern,
 * von denen er etwas erben könnte — er ist die erste Generation, und für die ist Würfeln
 * die richtige Antwort.
 *
 * Die Zahlen stehen hier ausgeschrieben und kommen **nicht** aus
 * `personality.logic.ts`: Eine Migration muss auch in fünf Jahren noch dasselbe tun.
 * Importierte Logik würde sich mit dem Spiel weiterentwickeln und diesen Schritt
 * rückwirkend verändern.
 */

const ACHSEN = [
	'courage',
	'diligence',
	'greed',
	'sociability',
	'ambition',
	'agreeableness'
] as const;

/** Mittelwert dreier Würfe: eine Glockenkurve statt einer Gleichverteilung. */
function wert(): number {
	const mittel: number = (Math.random() + Math.random() + Math.random()) / 3;
	return Math.round((mittel * 2 - 1) * 100);
}

export async function up(queryInterface: QueryInterface): Promise<void> {
	for (const achse of ACHSEN) {
		await queryInterface.addColumn('characters', achse, {
			type: DataTypes.INTEGER,
			allowNull: false,
			defaultValue: 0
		});
	}

	// In JavaScript und nicht per SQL-Zufallsfunktion: `random()` heißt unter SQLite
	// anders als `RAND()` unter MariaDB und liefert einen anderen Wertebereich. Ein
	// Schleifendurchlauf über den Bestand ist dialektunabhängig und hier billig — es
	// geht um die Bevölkerung einer Stadt, nicht um Millionen Zeilen.
	const vorhandene = await queryInterface.sequelize.query<{ id: string }>(
		'SELECT id FROM characters',
		{ type: QueryTypes.SELECT }
	);

	for (const charakter of vorhandene) {
		const setzen: string = ACHSEN.map((achse) => `${achse} = ${wert()}`).join(', ');
		await queryInterface.sequelize.query(`UPDATE characters SET ${setzen} WHERE id = ?`, {
			replacements: [charakter.id]
		});
	}
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	for (const achse of ACHSEN) {
		await queryInterface.removeColumn('characters', achse);
	}
}
