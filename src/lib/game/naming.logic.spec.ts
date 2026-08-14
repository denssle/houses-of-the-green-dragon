import { describe, expect, it } from 'vitest';
import { checkName, MAX_NAME_LENGTH, normalizeName, stillNameable } from '$lib/game/naming.logic';
import { yearsToTicks } from '$lib/game/time';

const JETZT = yearsToTicks(200);

describe('Namen vergeben', () => {
	describe('was durchgeht', () => {
		it('nimmt einen gewöhnlichen Namen', () => {
			expect(checkName('Adelbert')).toEqual({ ok: true, name: 'Adelbert' });
		});

		it('räumt Leerraum weg', () => {
			expect(checkName('  Hans   Jakob ')).toEqual({ ok: true, name: 'Hans Jakob' });
		});

		it('lehnt zu kurz und zu lang ab', () => {
			expect(checkName('A')).toEqual({ ok: false, reason: 'TOO_SHORT' });
			expect(checkName('   ')).toEqual({ ok: false, reason: 'TOO_SHORT' });
			expect(checkName('x'.repeat(MAX_NAME_LENGTH + 1))).toEqual({
				ok: false,
				reason: 'TOO_LONG'
			});
		});
	});

	describe('unter Geschwistern', () => {
		it('lässt keinen Namen zweimal zu', () => {
			expect(checkName('Alheid', ['Bertram', 'Alheid'])).toEqual({ ok: false, reason: 'TAKEN' });
		});

		it('sieht dabei über Groß- und Kleinschreibung hinweg', () => {
			// Zwei Kinder, die man in einer Liste nicht auseinanderhalten kann, sind eine
			// Falle — auch wenn die Zeichen verschieden sind.
			expect(checkName('alheid', ['Alheid'])).toEqual({ ok: false, reason: 'TAKEN' });
			expect(checkName('Alheid', ['  alheid  '])).toEqual({ ok: false, reason: 'TAKEN' });
		});

		it('erlaubt den Namen eines Verstorbenen', () => {
			// Tote stehen nicht in der Liste der Belegten: Ein Kind nach der Großmutter zu
			// benennen ist genau das, was Häuser tun.
			expect(checkName('Alheid', ['Bertram'])).toEqual({ ok: true, name: 'Alheid' });
		});
	});

	describe('bis wann', () => {
		it('lässt Kinder umbenennen und Erwachsene nicht', () => {
			expect(stillNameable(JETZT - yearsToTicks(6), JETZT)).toBe(true);
			expect(stillNameable(JETZT - yearsToTicks(15), JETZT)).toBe(true);
			expect(stillNameable(JETZT - yearsToTicks(16), JETZT)).toBe(false);
			expect(stillNameable(JETZT - yearsToTicks(40), JETZT)).toBe(false);
		});
	});

	describe('das Aufräumen selbst', () => {
		it('macht aus jeder Folge von Leerzeichen eines', () => {
			expect(normalizeName(' Zum   goldenen  Weck ')).toBe('Zum goldenen Weck');
		});
	});
});
