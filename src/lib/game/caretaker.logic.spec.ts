import { describe, expect, it } from 'vitest';
import {
	ABSENCE_AFTER_TICKS,
	CARETAKER_ACTIONS,
	caretakerNeed,
	decideCaretakerAction,
	decideNpcAction,
	idleDetail,
	isUnattended,
	savingsGoal,
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
		childHungry: false,
		hasJob: false,
		betterJobAvailable: false,
		scarceJobAvailable: false,
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
		workshopStockToSell: 0,
		emptyPlots: 0,
		plotTaxDueSoon: 0,
		landReserve: Number.POSITIVE_INFINITY,
		materialMissingItem: null,
		workshopMaterialMissingItem: null,
		workshopGapName: null,
		ownConstruction: false,
		upgradeMaterialMissing: false,
		upgradeMaterialPrice: null,
		canCraft: false,
		inputPrice: null,
		plotPrice: null,
		workshopPrice: null,
		workshopMaterialMissing: false,
		workshopMaterialPrice: null,
		leaseFee: 20,
		homeHasRoom: true,
		ownsHome: true,
		homePrice: 100,
		materialMissing: false,
		materialPrice: 20,
		repairNeeded: false,
		repairCost: 40,
		homeUpgradePrice: null,
		workshopUpgradePrice: null,
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
	});

	describe('wie viel er verdienen darf (0.6.2, Punkt 92)', () => {
		it('arbeitet bis zur Rücklage und nicht darüber hinaus', () => {
			// Wer zurückkommt, findet Haus und Hunger versorgt, aber keinen Schatz.
			const bedarf: number = caretakerNeed(lage());

			expect(decideCaretakerAction(lage({ money: bedarf - 1 }))).toBe('WORK');
			expect(decideCaretakerAction(lage({ money: bedarf }))).toBe('IDLE');
		});

		it('wirbt nicht und arbeitet auch nicht stattdessen', () => {
			// Wen er heiratet, entscheidet der Spieler und niemand sonst. Bis 0.6.2 ging der
			// Verwalter an dieser Stelle arbeiten, mit vollem Beutel.
			const umworben = lage({ isMarried: false, matchAvailable: true });

			expect(decideNpcAction(umworben)).toBe('COURT');
			expect(decideCaretakerAction(umworben)).toBe('IDLE');
		});

		it('spart nicht auf ein Vorhaben', () => {
			// Ein Verheirateter ohne Haus spart auf den Boden dafür. Das ist ein Plan, und
			// Pläne fasst der Spieler.
			const hausWunsch = lage({ ownsHome: false, plotPrice: 5_000, money: 200 });

			expect(decideNpcAction(hausWunsch)).toBe('WORK');
			expect(decideCaretakerAction(hausWunsch)).toBe('IDLE');
		});

		it('verdient auch das Material für ein verfallendes Haus', () => {
			const ruecklage: number = caretakerNeed(lage());
			const baufaellig = lage({
				repairNeeded: true,
				materialMissing: true,
				materialPrice: 20,
				money: ruecklage + 10
			});

			expect(caretakerNeed(baufaellig)).toBe(ruecklage + 20);
			expect(decideCaretakerAction(baufaellig)).toBe('WORK');
		});

		it('renoviert, statt auf ein Vorhaben zu sparen', () => {
			// Die Hierarchie stellt das Sparen vor das Herrichten. Für den Verwalter fällt
			// das Sparen weg — dann bleibt die Zeit fürs Haus.
			const beides = lage({
				ownsHome: false,
				plotPrice: 5_000,
				money: 200,
				repairNeeded: true,
				repairCost: 0
			});

			expect(decideNpcAction(beides)).toBe('WORK');
			expect(decideCaretakerAction(beides)).toBe('RENOVATE');
		});

		it('arbeitet für Brot, wenn er hungert und nichts hat', () => {
			const hungrig = lage({ satiety: 10, food: 0, money: 0 });

			expect(decideCaretakerAction(hungrig)).toBe('WORK');
		});

		it('erlaubt nichts, was Besitz festlegt', () => {
			// Die Liste selbst ist die Zusage: erhalten ja, entscheiden nein.
			for (const verboten of ['COURT', 'BUY_PLOT', 'BUILD', 'BUILD_HOME', 'TAKE_JOB', 'VOTE']) {
				expect(CARETAKER_ACTIONS).not.toContain(verboten);
			}
		});

		it('verkauft das Betriebslager, auch wenn die Hierarchie etwas anderes vorhat', () => {
			const wohlhabend = lage({
				money: 900,
				satiety: SATIETY_MAX,
				workAvailable: false,
				ownStockToSell: 56,
				workshopStockToSell: 56
			});

			expect(decideCaretakerAction(wohlhabend)).toBe('SELL');
			expect(decideCaretakerAction({ ...wohlhabend, money: 900, workAvailable: true })).toBe(
				'SELL'
			);
		});

		it('isst zuerst und verkauft danach', () => {
			const hungrig = lage({
				satiety: 5,
				food: 2,
				ownStockToSell: 56,
				workshopStockToSell: 56
			});

			expect(decideCaretakerAction(hungrig)).toBe('EAT');
		});

		it('trägt die eigene Habe nicht auf den Marktstand', () => {
			const mitHabe = lage({
				money: 900,
				satiety: SATIETY_MAX,
				workAvailable: false,
				ownStockToSell: 12,
				workshopStockToSell: 0
			});

			expect(decideCaretakerAction(mitHabe)).toBe('IDLE');
		});

		it('verkauft nichts ohne Kraft', () => {
			const erschoepft = lage({
				money: 900,
				satiety: SATIETY_MAX,
				workAvailable: false,
				actionPoints: 0,
				ownStockToSell: 56,
				workshopStockToSell: 56
			});

			expect(decideCaretakerAction(erschoepft)).toBe('IDLE');
		});

		it('bleibt untätig, wenn es nichts zu erhalten gibt', () => {
			const nichtsZuTun = lage({ workAvailable: false, actionPoints: 0, money: 500 });

			expect(decideCaretakerAction(nichtsZuTun)).toBe('IDLE');
		});
	});
});

describe('Leeren Grund aufgeben (0.8.0)', () => {
	const knapp = {
		money: 10,
		emptyPlots: 2,
		plotTaxDueSoon: 40,
		isAdult: true,
		satiety: SATIETY_MAX
	};

	it('gibt auf, wer die nahe Steuer nicht zahlen kann', () => {
		expect(decideNpcAction(lage(knapp))).toBe('GIVE_UP_PLOT');
	});

	it('behält den Grund, solange der Termin fern ist', () => {
		expect(decideNpcAction(lage({ ...knapp, plotTaxDueSoon: 0 }))).not.toBe('GIVE_UP_PLOT');
	});

	it('behält ihn auch, wer zahlen kann', () => {
		expect(decideNpcAction(lage({ ...knapp, money: 40 }))).not.toBe('GIVE_UP_PLOT');
	});

	it('hat ohne leeren Grund nichts aufzugeben', () => {
		expect(decideNpcAction(lage({ ...knapp, emptyPlots: 0 }))).not.toBe('GIVE_UP_PLOT');
	});

	it('überlässt das Aufgeben bei Kindern dem Erwachsenwerden', () => {
		expect(decideNpcAction(lage({ ...knapp, isAdult: false }))).not.toBe('GIVE_UP_PLOT');
	});

	it('geht nach dem Essen, nicht davor', () => {
		expect(decideNpcAction(lage({ ...knapp, satiety: 5, food: 1 }))).toBe('EAT');
	});

	it('steht dem Verwalter nicht zu', () => {
		expect(CARETAKER_ACTIONS).not.toContain('GIVE_UP_PLOT');
		expect(decideCaretakerAction(lage({ ...knapp, workAvailable: false }))).not.toBe(
			'GIVE_UP_PLOT'
		);
	});
});

describe('idleDetail (0.8.3)', () => {
	it('nennt Vorhaben und fehlende Ware, wenn ein Ziel unerreichbar ist', () => {
		const zustand = lage({
			isMarried: true,
			ownsHome: false,
			homePrice: 100,
			materialMissing: true,
			materialPrice: null,
			materialMissingItem: 'PLANK'
		});

		expect(idleDetail(zustand, 'GOAL_UNREACHABLE')).toBe('Haus: PLANK nicht am Markt');
	});

	it('nennt beim Sparen, wofür', () => {
		const zustand = lage({
			isMarried: true,
			ownsHome: false,
			homePrice: 100,
			materialMissing: true,
			materialPrice: 6
		});

		expect(idleDetail(zustand, 'STILL_SAVING')).toBe('Baumaterial fürs Haus');
		expect(savingsGoal(zustand)).toEqual({ art: 'Baumaterial fürs Haus', preis: 6 });
	});

	describe('woran die Werkstatt eines Unternehmungslustigen hängt (0.8.4)', () => {
		const unternehmend = { ...anlagen(), ambition: 100, diligence: 100 };
		const ohneWerkstatt = (werte: Partial<NpcState>): NpcState =>
			lage({
				isMarried: true,
				personality: unternehmend,
				ownsWorkshop: false,
				hasFreePlot: false,
				workshopPrice: 100,
				workshopGapName: 'Mühle',
				...werte
			});

		it('kein Bauland', () => {
			expect(idleDetail(ohneWerkstatt({ plotPrice: null }), 'CONTENT')).toBe(
				'verheiratet, Werkstatt Mühle: kein Bauland zu haben'
			);
		});

		it('Grundstück zu teuer', () => {
			expect(idleDetail(ohneWerkstatt({ plotPrice: 5000 }), 'CONTENT')).toBe(
				'verheiratet, Werkstatt Mühle: Grundstück zu teuer'
			);
		});

		it('nicht baubar und keine Rücklage für Land auf Vorrat', () => {
			const zustand = ohneWerkstatt({
				plotPrice: 40,
				workshopMaterialMissing: true,
				workshopMaterialPrice: null,
				workshopMaterialMissingItem: 'IRON',
				landReserve: Number.POSITIVE_INFINITY
			});
			expect(idleDetail(zustand, 'CONTENT')).toBe(
				'verheiratet, Werkstatt Mühle: IRON nicht am Markt, Rücklage reicht nicht für Land auf Vorrat'
			);
		});
	});

	it('sagt bei der Zufriedenheit, warum nichts vorhaben', () => {
		expect(idleDetail(lage({ isMarried: false, ownsWorkshop: true }), 'CONTENT')).toBe(
			'ledig, hat eine Werkstatt'
		);
	});
});
