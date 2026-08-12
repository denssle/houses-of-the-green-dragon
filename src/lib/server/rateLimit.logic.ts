/**
 * Gleitendes Zeitfenster für fehlgeschlagene Anmeldeversuche.
 *
 * Der Zustand liegt im Prozess, nicht in der Datenbank: Die App läuft als **ein**
 * Node-Prozess auf dem Uberspace, damit sieht dieser Zähler alles. Ein Neustart leert
 * ihn — verschmerzbar, weil das Fenster ohnehin kurz ist, und die Alternative wäre ein
 * Schreibzugriff je Fehlversuch, also genau die Last, die der Schutz abwehren soll.
 *
 * Die Zeit wird hereingereicht statt gelesen: So lässt sich das Ablaufen des Fensters
 * prüfen, ohne im Test zu warten.
 */
export interface RateLimiterOptions {
	/** Erlaubte Fehlversuche je Schlüssel innerhalb des Fensters. */
	maxAttempts: number;
	/** Länge des Fensters in Millisekunden. */
	windowMs: number;
	/** Obergrenze der beobachteten Schlüssel, damit der Speicher nicht wächst. */
	maxTrackedKeys?: number;
}

export class LoginRateLimiter {
	private readonly failures: Map<string, number[]> = new Map();
	private readonly maxAttempts: number;
	private readonly windowMs: number;
	private readonly maxTrackedKeys: number;

	constructor(options: RateLimiterOptions) {
		this.maxAttempts = options.maxAttempts;
		this.windowMs = options.windowMs;
		this.maxTrackedKeys = options.maxTrackedKeys ?? 10_000;
	}

	/** Gesperrt, solange im Fenster zu viele Fehlversuche stehen. */
	isBlocked(key: string, now: number = Date.now()): boolean {
		return this.recentFailures(key, now).length >= this.maxAttempts;
	}

	recordFailure(key: string, now: number = Date.now()): void {
		const jüngste: number[] = this.recentFailures(key, now);
		jüngste.push(now);
		this.failures.set(key, jüngste);
		this.pruneIfNeeded(now);
	}

	/** Nach erfolgreicher Anmeldung: Der Schlüssel fängt wieder bei null an. */
	reset(key: string): void {
		this.failures.delete(key);
	}

	/** Wie viele Sekunden noch gesperrt — für die Rückmeldung an den Anmeldenden. */
	retryAfterSeconds(key: string, now: number = Date.now()): number {
		const jüngste: number[] = this.recentFailures(key, now);
		if (jüngste.length < this.maxAttempts) return 0;
		// Sobald der älteste Fehlversuch aus dem Fenster fällt, ist wieder einer frei.
		const ältester: number = Math.min(...jüngste);
		return Math.ceil((ältester + this.windowMs - now) / 1000);
	}

	/** Fehlversuche im Fenster; räumt dabei auf, was herausgefallen ist. */
	private recentFailures(key: string, now: number): number[] {
		const zeitpunkte: number[] = this.failures.get(key) ?? [];
		const jüngste: number[] = zeitpunkte.filter((t) => now - t < this.windowMs);
		if (jüngste.length === 0) {
			this.failures.delete(key);
		} else if (jüngste.length !== zeitpunkte.length) {
			this.failures.set(key, jüngste);
		}
		return jüngste;
	}

	/** Wirft abgelaufene Schlüssel weg, sobald zu viele beobachtet werden. */
	private pruneIfNeeded(now: number): void {
		if (this.failures.size <= this.maxTrackedKeys) return;
		for (const [key, zeitpunkte] of this.failures) {
			if (zeitpunkte.every((t) => now - t >= this.windowMs)) {
				this.failures.delete(key);
			}
		}
	}
}

/**
 * Der Schlüssel aus Client-IP und Nickname.
 *
 * Hinter einem Reverse-Proxy ohne `ADDRESS_HEADER` teilen sich alle Anfragen dieselbe
 * IP — dann wirkt der Schutz nur noch je Nickname. Das ist der Fall, auf den es
 * ankommt: Er hält jemanden davon ab, ein einzelnes Konto durchzuprobieren.
 */
export function loginRateLimitKey(clientIp: string, nickname: string): string {
	return `${clientIp}:${nickname.trim().toLowerCase()}`;
}
