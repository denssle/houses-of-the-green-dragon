import { describe, expect, it } from 'vitest';
import {
	ABSENCE_AFTER_TICKS,
	CARETAKER_ACTIONS,
	decideCaretakerAction,
	decideNpcAction,
	isUnattended,
	type NpcState
} from '$lib/game/npc.logic';
import { PERSONALITY_AXES, type Personality } from '$lib/game/personality.logic';
import { SATIETY_MAX } from '$lib/game/need.logic';

/**
 * Phase 5.5 — der abwesende Spieler.
 *
 * Zwei Fragen: Ab wann gilt jemand als verwaist, und was darf für ihn getan werden?
 */

function anlagen(): Personality {
	const voll = {} as Personality;
	for (const achse of PERSONALITY_AXES) voll[achse] = 0;
	return voll;
}

/**
 * Ein versorgter Charakter, der von sich aus nichts tut.
 *
 * Dieselbe Bauart wie `zufrieden` in `npc.logic.spec.ts`: Der Ausgangszustand darf keine
 * Stufe auslösen, sonst prüft der Test nicht, was er zu prüfen vorgibt.
 */
function lage(werte: Partial<NpcState> = {}): NpcState {
	return {
		personality: anlagen(),
		actionPoints: 10,
		money: 1000,
		satiety: SATIETY_MAX,
		food: 5,
		hasHome: true,
		homeAvailable: true,
		isMarried: true,
		isAdult: true,
		workAvailable: true,
		hasJob: false,
		betterJobAvailable: false,
		matchAvailable: false,
		foodPrice: 4,
		wearsGarment: true,
		garmentInStock: 0,
		tonicInStock: 1,
		garmentPrice: 14,
		tonicPrice: 10,
		ownsWorkshop: false,
		hasFreePlot: false,
		hasLease: false,
		leaseAvailable: false,
		ownStockToSell: 0,
		canCraft: false,
		inputPrice: null,
		plotPrice: null,
		workshopPrice: null,
		workshopMaterialMissing: false,
		leaseFee: 20,
		homeHasRoom: true,
		ownsHome: true,
		homePrice: 100,
		materialMissing: false,
		materialPrice: 20,
		repairNeeded: false,
		repairCost: 40,
		canOfferJob: false,
		canVote: false,
		campaignProgress: 0,
		...werte
	};
}

describe('Der abwesende Spieler', () => {
	describe('ab wann jemand verwaist ist', () => {
		it('gilt als abwesend, wer nie gesehen wurde', () => {
			// Trifft NPCs (richtig) und Spieler nach einem Serverstart, bis sie das erste
			// Mal hereinschauen — in der Zwischenzeit soll ihr Charakter essen.
			expect(isUnattended(null, 5_000)).toBe(true);
		});

		it('gilt als anwesend, wer eben noch da war', () => {
			expect(isUnattended(5_000, 5_000)).toBe(false);
			expect(isUnattended(5_000, 5_000 + ABSENCE_AFTER_TICKS - 1)).toBe(false);
		});

		it('wird verwaist, sobald das Aktionsbudget ansteht', () => {
			// Dieselbe Spanne wie der Deckel: Ab hier verfällt jede weitere Stunde ungenutzt,
			// und genau das ist Abwesenheit.
			expect(isUnattended(5_000, 5_000 + ABSENCE_AFTER_TICKS)).toBe(true);
		});
	});

	describe('was für ihn getan wird', () => {
		it('lässt ihn essen, wenn er hungert', () => {
			const hungrig = lage({ satiety: 10, food: 3 });

			expect(decideCaretakerAction(hungrig)).toBe('EAT');
		});

		it('lässt ihn arbeiten', () => {
			expect(decideCaretakerAction(lage({ money: 0 }))).toBe('WORK');
		});

		it('lässt ihn unter ein Dach ziehen', () => {
			// Ein Obdachloser erholt sich nicht und bekommt keine Kinder. Ihn draußen
			// stehen zu lassen wäre keine Zurückhaltung, sondern Vernachlässigung.
			const obdachlos = lage({ hasHome: false, homeAvailable: true });

			expect(decideCaretakerAction(obdachlos)).toBe('MOVE_IN');
		});

		it('lässt ihn nicht werben, sondern arbeiten', () => {
			// Wen er heiratet, entscheidet der Spieler und niemand sonst.
			const umworben = lage({ isMarried: false, matchAvailable: true });

			expect(decideNpcAction(umworben)).toBe('COURT');
			expect(decideCaretakerAction(umworben)).toBe('WORK');
		});

		it('erlaubt nichts, was Besitz festlegt', () => {
			// Die Liste selbst ist die Zusage: erhalten ja, entscheiden nein.
			for (const verboten of ['COURT', 'BUY_PLOT', 'BUILD', 'BUILD_HOME', 'TAKE_JOB', 'VOTE']) {
				expect(CARETAKER_ACTIONS).not.toContain(verboten);
			}
		});

		it('bleibt untätig, wenn es nichts zu erhalten gibt', () => {
			const nichtsZuTun = lage({ workAvailable: false, actionPoints: 0, money: 500 });

			expect(decideCaretakerAction(nichtsZuTun)).toBe('IDLE');
		});
	});
});
