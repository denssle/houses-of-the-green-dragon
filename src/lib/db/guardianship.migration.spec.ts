import { describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { up as stellenFrei } from '$lib/db/migrations/0029-release-dead-jobs';
import { up as vormundschaft } from '$lib/db/migrations/0030-guardianship';

/**
 * Die Migrationen zu 0.7.0 auf einer Welt, wie sie live steht — mit eigener Datenbank,
 * weil `seedWorld` das Waisenhaus längst mitbringt.
 */
async function welt() {
	const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
	const q = db.getQueryInterface();
	const text = { type: DataTypes.STRING, allowNull: true };
	await q.createTable('regions', { id: DataTypes.STRING, type: DataTypes.STRING });
	await q.createTable('worlds', { id: DataTypes.STRING, currentTick: DataTypes.INTEGER });
	await q.createTable('characters', { id: DataTypes.STRING, deathTick: DataTypes.INTEGER });
	await q.createTable('employments', { EmployeeCharacterId: DataTypes.STRING });
	await q.createTable('plots', {
		id: DataTypes.STRING,
		RegionId: DataTypes.STRING,
		type: DataTypes.STRING,
		ownerType: DataTypes.STRING,
		OwnerCharacterId: text,
		forSalePrice: DataTypes.INTEGER,
		escheatedTick: DataTypes.INTEGER
	});
	await q.createTable('auctions', { PlotId: DataTypes.STRING, closed: DataTypes.BOOLEAN });
	await q.createTable('buildings', {
		id: DataTypes.STRING,
		name: DataTypes.STRING,
		optionId: DataTypes.INTEGER,
		level: DataTypes.INTEGER,
		condition: DataTypes.INTEGER,
		lastConditionTick: DataTypes.INTEGER,
		PlotId: DataTypes.STRING,
		ownerType: DataTypes.STRING,
		underConstruction: DataTypes.BOOLEAN,
		createdAt: DataTypes.DATE,
		updatedAt: DataTypes.DATE
	});
	await q.bulkInsert('regions', [{ id: 'gruenau', type: 'CITY' }]);
	await q.bulkInsert('worlds', [{ id: 'welt', currentTick: 6900 }]);
	return { db, q };
}

const platz = (id: string, ownerType: string, escheatedTick: number | null = null) => ({
	id,
	RegionId: 'gruenau',
	type: 'BUILDING_LAND',
	ownerType,
	escheatedTick
});

describe('Migrationen zu 0.7.0', () => {
	it('löscht nur die Verträge der Toten', async () => {
		const { db, q } = await welt();
		await q.bulkInsert('characters', [
			{ id: 'gertrud', deathTick: 6733 },
			{ id: 'konrad', deathTick: null }
		]);
		await q.bulkInsert('employments', [
			{ EmployeeCharacterId: 'gertrud' },
			{ EmployeeCharacterId: 'konrad' }
		]);

		await stellenFrei(q);

		const rest = await db.query('SELECT EmployeeCharacterId FROM employments', {
			type: QueryTypes.SELECT
		});
		expect(rest).toEqual([{ EmployeeCharacterId: 'konrad' }]);
	});

	it('stellt das Waisenhaus auf echten Stadtgrund, nicht auf einen Nachlass', async () => {
		const { db, q } = await welt();
		await q.bulkInsert('plots', [
			platz('frei', 'NONE'),
			platz('nachlass', 'CITY', 6000),
			platz('stadtgrund', 'CITY')
		]);

		await vormundschaft(q);

		const haeuser = await db.query<{ PlotId: string; lastConditionTick: number }>(
			'SELECT PlotId, lastConditionTick FROM buildings WHERE optionId = 14',
			{ type: QueryTypes.SELECT }
		);
		expect(haeuser).toEqual([{ PlotId: 'stadtgrund', lastConditionTick: 6900 }]);
		expect(await q.describeTable('characters')).toHaveProperty('guardianId');
	});

	it('nimmt einen Nachlass, wenn nichts anderes frei ist, und behält ihn dann', async () => {
		const { db, q } = await welt();
		await q.bulkInsert('plots', [platz('frei', 'NONE'), platz('nachlass', 'CITY', 6000)]);

		await vormundschaft(q);

		const [boden] = await db.query<{ escheatedTick: number | null }>(
			`SELECT escheatedTick FROM plots WHERE id = 'nachlass'`,
			{ type: QueryTypes.SELECT }
		);
		expect(boden.escheatedTick).toBeNull();
	});

	it('fasst keinen Platz an, der gerade versteigert wird', async () => {
		const { db, q } = await welt();
		await q.bulkInsert('plots', [
			platz('umkaempft', 'CITY'),
			platz('nachlass', 'CITY', 6000),
			platz('frei', 'NONE')
		]);
		await q.bulkInsert('auctions', [
			{ PlotId: 'umkaempft', closed: false },
			{ PlotId: 'nachlass', closed: true },
			{ PlotId: 'nachlass', closed: false },
			{ PlotId: 'frei', closed: true }
		]);

		await vormundschaft(q);

		const haeuser = await db.query<{ PlotId: string }>(
			'SELECT PlotId FROM buildings WHERE optionId = 14',
			{ type: QueryTypes.SELECT }
		);
		expect(haeuser).toEqual([{ PlotId: 'frei' }]);
	});

	it('baut bei einem zweiten Lauf kein zweites Haus', async () => {
		const { db, q } = await welt();
		await q.bulkInsert('plots', [platz('a', 'CITY'), platz('b', 'CITY')]);

		await vormundschaft(q);
		await vormundschaft(q);

		const haeuser = await db.query('SELECT id FROM buildings WHERE optionId = 14', {
			type: QueryTypes.SELECT
		});
		expect(haeuser).toHaveLength(1);
	});
});
