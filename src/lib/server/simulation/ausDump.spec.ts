import { describe, expect, it } from 'vitest';
import { parseDump, werteZeilen } from '$lib/server/simulation/ausDump';

/**
 * Der Dump-Leser (0.9.4, Punkt 122). Was er falsch liest, landet still in der Welt, aus
 * der der Messlauf weiterläuft — ein verschluckter Apostroph in einem Namen, eine Zahl als
 * Text. Deshalb die Escapes einzeln.
 */
describe('Dump lesen', () => {
	it('zerlegt Zahlen, Text und NULL', () => {
		expect(werteZeilen(`('a',2,NULL,-3.5),`)).toEqual([['a', 2, null, -3.5]]);
	});

	it('versteht die Escapes von MySQL', () => {
		expect(werteZeilen(String.raw`('O\'Brien','a\\b','x\ny','it''s');`)).toEqual([
			["O'Brien", 'a\\b', 'x\ny', "it's"]
		]);
	});

	it('nimmt Klammern und Kommas im Text nicht für Trenner', () => {
		expect(werteZeilen(`('(1,2)','a),(b'),('z')`)).toEqual([['(1,2)', 'a),(b'], ['z']]);
	});

	it('liest Spalten und Zeilen einer Tabelle', () => {
		const text = [
			'DROP TABLE IF EXISTS `worlds`;',
			'CREATE TABLE `worlds` (',
			'  `id` int(11) NOT NULL DEFAULT 1,',
			'  `currentTick` int(11) NOT NULL DEFAULT 0,',
			'  PRIMARY KEY (`id`)',
			') ENGINE=InnoDB;',
			'INSERT INTO `worlds` VALUES',
			"(1,6222,'2026-10-11 15:19:20');",
			'CREATE TABLE `leer` (',
			'  `id` int(11)',
			');',
			'INSERT INTO `regions` VALUES' // ohne CREATE TABLE davor
		].join('\n');

		expect(() => parseDump(text)).toThrow(/regions/);
		const tabellen = parseDump(text.split('\n').slice(0, -1).join('\n'));
		expect(tabellen.get('worlds')).toEqual({
			spalten: ['id', 'currentTick'],
			zeilen: [[1, 6222, '2026-10-11 15:19:20']]
		});
		expect(tabellen.get('leer')).toEqual({ spalten: ['id'], zeilen: [] });
	});
});
