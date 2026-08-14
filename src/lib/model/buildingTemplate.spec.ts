import { describe, expect, it } from 'vitest';
import { costLine, itemLine } from '$lib/model/buildingTemplate';

/**
 * Die Kostenzeile — der Fehler, der bis auf den Server durchkam.
 *
 * Im Template stand die Aufzählung zwischen `{#if}` und `{#each}`, und Svelte verschluckt
 * an diesen Grenzen die Leerzeichen: Auf der Bauseite stand „190 Münzenund 8 Bretter,4
 * Quader". Kein Test hätte das gefunden, weil es keinen gab — die Zeile entstand im
 * Markup. Jetzt entsteht sie in einer Funktion, und die Fugen sind prüfbar.
 */
describe('Die Kostenzeile', () => {
	it('setzt zwischen Zahl und Wort ein Leerzeichen', () => {
		expect(itemLine([{ quantity: 8, name: 'Bretter' }])).toBe('8 Bretter');
	});

	it('trennt mehrere Posten mit Komma und Leerzeichen', () => {
		expect(
			itemLine([
				{ quantity: 8, name: 'Bretter' },
				{ quantity: 4, name: 'Quader' },
				{ quantity: 2, name: 'Eisen' }
			])
		).toBe('8 Bretter, 4 Quader, 2 Eisen');
	});

	it('bleibt bei nichts auch leer', () => {
		expect(itemLine([])).toBe('');
	});

	it('hängt den Baustoff mit „und" an den Preis', () => {
		expect(costLine(190, [{ quantity: 8, name: 'Bretter' }])).toBe('190 Münzen und 8 Bretter');
	});

	// Die Schmiede kostet nur Geld. Ein „und" ohne Fortsetzung wäre ein halber Satz.
	it('nennt nur den Preis, wo kein Baustoff nötig ist', () => {
		expect(costLine(250, [])).toBe('250 Münzen');
	});
});
