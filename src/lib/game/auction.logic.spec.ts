import { describe, expect, it } from 'vitest';
import {
	AUCTION_TICKS,
	award,
	type Bid,
	BID_INCREMENT,
	canBid,
	DEVELOPMENT_SHIFTS_PER_PLOT,
	developmentWageBill,
	isUnderDevelopment,
	surveyShift,
	MINIMUM_BID,
	nextBid,
	npcBidding,
	npcBidLimit,
	ranking
} from '$lib/game/auction.logic';
import { PLOT_PRICE } from '$lib/game/economy';
import { TICKS_PER_YEAR } from '$lib/game/time';

const OFFEN = { open: true, highest: null };

describe('Versteigerungen', () => {
	describe('was geboten werden darf', () => {
		it('mindestens das Mindestgebot', () => {
			const reich = { money: 1000, isHighest: false };
			expect(canBid(reich, OFFEN, MINIMUM_BID)).toEqual({ ok: true });
			// Seit 5.97 ist das eine Münze — darunter liegt nur noch die Null, und die ist kein
			// Gebot.
			expect(canBid(reich, OFFEN, MINIMUM_BID - 1)).toEqual({ ok: false, reason: 'NOTHING_TO_DO' });
		});

		it('und über dem bisherigen Gebot, mit Abstand', () => {
			// Ohne Mindestschritt endete jede Versteigerung in einem Wettlauf um einzelne
			// Münzen — gewonnen hätte, wer zuletzt hereinschaut.
			const reich = { money: 1000, isHighest: false };
			const laufend = { open: true, highest: 100 };

			expect(canBid(reich, laufend, 100 + BID_INCREMENT)).toEqual({ ok: true });
			expect(canBid(reich, laufend, 101)).toEqual({ ok: false, reason: 'BID_TOO_LOW' });
		});

		it('nur, was man hat', () => {
			expect(canBid({ money: 50, isHighest: false }, OFFEN, 100)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
		});

		it('nicht auf das eigene Höchstgebot', () => {
			// Sich selbst zu überbieten treibt nur den eigenen Preis.
			expect(canBid({ money: 1000, isHighest: true }, { open: true, highest: 100 }, 200)).toEqual({
				ok: false,
				reason: 'ALREADY_OWNED'
			});
		});

		it('nicht nach dem Zuschlag', () => {
			expect(
				canBid({ money: 1000, isHighest: false }, { open: false, highest: null }, 100)
			).toEqual({ ok: false, reason: 'NOT_FOR_SALE' });
		});
	});

	describe('die Reihenfolge', () => {
		it('ist das höchste Gebot zuerst', () => {
			const gebote: Bid[] = [
				{ bidderId: 'a', amount: 100, tick: 1 },
				{ bidderId: 'b', amount: 200, tick: 2 }
			];
			expect(ranking(gebote).map((g) => g.bidderId)).toEqual(['b', 'a']);
		});

		it('bei gleichem Betrag das ältere', () => {
			const gebote: Bid[] = [
				{ bidderId: 'spaeter', amount: 100, tick: 9 },
				{ bidderId: 'zuerst', amount: 100, tick: 1 }
			];
			expect(ranking(gebote).map((g) => g.bidderId)).toEqual(['zuerst', 'spaeter']);
		});

		it('zählt je Bieter nur sein höchstes', () => {
			// Sonst stünde derselbe Mann dreimal in der Reihe und rückte hinter sich selbst
			// nach.
			const gebote: Bid[] = [
				{ bidderId: 'a', amount: 100, tick: 1 },
				{ bidderId: 'a', amount: 300, tick: 3 },
				{ bidderId: 'b', amount: 200, tick: 2 }
			];
			expect(ranking(gebote)).toHaveLength(2);
			expect(ranking(gebote)[0]).toEqual({ bidderId: 'a', amount: 300, tick: 3 });
		});
	});

	describe('der Zuschlag', () => {
		const gebote: Bid[] = [
			{ bidderId: 'reich', amount: 300, tick: 3 },
			{ bidderId: 'solide', amount: 200, tick: 2 }
		];

		it('geht an das höchste Gebot', () => {
			const kassen = new Map([
				['reich', 1000],
				['solide', 500]
			]);
			expect(award(gebote, kassen)?.bidderId).toBe('reich');
		});

		/**
		 * Der Kern der Bauart: Es gibt keine Reservierung. Wer bis zum Zuschlag sein Geld
		 * ausgibt, verliert den Zuschlag — nicht mehr und nicht weniger. Dieselbe Rechnung
		 * wie beim Nachrücken ins Amt (4.7a).
		 */
		it('übergeht, wer nicht mehr zahlen kann', () => {
			const kassen = new Map([
				['reich', 10],
				['solide', 500]
			]);
			expect(award(gebote, kassen)?.bidderId).toBe('solide');
		});

		it('bleibt aus, wenn niemand zahlen kann', () => {
			expect(award(gebote, new Map([['reich', 0]]))).toBeUndefined();
			expect(award([], new Map())).toBeUndefined();
		});
	});

	describe('wie weit ein NPC geht (5.97, Punkt 113)', () => {
		it('hängt an seinem Nutzen, nicht nur an seinem Geld', () => {
			// Bis 5.97 bot jeder ein Viertel — und die Bäckerei ging an den Reichsten statt
			// an den Bäcker.
			expect(npcBidLimit(200, 'HIGH')).toBe(100);
			expect(npcBidLimit(200, 'MEDIUM')).toBe(50);
			expect(npcBidLimit(200, 'LOW')).toBe(10);
		});

		it('und nie über das, was er hat', () => {
			expect(npcBidLimit(0, 'HIGH')).toBe(0);
			expect(npcBidLimit(-5, 'HIGH')).toBe(0);
		});
	});

	describe('wie die NPCs eine Versteigerung ausmachen (5.97, Punkt 113)', () => {
		const gebot = (bidderId: string, amount: number): Bid => ({ bidderId, amount, tick: 0 });

		it('gewinnt, wer am meisten will — nicht, wer zuletzt in der Reihe steht', () => {
			// **Der Kern.** Die Reihenfolge der Liste darf nichts entscheiden.
			const wahl = npcBidding(
				[
					{ bidderId: 'reich-aber-lau', limit: 30 },
					{ bidderId: 'baecker', limit: 90 },
					{ bidderId: 'nachbar', limit: 12 }
				],
				null
			);
			expect(wahl?.bidderId).toBe('baecker');
		});

		it('und zahlt einen Schritt über dem Zweiten, nicht sein Limit', () => {
			// So endet eine echte Steigerung: Bei 35 steigt der Zweite aus.
			expect(
				npcBidding(
					[
						{ bidderId: 'a', limit: 90 },
						{ bidderId: 'b', limit: 30 }
					],
					null
				)
			).toEqual({ bidderId: 'a', amount: 30 + BID_INCREMENT });
		});

		it('bekommt es für eine Münze, wenn er allein ist', () => {
			// Entschieden so: Den Preis macht die Konkurrenz, keine Schwelle.
			expect(npcBidding([{ bidderId: 'a', limit: 90 }], null)).toEqual({
				bidderId: 'a',
				amount: MINIMUM_BID
			});
		});

		it('geht nie über sein Limit, auch bei Gleichstand', () => {
			const wahl = npcBidding(
				[
					{ bidderId: 'a', limit: 40 },
					{ bidderId: 'b', limit: 40 }
				],
				null
			);
			expect(wahl?.amount).toBe(40);
		});

		it('überbietet ein stehendes Gebot, wenn er kann', () => {
			expect(npcBidding([{ bidderId: 'a', limit: 90 }], gebot('spieler', 50))).toEqual({
				bidderId: 'a',
				amount: 50 + BID_INCREMENT
			});
		});

		it('und lässt es stehen, wenn er nicht kann', () => {
			expect(npcBidding([{ bidderId: 'a', limit: 52 }], gebot('spieler', 50))).toBeUndefined();
		});

		it('überbietet sich nicht selbst', () => {
			// Liegt er vorn und will niemand mehr, bleibt sein Gebot, wie es ist.
			expect(
				npcBidding(
					[
						{ bidderId: 'a', limit: 90 },
						{ bidderId: 'b', limit: 10 }
					],
					gebot('a', 20)
				)
			).toBeUndefined();
		});

		it('erhöht aber, wenn ihn ein anderer sonst überböte', () => {
			expect(
				npcBidding(
					[
						{ bidderId: 'a', limit: 90 },
						{ bidderId: 'b', limit: 60 }
					],
					gebot('a', 20)
				)
			).toEqual({ bidderId: 'a', amount: 60 + BID_INCREMENT });
		});

		it('bietet nichts, wenn keiner etwas will', () => {
			expect(npcBidding([], null)).toBeUndefined();
			expect(npcBidding([{ bidderId: 'a', limit: 0 }], null)).toBeUndefined();
		});
	});

	describe('die Erschließung als Arbeit (5.92, Punkt 102)', () => {
		const arbeiter = { actionPoints: 4, money: 10, buildingSkill: 0 };

		it('zahlt den Tagelohn aus der Stadtkasse und bringt die Fläche voran', () => {
			const ergebnis = surveyShift(arbeiter, { treasury: 100 }, 0);

			expect(ergebnis.ok).toBe(true);
			if (!ergebnis.ok) return;
			// Was der Arbeiter bekommt, fehlt der Kasse — und nichts davon verschwindet.
			expect(ergebnis.money - arbeiter.money).toBe(100 - ergebnis.treasury);
			expect(ergebnis.earned).toBeGreaterThan(0);
			expect(ergebnis.shifts).toBe(1);
			expect(ergebnis.actionPoints).toBe(3);
		});

		it('findet nicht statt, wenn die Stadt nicht zahlen kann', () => {
			// Dieselbe Regel wie beim privaten Auftraggeber (Punkt 106): Wer nicht zahlen
			// kann, dessen Schicht findet nicht statt.
			expect(surveyShift(arbeiter, { treasury: 0 }, 0)).toEqual({
				ok: false,
				reason: 'EMPLOYER_BROKE'
			});
		});

		it('hört auf, wenn die Fläche fertig ist', () => {
			expect(surveyShift(arbeiter, { treasury: 100 }, DEVELOPMENT_SHIFTS_PER_PLOT)).toEqual({
				ok: false,
				reason: 'NOTHING_TO_DO'
			});
		});

		it('braucht einen Aktionspunkt', () => {
			expect(surveyShift({ ...arbeiter, actionPoints: 0 }, { treasury: 100 }, 0)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_ACTION_POINTS'
			});
		});

		it('unterscheidet die angefangene Baustelle vom fertigen Grundstück', () => {
			// **Die Null ist der Anfang eines Baus, nicht sein Fehlen.** Wer die Zahl
			// vergleicht statt zu fragen, hält jede frische Baustelle für fertiges Land.
			expect(isUnderDevelopment({ developmentShifts: 0 })).toBe(true);
			expect(isUnderDevelopment({ developmentShifts: null })).toBe(false);
		});
	});

	describe('die Zahlen', () => {
		it('lassen das Erschließen ein Wagnis bleiben', () => {
			// Teurer als der alte Festpreis: Ob es sich lohnt, entscheidet die Knappheit
			// und nicht die Tabelle. Seit 5.92 steht dort kein Preis mehr, sondern die
			// Lohnsumme — dieselbe Zahl, nur in anderen Händen.
			expect(developmentWageBill(1)).toBeGreaterThan(PLOT_PRICE);
		});

		it('beginnen bei einer Münze (5.97)', () => {
			expect(MINIMUM_BID).toBe(1);
		});

		it('geben einer Versteigerung einen Realtag', () => {
			expect(AUCTION_TICKS).toBe(TICKS_PER_YEAR / 2);
			expect(nextBid(null)).toBe(MINIMUM_BID);
		});
	});
});
