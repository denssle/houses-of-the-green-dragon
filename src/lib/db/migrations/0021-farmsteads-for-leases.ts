import { randomUUID } from 'node:crypto';
import { type QueryInterface, QueryTypes } from 'sequelize';

/**
 * Höfe für Pachten nachtragen, die es vor 5.15 schon gab.
 *
 * **Seit 5.15 gehört zu jeder Pacht ein Hof** — das Wirtschaftsgebäude, an dem die
 * Anstellung hängt. `leasePlot` legt ihn seither mit an; bestehende Pachten kennen ihn
 * nicht. Ohne diesen Nachtrag könnte ein Pächter, der seine Fläche vor dem Umbau genommen
 * hat, dort nie jemanden beschäftigen — und niemand käme darauf, warum es bei ihm nicht
 * geht und bei seinem Nachbarn schon.
 *
 * **Idempotent**: Wo der Hof schon steht, tut sie nichts. In einer frischen Welt läuft sie
 * vor dem Seed und findet keine Pacht — auch dann nichts.
 */

/** Muss zu `HOF_OPTION_ID` in `buildingService` passen. */
const HOF = 13;

export async function up(queryInterface: QueryInterface): Promise<void> {
	const pachten = await queryInterface.sequelize.query<{
		PlotId: string;
		CharacterId: string;
		address: string;
	}>(
		`SELECT l.PlotId, l.CharacterId, p.address FROM leases l
		 JOIN plots p ON p.id = l.PlotId`,
		{ type: QueryTypes.SELECT }
	);
	if (pachten.length === 0) return;

	const welt = await queryInterface.sequelize.query<{ currentTick: number }>(
		'SELECT currentTick FROM worlds LIMIT 1',
		{ type: QueryTypes.SELECT }
	);
	const jetzt: number = welt[0]?.currentTick ?? 0;

	for (const pacht of pachten) {
		const vorhanden = await queryInterface.sequelize.query<{ anzahl: number }>(
			'SELECT COUNT(*) AS anzahl FROM buildings WHERE PlotId = :plot AND optionId = :option',
			{ replacements: { plot: pacht.PlotId, option: HOF }, type: QueryTypes.SELECT }
		);
		if (Number(vorhanden[0]?.anzahl ?? 0) > 0) continue;

		// Über `bulkInsert` statt rohem SQL: `condition` ist in MariaDB ein reserviertes
		// Wort, und Sequelize setzt die Anführungszeichen je Dialekt selbst.
		await queryInterface.bulkInsert('buildings', [
			{
				id: randomUUID(),
				name: `Hof am ${pacht.address}`,
				optionId: HOF,
				level: 1,
				condition: 100,
				lastConditionTick: jetzt,
				PlotId: pacht.PlotId,
				ownerType: 'CHARACTER',
				OwnerCharacterId: pacht.CharacterId,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		]);
	}
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	// Die Höfe wieder abtragen — anders als bei den städtischen Pflichtbauten ist das hier
	// gefahrlos: Sie tragen keinen Wert, den jemand bezahlt hat.
	await queryInterface.bulkDelete('buildings', { optionId: HOF });
}
