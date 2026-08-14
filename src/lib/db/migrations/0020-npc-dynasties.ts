import { DataTypes, type QueryInterface, QueryTypes } from 'sequelize';
import { randomUUID } from 'node:crypto';

/**
 * Phase 5.10: Auch NPCs gehören zu einem Haus — und tragen damit einen Nachnamen.
 *
 * Bis hierher hatte ein Haus zwingend einen Benutzer, und die Fremd-NPCs, die die Welt
 * bevölkern, standen ohne Haus da. In einer Liste von zwölf Einwohnern fällt das kaum auf;
 * bei hundert stehen Namen mit und ohne Zugehörigkeit nebeneinander, und niemand weiß, wer
 * zu wem gehört.
 *
 * `UserId` wird deshalb nullbar: Ein Haus ohne Benutzer ist eine Familie, die niemand
 * spielt. Dieselbe Form trägt auch das anonymisierte Konto aus 5.9 und die Frage aus
 * Punkt 40, ob eine Dynastie ohne Spieler zum NPC-Haus wird — die Antwort ist jetzt
 * überall dieselbe.
 *
 * Bestandswelten bekommen ihre Häuser nachgereicht: **eines je hauslosem Charakter**,
 * benannt nach der Namensliste. Wer zusammen gehört, wird dabei nicht zusammengeführt —
 * das ließe sich aus den Daten nicht zuverlässig ableiten, und ein falsch zugeordneter
 * Nachname ist schlimmer als ein neuer.
 */

/** Familiennamen, wie sie in einer Stadt dieser Zeit vorkommen: nach dem, was man tut. */
const NAMEN = [
	'Steinmetz',
	'Schmied',
	'Müller',
	'Weber',
	'Becker',
	'Fischer',
	'Schuster',
	'Wagner',
	'Zimmermann',
	'Gerber',
	'Schneider',
	'Bader',
	'Köhler',
	'Krämer',
	'Fuhrmann',
	'Hirte',
	'Winzer',
	'Färber',
	'Töpfer',
	'Seiler'
] as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.changeColumn('dynasties', 'UserId', {
		type: DataTypes.STRING,
		allowNull: true,
		defaultValue: null
	});

	const haustlos = await queryInterface.sequelize.query<{ id: string }>(
		'SELECT id FROM characters WHERE DynastyId IS NULL',
		{ type: QueryTypes.SELECT }
	);

	const jetzt = await queryInterface.sequelize.query<{ currentTick: number }>(
		'SELECT currentTick FROM worlds LIMIT 1',
		{ type: QueryTypes.SELECT }
	);
	const tick: number = jetzt[0]?.currentTick ?? 0;

	for (const [nummer, person] of haustlos.entries()) {
		const hausId: string = randomUUID();
		// Reicht die Liste nicht, wird durchgezählt: „Weber II" ist hässlicher als ein
		// eigener Name, aber ehrlicher als zwei Familien, die gleich heißen.
		const runde: number = Math.floor(nummer / NAMEN.length);
		const name: string =
			NAMEN[nummer % NAMEN.length] + (runde > 0 ? ` ${'I'.repeat(runde + 1)}` : '');

		await queryInterface.bulkInsert('dynasties', [
			{
				id: hausId,
				name,
				UserId: null,
				isExtinct: false,
				foundedAtTick: tick,
				extinctAtTick: null,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		]);
		await queryInterface.sequelize.query('UPDATE characters SET DynastyId = ? WHERE id = ?', {
			replacements: [hausId, person.id],
			type: QueryTypes.UPDATE
		});
	}
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	// Die nachgereichten Häuser bleiben stehen: Sie von den Charakteren zu lösen hieße,
	// den Nachnamen zu verlieren, und welche Häuser hier entstanden sind, ließe sich
	// hinterher nicht mehr sagen.
	await queryInterface.changeColumn('dynasties', 'UserId', {
		type: DataTypes.STRING,
		allowNull: false
	});
}
