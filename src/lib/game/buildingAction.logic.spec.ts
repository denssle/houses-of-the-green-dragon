import { describe, expect, it } from 'vitest';
import { build, buyPlot, repairForHire } from '$lib/game/buildingAction.logic';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';

const SCHMIEDE: BuildingTemplate = {
	optionId: 2,
	initialName: 'Schmiede',
	description: 'Ein bescheidener Handwerksbetrieb',
	type: 'CRAFT',
	limited: false,
	limitedTo: 0,

	levels: [{ price: 250, name: 'Schmiede', wagePerActionPoint: 3 }]
};

const WOHNHAUS: BuildingTemplate = {
	...SCHMIEDE,
	optionId: 1,
	type: 'RESIDENCE',
	levels: [{ price: 100, name: 'Kate', residents: 4 }]
};

const RATHAUS: BuildingTemplate = {
	...WOHNHAUS,
	optionId: 0,
	type: 'PUBLIC',
	limited: true,
	limitedTo: 1,
	levels: [{ price: 0, name: 'Rathaus' }]
};

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

/**
 * Instandsetzung gegen Lohn (5.26) — der Ersatz für die Tagelöhnerei.
 *
 * Die bestand darin, in die städtische Schmiede zu gehen und drei Münzen mitzunehmen;
 * niemand bekam etwas dafür. Jetzt hinterlässt die Arbeit etwas: Wer hier schuftet, hebt
 * den Zustand des Hauses, und der Eigentümer zahlt für einen Gegenwert.
 */
describe('Für Lohn herrichten', () => {
	const ARBEITER = { actionPoints: 10, money: 50, buildingSkill: 0 };
	const STADTKASSE = { money: 1000 };

	it('hebt den Zustand und zahlt dafür', () => {
		const ergebnis = repairForHire(ARBEITER, STADTKASSE, 60);

		expect(ergebnis.ok && ergebnis.condition).toBe(65);
		expect(ergebnis.ok && ergebnis.earned).toBe(3);
		// Die Probe: Was der eine bekommt, fehlt dem anderen.
		expect(ergebnis.ok && ergebnis.money + ergebnis.employerMoney).toBe(50 + 1000);
	});

	it('richtet nie über die volle Güte hinaus', () => {
		const ergebnis = repairForHire(ARBEITER, STADTKASSE, 98);

		expect(ergebnis.ok && ergebnis.condition).toBe(100);
	});

	it('weist ab, wo nichts zu richten ist', () => {
		expect(repairForHire(ARBEITER, STADTKASSE, 100)).toEqual({
			ok: false,
			reason: 'NOTHING_TO_DO'
		});
	});

	it('weist ab, wo niemand zahlen kann', () => {
		// **Der Kern von Punkt 66:** Auch diese Arbeit kommt nicht aus dem Nichts. Eine
		// Stadt mit leerer Kasse kann ihre Mauern nicht richten lassen.
		expect(repairForHire(ARBEITER, { money: 2 }, 60)).toEqual({
			ok: false,
			reason: 'EMPLOYER_BROKE'
		});
	});

	it('zahlt dem Könner mehr', () => {
		// Wer bauen kann, schafft mehr — und bekommt mehr. Anders als beim Renovieren auf
		// eigene Rechnung senkt Können hier nicht die Kosten, sondern hebt den Verdienst.
		const meister = repairForHire({ ...ARBEITER, buildingSkill: 10 }, STADTKASSE, 60);

		expect(meister.ok && meister.earned).toBeGreaterThan(3);
	});
});

/**
 * Der private Auftrag (5.27, Punkt 74).
 *
 * Bei städtischen Bauten ist der Lohn der Tagelohn — den setzt niemand aus, er ist der
 * Satz, den die Stadt für einen Handschlag zahlt. Bei einem privaten Auftrag steht dort,
 * was der Eigentümer geboten hat.
 */
describe('Der ausgeschriebene Lohn', () => {
	const ARBEITER = { actionPoints: 10, money: 50, buildingSkill: 0 };

	it('zahlt, was der Auftraggeber bietet', () => {
		const ergebnis = repairForHire(ARBEITER, { money: 1000 }, 60, 9);

		expect(ergebnis.ok && ergebnis.earned).toBe(9);
	});

	it('nimmt ohne Angabe den Tagelohn', () => {
		// Der Satz der Stadt — sie schreibt ihre Instandsetzung nicht aus, sie zahlt sie.
		const ergebnis = repairForHire(ARBEITER, { money: 1000 }, 60);

		expect(ergebnis.ok && ergebnis.earned).toBe(3);
	});

	it('weist ab, wenn der Auftraggeber sein Angebot nicht deckt', () => {
		// Ein Auftrag über zwanzig Münzen, aber nur zehn in der Kasse: Wer nicht zahlen
		// kann, bei dem wird nicht gearbeitet.
		expect(repairForHire(ARBEITER, { money: 10 }, 60, 20)).toEqual({
			ok: false,
			reason: 'EMPLOYER_BROKE'
		});
	});
});
