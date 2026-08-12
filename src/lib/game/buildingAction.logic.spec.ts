import { describe, expect, it } from 'vitest';
import { build, buyPlot, work, WORK_ACTION_POINT_COST } from '$lib/game/buildingAction.logic';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';

const SCHMIEDE: BuildingTemplate = {
	optionId: 2,
	initialName: 'Schmiede',
	price: 250,
	description: 'Ein bescheidener Handwerksbetrieb',
	type: 'CRAFT',
	limited: false,
	limitedTo: 0,
	actions: ['WORK'],
	wagePerActionPoint: 3
};

const WOHNHAUS: BuildingTemplate = { ...SCHMIEDE, optionId: 1, price: 100, type: 'RESIDENCE' };
delete WOHNHAUS.wagePerActionPoint;

const RATHAUS: BuildingTemplate = {
	...WOHNHAUS,
	optionId: 0,
	price: 0,
	type: 'PUBLIC',
	limited: true,
	limitedTo: 1
};

const IN_GRUENAU = { actionPoints: 10, money: 50, regionId: 'gruenau' };

describe('Arbeiten', () => {
	it('tauscht Aktionspunkte gegen den Lohn des Betriebs', () => {
		const ergebnis = work(IN_GRUENAU, { regionId: 'gruenau', template: SCHMIEDE });

		expect(ergebnis).toEqual({
			ok: true,
			actionPoints: 10 - WORK_ACTION_POINT_COST,
			money: 53,
			earned: 3
		});
	});

	it('weist ab, wo es nichts zu verdienen gibt', () => {
		const ergebnis = work(IN_GRUENAU, { regionId: 'gruenau', template: WOHNHAUS });

		expect(ergebnis).toEqual({ ok: false, reason: 'NOT_A_WORKPLACE' });
	});

	it('weist ab, wer anderswo steht', () => {
		const ergebnis = work(IN_GRUENAU, { regionId: 'eichwald', template: SCHMIEDE });

		expect(ergebnis).toEqual({ ok: false, reason: 'WRONG_REGION' });
	});

	it('weist ab, wem die Kraft fehlt', () => {
		const erschöpft = { ...IN_GRUENAU, actionPoints: 0 };

		const ergebnis = work(erschöpft, { regionId: 'gruenau', template: SCHMIEDE });

		expect(ergebnis).toEqual({ ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' });
	});

	it('lässt den Zustand unangetastet, wenn die Handlung scheitert', () => {
		const vorher = { ...IN_GRUENAU };

		work(vorher, { regionId: 'eichwald', template: SCHMIEDE });

		expect(vorher).toEqual(IN_GRUENAU);
	});
});

describe('Bauen', () => {
	const BAUHERR = { id: 'adelbert', money: 300 };
	const EIGENES_FREIES = {
		ownerCharacterId: 'adelbert',
		regionId: 'gruenau',
		hasBuilding: false
	};

	it('zieht den Preis ab', () => {
		const ergebnis = build(BAUHERR, EIGENES_FREIES, SCHMIEDE, false);

		expect(ergebnis).toEqual({ ok: true, money: 50, spent: 250 });
	});

	it('lässt bauen, wenn das Geld genau reicht', () => {
		// Der Prototyp verbot den Kauf, sobald man genug hatte — die Prüfung war verdreht.
		const ergebnis = build({ id: 'adelbert', money: 250 }, EIGENES_FREIES, SCHMIEDE, false);

		expect(ergebnis).toEqual({ ok: true, money: 0, spent: 250 });
	});

	it('weist ab, wenn eine Münze fehlt', () => {
		const ergebnis = build({ id: 'adelbert', money: 249 }, EIGENES_FREIES, SCHMIEDE, false);

		expect(ergebnis).toEqual({ ok: false, reason: 'NOT_ENOUGH_MONEY' });
	});

	it('weist fremdes und nie vergebenes Land ab', () => {
		const fremd = { ...EIGENES_FREIES, ownerCharacterId: 'bertram' };
		const niemandes = { ...EIGENES_FREIES, ownerCharacterId: null };

		expect(build(BAUHERR, fremd, SCHMIEDE, false)).toEqual({
			ok: false,
			reason: 'PLOT_NOT_OWNED'
		});
		expect(build(BAUHERR, niemandes, SCHMIEDE, false)).toEqual({
			ok: false,
			reason: 'PLOT_NOT_OWNED'
		});
	});

	it('weist ein bebautes Grundstück ab', () => {
		const bebaut = { ...EIGENES_FREIES, hasBuilding: true };

		expect(build(BAUHERR, bebaut, SCHMIEDE, false)).toEqual({
			ok: false,
			reason: 'PLOT_ALREADY_BUILT'
		});
	});

	it('achtet die Obergrenze je Stadt', () => {
		expect(build(BAUHERR, EIGENES_FREIES, RATHAUS, true)).toEqual({
			ok: false,
			reason: 'LIMIT_REACHED'
		});
	});

	it('nennt den ersten wirklichen Grund, nicht den letzten', () => {
		// Fremdes Grundstück und zu wenig Geld zugleich: Am Besitz liegt es zuerst.
		const ergebnis = build(
			{ id: 'adelbert', money: 0 },
			{ ...EIGENES_FREIES, ownerCharacterId: 'bertram' },
			SCHMIEDE,
			false
		);

		expect(ergebnis).toEqual({ ok: false, reason: 'PLOT_NOT_OWNED' });
	});
});

describe('Grundstück kaufen', () => {
	const KAEUFER = { money: 100, regionId: 'gruenau' };
	const FREIES_LAND = { ownerCharacterId: null, ownerType: 'NONE', regionId: 'gruenau' };

	it('zieht den Preis ab', () => {
		expect(buyPlot(KAEUFER, FREIES_LAND, 40)).toEqual({ ok: true, money: 60, spent: 40 });
	});

	it('weist bereits vergebenes Land ab', () => {
		const vergeben = { ...FREIES_LAND, ownerType: 'CHARACTER', ownerCharacterId: 'bertram' };
		const städtisch = { ...FREIES_LAND, ownerType: 'CITY' };

		expect(buyPlot(KAEUFER, vergeben, 40)).toEqual({ ok: false, reason: 'PLOT_NOT_OWNED' });
		expect(buyPlot(KAEUFER, städtisch, 40)).toEqual({ ok: false, reason: 'PLOT_NOT_OWNED' });
	});

	it('weist Land in einer anderen Stadt ab', () => {
		const anderswo = { ...FREIES_LAND, regionId: 'eichwald' };

		expect(buyPlot(KAEUFER, anderswo, 40)).toEqual({ ok: false, reason: 'WRONG_REGION' });
	});

	it('weist ab, wenn das Geld nicht reicht', () => {
		expect(buyPlot({ ...KAEUFER, money: 39 }, FREIES_LAND, 40)).toEqual({
			ok: false,
			reason: 'NOT_ENOUGH_MONEY'
		});
	});
});
