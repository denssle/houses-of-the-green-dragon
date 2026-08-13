import { type QueryInterface, QueryTypes } from 'sequelize';

/**
 * Phase 4.7c: Der Verfall beginnt für öffentliche Gebäude jetzt — nicht rückwirkend.
 *
 * Bis hierher waren sie ausgenommen, ihr `lastConditionTick` steht deshalb am Weltanfang.
 * Ohne diese Migration rechnete die neue Regel die ganze bisherige Weltzeit nachträglich
 * in Verfall um: Die Stadt wäre in dem Moment halb verrottet, in dem jemand den Code
 * einspielt, ohne dass irgendwer etwas versäumt hätte. Eine Regel darf ab ihrer
 * Einführung gelten, nicht davor.
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
	const welt = await queryInterface.sequelize.query<{ currentTick: number }>(
		'SELECT currentTick FROM worlds LIMIT 1',
		{ type: QueryTypes.SELECT }
	);
	const jetzt: number = welt[0]?.currentTick ?? 0;

	await queryInterface.sequelize.query(
		'UPDATE buildings SET lastConditionTick = :jetzt WHERE ownerType = :stadt',
		{ replacements: { jetzt, stadt: 'CITY' } }
	);
}

export async function down(): Promise<void> {
	// Nichts zurückzunehmen: Der Stichtag ist eine Zahl, kein Schema.
}
