import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { up, down, KORREKTUREN } from '$lib/db/migrations/0031-ruin-ticks';

/**
 * Die Ruinen an ihren richtigen Tick (0.9.3) — gegen eine eigene kleine Datenbank, denn
 * 0031 ändert keine Spalte, sondern vier Zeilen der laufenden Welt.
 */
describe('Migration 0031: Ruinen-Ticks', () => {
	let db: Sequelize;

	async function tick(id: string): Promise<number> {
		const [zeile] = await db.query<{ tick: number }>('SELECT tick FROM events WHERE id = ?', {
			replacements: [id],
			type: QueryTypes.SELECT
		});
		return zeile.tick;
	}

	beforeAll(async () => {
		db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
		const qi = db.getQueryInterface();
		await qi.createTable('events', {
			id: { type: DataTypes.STRING, primaryKey: true },
			kind: { type: DataTypes.STRING },
			tick: { type: DataTypes.INTEGER }
		});
		await qi.bulkInsert('events', [
			...KORREKTUREN.map((k) => ({ id: k.id, kind: 'BUILDING_RUINED', tick: k.alt })),
			// Schon berichtigt — darf kein zweites Mal wandern.
			{ id: 'fremd-ruine', kind: 'BUILDING_RUINED', tick: 4000 },
			// Dieselbe Kennung, anderes Ereignis: bleibt, wie es ist.
			{ id: 'anderes', kind: 'DEATH', tick: 5291 }
		]);

		await up(qi);
	});

	afterAll(async () => {
		await db.close();
	});

	it('setzt jede Ruine auf den Tick ihres Einsturzes', async () => {
		for (const k of KORREKTUREN) expect(await tick(k.id)).toBe(k.neu);
	});

	it('lässt alles andere stehen', async () => {
		expect(await tick('fremd-ruine')).toBe(4000);
		expect(await tick('anderes')).toBe(5291);
	});

	it('verschiebt beim zweiten Lauf nichts mehr', async () => {
		await up(db.getQueryInterface());
		for (const k of KORREKTUREN) expect(await tick(k.id)).toBe(k.neu);
	});

	it('lässt sich zurückrollen', async () => {
		await down(db.getQueryInterface());
		for (const k of KORREKTUREN) expect(await tick(k.id)).toBe(k.alt);
	});
});
