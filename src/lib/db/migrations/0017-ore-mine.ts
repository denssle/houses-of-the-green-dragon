import { randomUUID } from 'node:crypto';
import { type QueryInterface, QueryTypes } from 'sequelize';

/**
 * Die Erzgrube für Bestandswelten nachtragen (4.10).
 *
 * Dieselbe Lage wie bei den fehlenden Stadtgebäuden: Der Seed läuft nur einmal, und was
 * später dazukommt, fehlt einer laufenden Welt für immer. Ohne Grube gibt es kein Erz,
 * ohne Erz kein Eisen — und ohne Eisen kann niemand mehr bauen, seit der Bau Material
 * verlangt.
 *
 * Idempotent: Wo die Grube steht, geschieht nichts; in einer frischen Welt legt sie der
 * Seed an.
 */

const NAME = 'Erzgrube';
const ENTFERNUNG = 4;

export async function up(queryInterface: QueryInterface): Promise<void> {
	const vorhanden = await queryInterface.sequelize.query<{ id: string }>(
		"SELECT id FROM regions WHERE type = 'MINE' LIMIT 1",
		{ type: QueryTypes.SELECT }
	);
	if (vorhanden.length > 0) return;

	const staedte = await queryInterface.sequelize.query<{ id: string }>(
		"SELECT id FROM regions WHERE type = 'CITY'",
		{ type: QueryTypes.SELECT }
	);
	if (staedte.length === 0) return;

	const grubeId: string = randomUUID();
	await queryInterface.bulkInsert('regions', [
		{
			id: grubeId,
			name: NAME,
			type: 'MINE',
			treasury: null,
			lastTaxTick: null,
			createdAt: new Date(),
			updatedAt: new Date()
		}
	]);

	// In beide Richtungen, wie im Seed: Ein Weg, der nur hinführt, ist keiner.
	for (const stadt of staedte) {
		await queryInterface.bulkInsert('regionLinks', [
			{
				fromRegionId: stadt.id,
				toRegionId: grubeId,
				distanceInTicks: ENTFERNUNG,
				createdAt: new Date(),
				updatedAt: new Date()
			},
			{
				fromRegionId: grubeId,
				toRegionId: stadt.id,
				distanceInTicks: ENTFERNUNG,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		]);
	}

	await queryInterface.bulkInsert('plots', [
		{
			id: randomUUID(),
			address: `${NAME} 1`,
			type: 'RESOURCE',
			resourceType: 'ORE',
			RegionId: grubeId,
			ownerType: 'NONE',
			OwnerCharacterId: null,
			forSalePrice: null,
			createdAt: new Date(),
			updatedAt: new Date()
		}
	]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.sequelize.query("DELETE FROM regions WHERE type = 'MINE' AND name = :name", {
		replacements: { name: NAME }
	});
}
