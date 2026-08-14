import { DataTypes, type QueryInterface, QueryTypes } from 'sequelize';
import { randomUUID } from 'node:crypto';

/**
 * Phase 4.11: Kleidung wird getragen — und Schafweide und Kräuterwiese für Bestandswelten.
 *
 * `wornSinceTick` ist der **einzige** neue Zustand: Ob ein Gewand noch heil ist, ergibt
 * sich aus dem Zeitpunkt des Anziehens, wie überall sonst in dieser Welt. Ein Feld für
 * „Zustand des Gewands", das je Tick heruntergezählt werden müsste, wäre die teurere und
 * die schlechtere Lösung.
 */

const NEUE_ORTE = [
	{ name: 'Schafweide', resource: 'WOOL', distance: 2, flaechen: 2 },
	{ name: 'Kräuterwiese', resource: 'HERBS', distance: 3, flaechen: 1 }
] as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.addColumn('characters', 'wornSinceTick', {
		type: DataTypes.INTEGER,
		allowNull: true,
		defaultValue: null
	});

	const staedte = await queryInterface.sequelize.query<{ id: string }>(
		"SELECT id FROM regions WHERE type = 'CITY'",
		{ type: QueryTypes.SELECT }
	);
	if (staedte.length === 0) return;

	for (const ort of NEUE_ORTE) {
		const vorhanden = await queryInterface.sequelize.query<{ id: string }>(
			'SELECT id FROM regions WHERE name = :name LIMIT 1',
			{ replacements: { name: ort.name }, type: QueryTypes.SELECT }
		);
		if (vorhanden.length > 0) continue;

		const ortId: string = randomUUID();
		await queryInterface.bulkInsert('regions', [
			{
				id: ortId,
				name: ort.name,
				type: 'FIELD',
				treasury: null,
				lastTaxTick: null,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		]);

		for (const stadt of staedte) {
			await queryInterface.bulkInsert('regionLinks', [
				{
					fromRegionId: stadt.id,
					toRegionId: ortId,
					distanceInTicks: ort.distance,
					createdAt: new Date(),
					updatedAt: new Date()
				},
				{
					fromRegionId: ortId,
					toRegionId: stadt.id,
					distanceInTicks: ort.distance,
					createdAt: new Date(),
					updatedAt: new Date()
				}
			]);
		}

		for (let nummer = 1; nummer <= ort.flaechen; nummer++) {
			await queryInterface.bulkInsert('plots', [
				{
					id: randomUUID(),
					address: `${ort.name} ${nummer}`,
					type: 'RESOURCE',
					resourceType: ort.resource,
					RegionId: ortId,
					ownerType: 'CITY',
					OwnerCharacterId: null,
					forSalePrice: null,
					createdAt: new Date(),
					updatedAt: new Date()
				}
			]);
		}
	}
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.removeColumn('characters', 'wornSinceTick');
}
