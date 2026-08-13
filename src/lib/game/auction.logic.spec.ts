import { describe, expect, it } from 'vitest';
import {
	AUCTION_TICKS,
	award,
	type Bid,
	BID_INCREMENT,
	canBid,
	DEVELOPMENT_COST_PER_PLOT,
	MINIMUM_BID,
	nextBid,
	npcBid,
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
			expect(canBid(reich, OFFEN, MINIMUM_BID - 1)).toEqual({ ok: false, reason: 'BID_TOO_LOW' });
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

	describe('was ein NPC bietet', () => {
		it('ein Viertel seines Vermögens, aber nur das Nötige', () => {
			// Er bietet den Mindestschritt, nicht sein Maximum: Sonst zöge ein einzelner
			// reicher NPC jeden Preis sofort an die Decke.
			expect(npcBid(1000, null)).toBe(MINIMUM_BID);
			expect(npcBid(1000, 100)).toBe(100 + BID_INCREMENT);
		});

		it('nichts, wenn es zu teuer wird', () => {
			// Ein NPC, der alles auf ein Grundstück wirft, verhungert daneben.
			expect(npcBid(100, 500)).toBeUndefined();
			expect(npcBid(0, null)).toBeUndefined();
		});
	});

	describe('die Zahlen', () => {
		it('lassen das Erschließen ein Wagnis bleiben', () => {
			// Teurer als der alte Festpreis: Ob es sich lohnt, entscheidet die Knappheit
			// und nicht die Tabelle.
			expect(DEVELOPMENT_COST_PER_PLOT).toBeGreaterThan(PLOT_PRICE);
			expect(MINIMUM_BID).toBe(PLOT_PRICE);
		});

		it('geben einer Versteigerung einen Realtag', () => {
			expect(AUCTION_TICKS).toBe(TICKS_PER_YEAR / 2);
			expect(nextBid(null)).toBe(MINIMUM_BID);
		});
	});
});
