import { describe, expect, it } from 'vitest';
import {
	CONDITION_MAX,
	missingToBuild,
	currentCondition,
	isRuin,
	outputFactor,
	purchase,
	renovate,
	RENOVATION_ACTION_POINT_COST,
	RENOVATION_PER_ACTION,
	CONDITION_PER_ACTION_POINT,
	residentsAt,
	restAt,
	storageAt,
	upgrade,
	upgradeMaterial,
	wageAt,
	YEARS_TO_RUIN
} from '$lib/game/building.logic';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import { yearsToTicks } from '$lib/game/time';

const WOHNHAUS: BuildingTemplate = {
	optionId: 1,
	initialName: 'Wohnhaus',
	description: 'Ein einfaches Wohnhaus',
	type: 'RESIDENCE',
	limited: false,
	limitedTo: 0,

	levels: [
		{ price: 100, name: 'Kate', residents: 4, restActionPoints: 4, storage: 20 },
		{ price: 150, name: 'Haus', residents: 6, restActionPoints: 10, storage: 40 },
		{ price: 400, name: 'Großhaus', residents: 9, restActionPoints: 18, storage: 80 }
	]
};

const SCHMIEDE: BuildingTemplate = {
	...WOHNHAUS,
	optionId: 2,
	type: 'CRAFT',

	levels: [
		{ price: 250, name: 'Schmiede', wagePerActionPoint: 3 },
		{ price: 400, name: 'Werkstatt', wagePerActionPoint: 5 }
	]
};

describe('Gebäude', () => {
	describe('der Verfall', () => {
		it('rührt sich nicht ohne verstrichene Zeit', () => {
			expect(currentCondition(100, 500, 500)).toBe(100);
		});

		it('trifft nach der vorgesehenen Zeit genau die Ruine', () => {
			const spaeter: number = yearsToTicks(YEARS_TO_RUIN);

			expect(currentCondition(CONDITION_MAX, 0, spaeter)).toBe(0);
			expect(isRuin(currentCondition(CONDITION_MAX, 0, spaeter))).toBe(true);
		});

		it('steht nach der Hälfte der Zeit bei der Hälfte', () => {
			const halb: number = yearsToTicks(YEARS_TO_RUIN / 2);

			expect(currentCondition(CONDITION_MAX, 0, halb)).toBeCloseTo(50, 8);
		});

		/**
		 * Wie beim Verfall der Zuneigung: Wer oft nachsieht, darf nichts anderes
		 * vorfinden. Linear heißt hier zusätzlich, dass es ein Ende gibt — eine Kurve,
		 * die sich der Null nur nähert, gäbe nie Bauland zurück.
		 */
		it('ergibt über viele Schritte dasselbe wie über einen', () => {
			const gesamt: number = yearsToTicks(7);
			const inEinem: number = currentCondition(CONDITION_MAX, 0, gesamt);

			let schrittweise = CONDITION_MAX;
			for (let i = 0; i < gesamt; i++) {
				schrittweise = currentCondition(schrittweise, 0, 1);
			}

			expect(schrittweise).toBeCloseTo(inEinem, 8);
		});

		it('fällt nicht unter null', () => {
			expect(currentCondition(10, 0, yearsToTicks(100))).toBe(0);
		});
	});

	describe('was der Zustand bewirkt', () => {
		it('mindert den Lohn linear', () => {
			expect(wageAt(SCHMIEDE, 1, 100)).toBe(3);
			expect(wageAt(SCHMIEDE, 1, 50)).toBe(1);
			expect(outputFactor(50)).toBe(0.5);
		});

		it('lässt eine Schicht nie ganz umsonst sein', () => {
			// Ein Aktionspunkt, der nichts einbringt, wäre ein Verlust ohne Ansage.
			expect(wageAt(SCHMIEDE, 1, 1)).toBe(1);
		});

		it('macht aus einem Wohnhaus keinen Arbeitsplatz', () => {
			expect(wageAt(WOHNHAUS, 1, 100)).toBe(0);
		});

		it('mindert den Kraftvorrat, den das Dach trägt', () => {
			// Ein Großhaus, durch dessen Dach es regnet, ist keine bessere Bleibe als eine
			// gepflegte Kate — das ist der zweite Grund zu renovieren, und er hat nichts
			// mit Geld verdienen zu tun.
			expect(restAt(WOHNHAUS, 3, 100)).toBe(18);
			expect(restAt(WOHNHAUS, 3, 50)).toBe(9);
			expect(restAt(WOHNHAUS, 3, 0)).toBe(0);
		});

		it('trägt in einer Werkstatt gar keinen Vorrat', () => {
			// Wer in seiner Schmiede schläft, schläft nicht besser — dort wohnt niemand.
			expect(restAt(SCHMIEDE, 1, 100)).toBe(0);
		});

		it('mindert auch das Inventar, das das Dach hergibt', () => {
			// Was durch ein undichtes Dach regnet, verdirbt — derselbe Faktor wie beim
			// Kraftvorrat und beim Lohn (5.33).
			expect(storageAt(WOHNHAUS, 3, 100)).toBe(80);
			expect(storageAt(WOHNHAUS, 3, 50)).toBe(40);
			expect(storageAt(WOHNHAUS, 1, 100)).toBe(20);
			// Eine Werkstatt ist keine Bleibe und gibt deshalb auch keine Truhe dazu.
			expect(storageAt(SCHMIEDE, 1, 100)).toBe(0);
		});

		it('lässt den Wohnraum unberührt', () => {
			// Ein verfallenes Haus wärmt schlecht — aber es hat dieselbe Zahl Betten.
			expect(residentsAt(WOHNHAUS, 1)).toBe(4);
			expect(residentsAt(WOHNHAUS, 3)).toBe(9);
			expect(residentsAt(SCHMIEDE, 1)).toBe(0);
		});

		it('hebt den Kraftvorrat mit jeder Ausbaustufe', () => {
			// Der Sinn des Ausbaus für den, der keine Kinder will: nicht mehr Betten,
			// sondern mehr Kraft, die sich ansammeln darf, ehe Stunden ungenutzt verfallen.
			expect(restAt(WOHNHAUS, 1, 100)).toBe(4);
			expect(restAt(WOHNHAUS, 2, 100)).toBe(10);
			expect(restAt(WOHNHAUS, 3, 100)).toBe(18);
		});
	});

	describe('renovieren', () => {
		it('bringt ein Stück voran und kostet keine Münze', () => {
			// **Der Kern von 5.78** (Punkte 74 und 102): Bis dahin standen hier achtzig
			// Münzen weniger im Beutel, die niemand bekam — und das Haus war mit einer
			// einzigen Handlung wieder wie neu.
			const ergebnis = renovate({ actionPoints: 48 }, 60, 'SPRING');

			expect(ergebnis).toEqual({
				ok: true,
				condition: 60 + RENOVATION_PER_ACTION,
				repaired: RENOVATION_PER_ACTION,
				actionPoints: 48 - RENOVATION_ACTION_POINT_COST
			});
		});

		it('hält den Satz aller Bauarbeit ein: fünf Punkte je Aktionspunkt', () => {
			// Dieselbe Zahl wie beim Rohbau und beim Tagelöhner. Wäre eine der drei Arten
			// zu bauen günstiger, käme von den anderen keine mehr vor — und der Auftrag
			// aus 5.27 wäre erfüllt und tot zugleich.
			expect(RENOVATION_PER_ACTION).toBe(RENOVATION_ACTION_POINT_COST * CONDITION_PER_ACTION_POINT);
		});

		it('richtet nie über die volle Güte hinaus', () => {
			const fast = renovate({ actionPoints: 48 }, 95, 'SPRING');

			expect(fast).toMatchObject({ ok: true, condition: CONDITION_MAX, repaired: 5 });
		});

		it('kommt im Winter langsamer voran', () => {
			const sommer = renovate({ actionPoints: 48 }, 20, 'SUMMER');
			const winter = renovate({ actionPoints: 48 }, 20, 'WINTER');

			// **Der Frost ist geblieben, nur die Währung hat gewechselt** (5.78): Er
			// verteuerte den Bau, jetzt verzögert er ihn. Ohne diese Prüfung hätte der
			// Wegfall des Münzpreises eine Regel der Welt stillschweigend abgeschafft.
			expect(sommer.ok && winter.ok && winter.repaired < sommer.repaired).toBe(true);
		});

		it('weist ein Haus in bestem Zustand ab', () => {
			expect(renovate({ actionPoints: 48 }, CONDITION_MAX, 'SPRING')).toEqual({
				ok: false,
				reason: 'NOTHING_TO_DO'
			});
		});

		it('scheitert an der Kraft — und nur noch daran', () => {
			// Der Mittellose renoviert seit 5.78; er zahlt in Arbeit. Vorher scheiterte er
			// hier an `NOT_ENOUGH_MONEY`.
			expect(renovate({ actionPoints: 1 }, 50, 'SPRING')).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_ACTION_POINTS'
			});
			expect(renovate({ actionPoints: RENOVATION_ACTION_POINT_COST }, 50, 'SPRING').ok).toBe(true);
		});
	});

	describe('ausbauen', () => {
		it('hebt die Stufe und verlangt dafür keine Münze', () => {
			// **Der Kern von 5.80** (Punkt 102): Bis dahin kostete der Ausbau 150 Münzen,
			// die niemand bekam — der letzte Posten, an dem ein Bürger Geld ins Nichts
			// zahlte. Und er war der einzige Bau ohne Material.
			expect(upgrade(WOHNHAUS, 1)).toEqual({ ok: true, level: 2 });
		});

		it('verlangt stattdessen Material, wie jeder andere Bau', () => {
			const bedarf = upgradeMaterial(WOHNHAUS, 1);

			expect(bedarf.length).toBeGreaterThan(0);
			// Ein Wohnhaus ist Fachwerk: Bretter, keine Quader (siehe `materialFor`).
			expect(bedarf.every((posten) => posten.itemId === 'PLANK')).toBe(true);
			expect(bedarf[0].quantity).toBeGreaterThan(0);
		});

		it('endet bei der höchsten Stufe', () => {
			expect(upgrade(WOHNHAUS, 3)).toEqual({ ok: false, reason: 'MAX_LEVEL' });
			expect(upgrade(SCHMIEDE, 2)).toEqual({ ok: false, reason: 'MAX_LEVEL' });
			// Und dann gibt es auch nichts zu beschaffen.
			expect(upgradeMaterial(WOHNHAUS, 3)).toEqual([]);
		});
	});

	describe('kaufen', () => {
		it('geht, wenn ein Preis dranhängt und das Geld reicht', () => {
			const ergebnis = purchase(
				{ id: 'ich', money: 500 },
				{ ownerId: 'jemand', forSalePrice: 300 }
			);

			expect(ergebnis).toEqual({ ok: true, buyerMoney: 200, price: 300 });
		});

		it('geht nicht ohne Preisschild', () => {
			expect(
				purchase({ id: 'ich', money: 500 }, { ownerId: 'jemand', forSalePrice: null })
			).toEqual({ ok: false, reason: 'NOT_FOR_SALE' });
		});

		it('lässt niemanden von sich selbst kaufen', () => {
			expect(purchase({ id: 'ich', money: 500 }, { ownerId: 'ich', forSalePrice: 300 })).toEqual({
				ok: false,
				reason: 'ALREADY_OWNED'
			});
		});
	});
});

describe('was zum Bauen fehlt', () => {
	/**
	 * **Der Grund gehört neben den Knopf** (Punkt 59). Auf der Bauseite stand jedes Gebäude
	 * mit aktivem Knopf, auch wenn das Geld um das Fünffache fehlte; erst der Klick sagte
	 * es. Die Meldungen selbst sind gut, sie kamen nur zu spät.
	 */
	const bedarf = [
		{ itemId: 'PLANK', quantity: 4 },
		{ itemId: 'CLAY', quantity: 2 }
	];

	it('sagt nichts, wenn alles da ist', () => {
		expect(
			missingToBuild(100, bedarf, {
				money: 100,
				stock: [
					{ itemId: 'PLANK', quantity: 4 },
					{ itemId: 'CLAY', quantity: 9 }
				]
			})
		).toEqual([]);
	});

	it('nennt zuerst das Geld, dann das Material', () => {
		// In der Reihenfolge, in der man es beschafft — und das Geld ist die Bedingung für
		// alles Weitere.
		const fehlt = missingToBuild(100, bedarf, {
			money: 80,
			stock: [{ itemId: 'PLANK', quantity: 1 }]
		});

		expect(fehlt).toEqual([
			{ itemId: 'COIN', quantity: 20 },
			{ itemId: 'PLANK', quantity: 3 },
			{ itemId: 'CLAY', quantity: 2 }
		]);
	});

	it('zählt nur die Fehlmenge, nicht den ganzen Bedarf', () => {
		// Wer drei von vier Brettern hat, dem fehlt eines — nicht vier.
		const fehlt = missingToBuild(0, bedarf, {
			money: 0,
			stock: [
				{ itemId: 'PLANK', quantity: 3 },
				{ itemId: 'CLAY', quantity: 2 }
			]
		});

		expect(fehlt).toEqual([{ itemId: 'PLANK', quantity: 1 }]);
	});
});
