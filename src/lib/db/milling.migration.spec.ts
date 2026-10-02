import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { up, down } from '$lib/db/migrations/0027-milling';

/**
 * Mahlen als eigene Fertigkeit — was die Migration mit den Daten tut (5.96).
 *
 * Der Schema-Abgleich in `migrations.spec.ts` sieht davon nichts: 0027 ändert keine
 * Spalte, sondern legt Zeilen an — und das auf der laufenden Welt. Geprüft wird deshalb
 * gegen eine eigene kleine Datenbank mit genau den drei Tabellen, die das SQL anfasst.
 */
describe('Migration 0027: Mahlen', () => {
	let db: Sequelize;

	async function koennen(characterId: string): Promise<Record<string, number>> {
		const zeilen = await db.query<{ type: string; level: number }>(
			'SELECT type, level FROM skills WHERE CharacterId = ?',
			{ replacements: [characterId], type: QueryTypes.SELECT }
		);
		return Object.fromEntries(zeilen.map((zeile) => [zeile.type, zeile.level]));
	}

	beforeAll(async () => {
		db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
		const qi = db.getQueryInterface();
		await qi.createTable('skills', {
			CharacterId: { type: DataTypes.STRING, primaryKey: true },
			type: { type: DataTypes.STRING, primaryKey: true },
			level: { type: DataTypes.INTEGER },
			progress: { type: DataTypes.INTEGER },
			createdAt: { type: DataTypes.DATE },
			updatedAt: { type: DataTypes.DATE }
		});
		await qi.createTable('buildings', {
			id: { type: DataTypes.STRING, primaryKey: true },
			optionId: { type: DataTypes.INTEGER },
			ownerType: { type: DataTypes.STRING },
			OwnerCharacterId: { type: DataTypes.STRING, allowNull: true }
		});
		await qi.createTable('employments', {
			EmployeeCharacterId: { type: DataTypes.STRING, primaryKey: true },
			BuildingId: { type: DataTypes.STRING }
		});

		const jetzt = new Date();
		const kann = (CharacterId: string, type: string, level: number) => ({
			CharacterId,
			type,
			level,
			progress: 3,
			createdAt: jetzt,
			updatedAt: jetzt
		});
		await qi.bulkInsert('skills', [
			kann('muellerin', 'BAKING', 6),
			kann('geselle', 'BAKING', 3),
			kann('baecker', 'BAKING', 7),
			kann('schon-muellerin', 'BAKING', 2),
			kann('schon-muellerin', 'MILLING', 5)
		]);
		await qi.bulkInsert('buildings', [
			{ id: 'muehle', optionId: 4, ownerType: 'CHARACTER', OwnerCharacterId: 'muellerin' },
			{ id: 'muehle-2', optionId: 4, ownerType: 'CHARACTER', OwnerCharacterId: 'schon-muellerin' },
			{ id: 'backhaus', optionId: 5, ownerType: 'CHARACTER', OwnerCharacterId: 'baecker' }
		]);
		await qi.bulkInsert('employments', [{ EmployeeCharacterId: 'geselle', BuildingId: 'muehle' }]);

		await up(qi);
	});

	afterAll(async () => {
		await db.close();
	});

	it('gibt der Müllerin ihr Können als Mahlen mit', async () => {
		expect(await koennen('muellerin')).toEqual({ BAKING: 6, MILLING: 6 });
	});

	it('auch dem Gesellen in ihrer Mühle', async () => {
		expect(await koennen('geselle')).toEqual({ BAKING: 3, MILLING: 3 });
	});

	it('aber nicht dem Bäcker — der hat nie gemahlen', async () => {
		expect(await koennen('baecker')).toEqual({ BAKING: 7 });
	});

	it('und überschreibt nichts, was schon da ist', async () => {
		expect(await koennen('schon-muellerin')).toEqual({ BAKING: 2, MILLING: 5 });
	});

	it('lässt sich zurückrollen', async () => {
		await down(db.getQueryInterface());
		expect(await koennen('muellerin')).toEqual({ BAKING: 6 });
	});
});
