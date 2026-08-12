import { describe, expect, it } from 'vitest';
import { LoginRateLimiter, loginRateLimitKey } from '$lib/server/rateLimit.logic';

const FENSTER = 15 * 60 * 1000;
const jetzt = 1_000_000;

function limiter(): LoginRateLimiter {
	return new LoginRateLimiter({ maxAttempts: 3, windowMs: FENSTER });
}

describe('Anmelde-Rate-Limit', () => {
	it('lässt Versuche unterhalb der Grenze durch', () => {
		const zähler = limiter();

		zähler.recordFailure('a', jetzt);
		zähler.recordFailure('a', jetzt + 1000);

		expect(zähler.isBlocked('a', jetzt + 2000)).toBe(false);
	});

	it('sperrt beim Erreichen der Grenze', () => {
		const zähler = limiter();

		for (let i = 0; i < 3; i++) zähler.recordFailure('a', jetzt + i);

		expect(zähler.isBlocked('a', jetzt + 10)).toBe(true);
	});

	it('gibt nach Ablauf des Fensters wieder frei', () => {
		const zähler = limiter();
		for (let i = 0; i < 3; i++) zähler.recordFailure('a', jetzt + i);

		expect(zähler.isBlocked('a', jetzt + FENSTER + 1)).toBe(false);
	});

	it('rechnet ab dem ältesten Versuch, nicht ab dem jüngsten', () => {
		const zähler = limiter();
		zähler.recordFailure('a', jetzt);
		zähler.recordFailure('a', jetzt + 60_000);
		zähler.recordFailure('a', jetzt + 120_000);

		// Der älteste fällt nach FENSTER heraus; dann ist wieder ein Versuch frei.
		expect(zähler.retryAfterSeconds('a', jetzt + 120_000)).toBe((FENSTER - 120_000) / 1000);
	});

	it('nennt keine Wartezeit, solange nicht gesperrt', () => {
		const zähler = limiter();
		zähler.recordFailure('a', jetzt);

		expect(zähler.retryAfterSeconds('a', jetzt)).toBe(0);
	});

	it('hält Schlüssel auseinander', () => {
		const zähler = limiter();
		for (let i = 0; i < 3; i++) zähler.recordFailure('a', jetzt + i);

		expect(zähler.isBlocked('b', jetzt)).toBe(false);
	});

	it('setzt nach erfolgreicher Anmeldung zurück', () => {
		const zähler = limiter();
		for (let i = 0; i < 3; i++) zähler.recordFailure('a', jetzt + i);

		zähler.reset('a');

		expect(zähler.isBlocked('a', jetzt + 10)).toBe(false);
	});

	it('unterscheidet Nicknames nicht nach Schreibweise', () => {
		expect(loginRateLimitKey('1.2.3.4', ' Adelbert ')).toBe(
			loginRateLimitKey('1.2.3.4', 'adelbert')
		);
	});
});
