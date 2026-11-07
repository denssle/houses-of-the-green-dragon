import { afterEach, describe, expect, it, vi } from 'vitest';
import { herunterfahren } from '$lib/server/shutdown';

describe('herunterfahren', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('wartet auf den Takt, schließt dann die Datenbank und beendet den Prozess', async () => {
		vi.spyOn(console, 'info').mockImplementation(() => {});
		const reihenfolge: string[] = [];

		await herunterfahren('SIGTERM', {
			stopTicker: async () => void reihenfolge.push('takt'),
			closeDatabase: async () => void reihenfolge.push('datenbank'),
			exit: (code) => void reihenfolge.push(`exit ${code}`)
		});

		expect(reihenfolge).toEqual(['takt', 'datenbank', 'exit 0']);
	});

	it('beendet den Prozess auch, wenn das Aufräumen scheitert', async () => {
		vi.spyOn(console, 'info').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const exit = vi.fn();

		await herunterfahren('SIGTERM', {
			stopTicker: () => Promise.reject(new Error('kaputt')),
			closeDatabase: () => Promise.resolve(),
			exit
		});

		expect(exit).toHaveBeenCalledWith(1);
	});

	it('beendet den Prozess auch, wenn das Aufräumen hängt', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'info').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const exit = vi.fn();

		void herunterfahren('SIGTERM', {
			stopTicker: () => new Promise(() => {}),
			closeDatabase: () => Promise.resolve(),
			exit
		});
		await vi.advanceTimersByTimeAsync(60 * 1000);

		expect(exit).toHaveBeenCalledWith(1);
	});
});
