import { LoginRateLimiter } from '$lib/server/rateLimit.logic';

/** Fünf Fehlversuche in fünfzehn Minuten je IP und Nickname. */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Der prozessweite Zähler. Ein einzelner, weil er den Zustand hält — jede Route, die
 * Anmeldeversuche zählt, muss auf dieselbe Instanz zugreifen.
 */
export const loginRateLimiter: LoginRateLimiter = new LoginRateLimiter({
	maxAttempts: LOGIN_MAX_ATTEMPTS,
	windowMs: LOGIN_RATE_LIMIT_WINDOW_MS
});
