import { describe, expect, it } from 'vitest';
import { buy, offer, shopKindFor, STALL_FEE, stallFeeFor } from '$lib/game/trade.logic';

const ICH = 'ich';
const MEIN_LADEN = { ownerType: 'CHARACTER', ownerCharacterId: ICH, isMarket: false };
const FREMDER_LADEN = { ownerType: 'CHARACTER', ownerCharacterId: 'wer-anders', isMarket: false };
const MARKT = { ownerType: 'CITY', ownerCharacterId: null, isMarket: true };
const RATHAUS = { ownerType: 'CITY', ownerCharacterId: null, isMarket: false };

describe('Handel', () => {
	describe('wer wo anbieten darf', () => {
		it('lässt den Eigentümer in seinem Laden anbieten', () => {
			expect(shopKindFor(MEIN_LADEN, ICH)).toBe('OWN');
			expect(stallFeeFor('OWN')).toBe(0);
		});

		it('lässt jeden am Markt anbieten — gegen Standgeld', () => {
			expect(shopKindFor(MARKT, ICH)).toBe('MARKET');
			expect(stallFeeFor('MARKET')).toBe(STALL_FEE);
		});

		it('lässt niemanden im fremden Laden anbieten', () => {
			expect(shopKindFor(FREMDER_LADEN, ICH)).toBe('FORBIDDEN');
		});

		it('macht aus dem Rathaus keinen Marktstand', () => {
			// Sonst wäre es ein Schlupfloch am Standgeld vorbei.
			expect(shopKindFor(RATHAUS, ICH)).toBe('FORBIDDEN');
		});
	});

	describe('ein Angebot aushängen', () => {
		const REICH = { money: 100 };

		it('geht im eigenen Laden ohne Gebühr', () => {
			expect(offer(REICH, 'OWN', 40, 10, 6)).toEqual({ ok: true, sellerMoney: 100, fee: 0 });
		});

		it('kostet am Markt Standgeld', () => {
			expect(offer(REICH, 'MARKET', 40, 10, 6)).toEqual({
				ok: true,
				sellerMoney: 100 - STALL_FEE,
				fee: STALL_FEE
			});
		});

		it('geht nicht über den Vorrat hinaus', () => {
			// Sonst böte man dieselben zehn Laibe an drei Ständen gleichzeitig an.
			expect(offer(REICH, 'OWN', 5, 10, 6)).toEqual({ ok: false, reason: 'NOT_IN_STOCK' });
		});

		it('weist krumme Mengen und Preise ab', () => {
			expect(offer(REICH, 'OWN', 40, 0, 6).ok).toBe(false);
			expect(offer(REICH, 'OWN', 40, 10, -1).ok).toBe(false);
			expect(offer(REICH, 'OWN', 40, 1.5, 6).ok).toBe(false);
		});

		it('scheitert am Standgeld, wenn die Kasse leer ist', () => {
			expect(offer({ money: 0 }, 'MARKET', 40, 10, 6)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
		});

		it('erlaubt den Preis null — verschenken ist auch Handel', () => {
			expect(offer(REICH, 'OWN', 40, 10, 0).ok).toBe(true);
		});
	});

	describe('kaufen', () => {
		const ANGEBOT = { sellerId: 'baecker', quantity: 40, pricePerUnit: 6 };

		it('nimmt Teilmengen', () => {
			// Wer zwei Laibe braucht, muss nicht vierzig nehmen.
			expect(buy({ id: ICH, money: 100 }, ANGEBOT, 2)).toEqual({
				ok: true,
				total: 12,
				buyerMoney: 88,
				remaining: 38
			});
		});

		it('scheitert an zu wenig Geld', () => {
			expect(buy({ id: ICH, money: 5 }, ANGEBOT, 2)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
		});

		it('scheitert an zu wenig Ware', () => {
			expect(buy({ id: ICH, money: 1000 }, ANGEBOT, 41)).toEqual({
				ok: false,
				reason: 'NOT_IN_STOCK'
			});
		});

		it('lässt niemanden bei sich selbst kaufen', () => {
			expect(buy({ id: 'baecker', money: 100 }, ANGEBOT, 1)).toEqual({
				ok: false,
				reason: 'ALREADY_OWNED'
			});
		});
	});
});
