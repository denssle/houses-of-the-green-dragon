import { randomUUID } from 'node:crypto';
import { DataTypes, type QueryInterface, QueryTypes } from 'sequelize';

const WAISENHAUS_OPTION_ID = 14;

/**
 * Der Vormund und das Waisenhaus (0.7.0).
 *
 * `guardianId` steht am Kind: Wer für es sorgt, wenn die Eltern tot sind.
 *
 * **Das Waisenhaus wird in der laufenden Welt sofort gestellt** und nicht als Rohbau
 * begonnen. Ein öffentlicher Bau braucht zwanzig Schichten, die erst jemand arbeiten muss,
 * und dort leben heute schon Waisen. In einer frischen Datenbank gibt es hier noch keine
 * Stadt; dann legt `seedWorld` das Haus an.
 *
 * **Der Bauplatz:** zuerst freier Stadtgrund, der nie jemandem gehörte, dann ein freier
 * Nachlass (die Stadt behält ihn dann, statt ihn zu versteigern), zuletzt noch nicht
 * vergebenes Land. **Nie ein Platz, der gerade versteigert wird:** Sonst stünde das Haus auf
 * einem Grundstück, das in derselben Woche jemand ersteigert. In Grünau haben fast alle
 * freien Plätze abgeschlossene Auktionen hinter sich; zählen dürfen nur die offenen.
 *
 * Die Vorlagenummer steht hier als eigene Zahl, damit eine Migration nicht an einer
 * Konstante hängt, die sich später ändern könnte.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
	const spalten = await queryInterface.describeTable('characters');
	if (!spalten.guardianId) {
		await queryInterface.addColumn('characters', 'guardianId', {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: null
		});
	}

	const db = queryInterface.sequelize;
	const [stadt] = await db.query<{ id: string }>(`SELECT id FROM regions WHERE type = 'CITY'`, {
		type: QueryTypes.SELECT
	});
	if (!stadt) return;

	const schon = await db.query(
		`SELECT id FROM buildings WHERE optionId = ${WAISENHAUS_OPTION_ID}`,
		{
			type: QueryTypes.SELECT
		}
	);
	if (schon.length > 0) return;

	const [plaetze, welt] = await Promise.all([
		db.query<{ id: string; ownerType: string; escheatedTick: number | null }>(
			`SELECT p.id, p.ownerType, p.escheatedTick FROM plots p
			LEFT JOIN buildings b ON b.PlotId = p.id
			WHERE b.id IS NULL AND p.RegionId = :stadt AND p.type = 'BUILDING_LAND'
				AND p.ownerType IN ('CITY', 'NONE')
				AND p.id NOT IN (SELECT PlotId FROM auctions WHERE closed = 0)`,
			{ type: QueryTypes.SELECT, replacements: { stadt: stadt.id } }
		),
		db.query<{ currentTick: number }>(`SELECT currentTick FROM worlds`, {
			type: QueryTypes.SELECT
		})
	]);
	const gueteVon = (platz: { ownerType: string; escheatedTick: number | null }): number => {
		if (platz.ownerType === 'NONE') return 2;
		return platz.escheatedTick === null ? 0 : 1;
	};
	const platz = [...plaetze].sort((a, b) => gueteVon(a) - gueteVon(b))[0];
	if (!platz) return;

	await queryInterface.bulkUpdate(
		'plots',
		{ ownerType: 'CITY', OwnerCharacterId: null, forSalePrice: null, escheatedTick: null },
		{ id: platz.id }
	);
	const jetzt = new Date();
	await queryInterface.bulkInsert('buildings', [
		{
			id: randomUUID(),
			name: 'Städtisches Waisenhaus',
			optionId: WAISENHAUS_OPTION_ID,
			level: 1,
			condition: 100,
			lastConditionTick: welt[0]?.currentTick ?? 0,
			PlotId: platz.id,
			ownerType: 'CITY',
			underConstruction: false,
			createdAt: jetzt,
			updatedAt: jetzt
		}
	]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.bulkDelete('buildings', { optionId: WAISENHAUS_OPTION_ID });
	await queryInterface.removeColumn('characters', 'guardianId');
}
