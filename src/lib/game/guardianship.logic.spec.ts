import { describe, expect, it } from 'vitest';
import { chooseGuardian, isMinor, type Kin, kinshipRank, NAHE } from '$lib/game/guardianship.logic';
import { yearsToTicks } from '$lib/game/time';

const leer = { motherId: null, fatherId: null, DynastyId: null };
const kind: Kin = { id: 'kind', motherId: 'mutter', fatherId: 'vater', DynastyId: 'haus' };
const mutter: Kin = { ...leer, id: 'mutter', motherId: 'oma' };
const vater: Kin = { ...leer, id: 'vater', fatherId: 'opa' };

function rang(kandidat: Partial<Kin> & { id: string }): number | undefined {
	return kinshipRank(kind, [mutter, vater], { ...leer, ...kandidat });
}

describe('Verwandtschaft einer Waise', () => {
	it('kennt die Linien von nah nach fern', () => {
		expect(rang({ id: 'oma' })).toBe(NAHE.GROSSELTERN);
		expect(rang({ id: 'bruder', motherId: 'mutter' })).toBe(NAHE.GESCHWISTER);
		expect(rang({ id: 'tante', motherId: 'oma' })).toBe(NAHE.ONKEL_ODER_TANTE);
		expect(rang({ id: 'vetter', DynastyId: 'haus' })).toBe(NAHE.HAUS);
	});

	it('zählt Fremde nicht, auch wenn beide kein Haus haben', () => {
		expect(rang({ id: 'fremd' })).toBeUndefined();
		expect(
			kinshipRank({ ...kind, DynastyId: null }, [], { ...leer, id: 'ebenfalls-ohne-haus' })
		).toBeUndefined();
	});
});

describe('chooseGuardian', () => {
	it('nimmt den Nächsten, auch wenn ein Fernerer reicher ist', () => {
		expect(
			chooseGuardian([
				{ id: 'reicher-vetter', rank: NAHE.HAUS, money: 900, birthTick: 0 },
				{ id: 'arme-oma', rank: NAHE.GROSSELTERN, money: 0, birthTick: 0 }
			])
		).toBe('arme-oma');
	});

	it('nimmt unter Gleichnahen den mit dem meisten Geld', () => {
		expect(
			chooseGuardian([
				{ id: 'arm', rank: NAHE.GESCHWISTER, money: 1, birthTick: 0 },
				{ id: 'reich', rank: NAHE.GESCHWISTER, money: 50, birthTick: 10 }
			])
		).toBe('reich');
	});

	it('findet ohne Kandidaten niemanden', () => {
		expect(chooseGuardian([])).toBeUndefined();
	});
});

describe('isMinor', () => {
	it('zieht die Grenze bei sechzehn vollen Jahren', () => {
		expect(isMinor(1000 - yearsToTicks(16) + 1, 1000)).toBe(true);
		expect(isMinor(1000 - yearsToTicks(16), 1000)).toBe(false);
	});
});
