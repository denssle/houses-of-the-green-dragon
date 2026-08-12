import { afterEach, describe, expect, it } from 'vitest';
import { Sequelize } from 'sequelize';

/**
 * Rauchtest für die frisch eingerichtete Werkzeugkette (Phase 1.1).
 *
 * Prüft nicht Spiellogik, sondern dass Vitest, TypeScript, Sequelize und der
 * SQLite-Treiber überhaupt zusammenspielen. Gerade `sqlite3` ist ein natives Modul und
 * damit die Stelle, an der ein Setup unter Windows typischerweise scheitert – ohne
 * diesen Test fiele das erst in Phase 1.2 auf, vermischt mit echten Modellfehlern.
 *
 * Wird von den Tests in 1.2 abgelöst, sobald `sequelize.ts` steht.
 */
describe('Werkzeugkette', () => {
	let db: Sequelize | undefined;

	afterEach(async () => {
		await db?.close();
		db = undefined;
	});

	it('verbindet sich mit einer In-Memory-SQLite-Datenbank', async () => {
		db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

		await expect(db.authenticate()).resolves.toBeUndefined();
	});

	it('legt eine Tabelle an und liest zurück, was hineingeschrieben wurde', async () => {
		db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
		const Haus = db.define('haus', { name: { type: 'VARCHAR(255)' } }, { timestamps: false });
		await db.sync();

		await Haus.create({ name: 'Zum grünen Drachen' });

		const gefunden = await Haus.findOne({ where: { name: 'Zum grünen Drachen' } });
		expect(gefunden?.dataValues.name).toBe('Zum grünen Drachen');
	});
});
