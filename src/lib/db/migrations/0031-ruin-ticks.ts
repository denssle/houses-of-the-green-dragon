import type { QueryInterface } from 'sequelize';

/**
 * Die Ruinen in Grünau an ihren richtigen Tick (0.9.3).
 *
 * Bis 0.9.2 trug `BUILDING_RUINED` den Tick der letzten Zustandsbuchung, also den Beginn
 * des Verfalls statt seines Endes. Seit 0.9.3 rechnet `ruinTick` den Einsturz aus; für
 * die vier Einträge, die bis dahin entstanden waren, geht das nicht mehr — die Gebäude
 * sind gelöscht und mit ihnen der Zustand.
 *
 * **Die richtigen Ticks stammen aus der Uhrzeit.** Jeder Eintrag wurde im Tick seines
 * Einsturzes geschrieben, und Ereignisse derselben Stunde verraten, welcher das war
 * (gemessen am 09.11.2026):
 *
 * - Steinmetzhütte: 14:20 am 06.10., eine Stunde nach Tick 6100 → 6101
 * - Schmiede: 12:19 am 14.10., mit `JOB_ENDED` in Tick 6291 → 6291 (= 5291 + 1000 Ticks
 *   Verfall von voll auf null; die Rechnung bestätigt die Uhr)
 * - Wohnhaus: 22:19 am 06.11., zehn Stunden vor Tick 6863, ohne Ausfall dazwischen → 6853
 * - Wohnhaus: 17:20 am 07.11., mit `JOB_TAKEN` in Tick 6872 → 6872
 *
 * Gezielt nach Kennung **und** altem Tick: Eine andere Welt hat diese Zeilen nicht, und
 * ein zweiter Lauf findet den alten Tick nicht mehr.
 */
export const KORREKTUREN: readonly { id: string; alt: number; neu: number }[] = [
	{ id: '6f5bbd6a-c472-4fdc-88df-adee576fda57', alt: 5771, neu: 6101 },
	{ id: '864cfe7a-f0ed-4cd8-b76a-5a6979e5cc11', alt: 5291, neu: 6291 },
	{ id: '28d9dafa-2954-46dc-8509-added5b5a0fa', alt: 6363, neu: 6853 },
	{ id: 'd3acf3c4-f39c-40d5-ab37-ff05f12eb039', alt: 6182, neu: 6872 }
];

async function setzen(queryInterface: QueryInterface, von: 'alt' | 'neu', nach: 'alt' | 'neu') {
	for (const korrektur of KORREKTUREN) {
		await queryInterface.sequelize.query(
			`UPDATE events SET tick = ? WHERE id = ? AND kind = 'BUILDING_RUINED' AND tick = ?`,
			{ replacements: [korrektur[nach], korrektur.id, korrektur[von]] }
		);
	}
}

export async function up(queryInterface: QueryInterface): Promise<void> {
	await setzen(queryInterface, 'alt', 'neu');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await setzen(queryInterface, 'neu', 'alt');
}
