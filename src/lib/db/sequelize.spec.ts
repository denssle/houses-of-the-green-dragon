import { describe, expect, it } from 'vitest';
import { assertDatabaseCredentials, buildOptions, detectMode, sequelize } from '$lib/db/sequelize';

/**
 * Die Weiche zwischen den drei Betriebsarten ist die Stelle, an der ein falscher Zweig
 * teuer wird: Läuft die Produktion versehentlich auf SQLite, sieht alles normal aus –
 * bis das nächste Deploy die Welt mitnimmt. Deshalb hier ausdrücklich geprüft.
 */
describe('Datenbank-Weiche', () => {
	it('wählt im Testlauf SQLite im Arbeitsspeicher', () => {
		expect(detectMode()).toBe('TEST');
		expect(buildOptions('TEST')).toMatchObject({ dialect: 'sqlite', storage: ':memory:' });
	});

	it('verbindet sich mit der so gebauten Instanz', async () => {
		await expect(sequelize.authenticate()).resolves.toBeUndefined();
	});

	it('legt lokal eine Datei an, damit die Welt einen Neustart überlebt', () => {
		expect(buildOptions('LOCAL')).toMatchObject({ dialect: 'sqlite', storage: '.data/dev.sqlite' });
	});

	it('verlangt in Produktion MariaDB', () => {
		expect(buildOptions('PRODUCTION')).toMatchObject({ dialect: 'mariadb', host: 'localhost' });
	});
});

describe('Prüfung der Zugangsdaten', () => {
	it('lässt Test und lokale Entwicklung ohne Zugangsdaten durch', () => {
		expect(() => assertDatabaseCredentials('TEST')).not.toThrow();
		expect(() => assertDatabaseCredentials('LOCAL')).not.toThrow();
	});

	// Ohne diese Prüfung meldet der mariadb-Treiber nur "Access denied for ''@localhost"
	// – eine Fehlermeldung, die auf alles Mögliche hindeutet, nur nicht auf eine nicht
	// geladene .env.
	it('bricht in Produktion ohne Zugangsdaten mit einer sprechenden Meldung ab', () => {
		expect(() => assertDatabaseCredentials('PRODUCTION')).toThrowError(/MARIA_DB_USER/);
	});
});
