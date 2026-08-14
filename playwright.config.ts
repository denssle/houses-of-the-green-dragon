import { defineConfig, devices } from '@playwright/test';

/**
 * Der Rundlauf durch die Anwendung (Phase 5.7).
 *
 * **Warum es ihn braucht, obwohl 620 Unit-Tests laufen:** Die decken die Regeln ab und
 * hätten keinen der Fehler gefunden, die beim Durchspielen von Hand auffielen — eine Route,
 * die ihren Parameter nicht liest, ein Bauformular, das Häuser anbot, die es nicht anbieten
 * durfte, ein doppelter Seitenkopf. Diese Prüfung klickt.
 *
 * **`PLAYWRIGHT=true` schaltet auf SQLite im Arbeitsspeicher** (siehe `detectMode`). Jeder
 * Lauf beginnt damit in einer frischen Welt und lässt die Entwicklungsdatenbank unter
 * `.data/` unangetastet — sonst wären die Tests von dem abhängig, was beim letzten Spielen
 * übrig blieb.
 */
export default defineConfig({
	testDir: 'e2e',
	// Ein Lauf reicht: Die Prüfungen sind eine zusammenhängende Geschichte und keine
	// Sammlung unabhängiger Fälle, die sich verteilen ließen.
	workers: 1,
	fullyParallel: false,
	// In der CI keine stillen Wiederholungen: Ein Test, der beim zweiten Mal durchgeht, hat
	// ein Problem, das man sehen will.
	retries: 0,
	forbidOnly: Boolean(process.env.CI),
	reporter: process.env.CI ? 'github' : 'list',

	use: {
		// Ohne den Unterpfad: Ein absoluter Pfad in `goto` **ersetzt** den Pfad der
		// baseURL, statt ihn zu ergänzen — `/register` landete damit neben der App. Der
		// Unterpfad steht deshalb im Test, wo man ihn sieht.
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure'
	},

	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

	/**
	 * Gegen das **gebaute** Artefakt, nicht gegen den Entwicklungsserver: Der Unterschied
	 * zwischen beiden hat dieses Projekt schon einmal Deploy-Fehler gekostet (siehe 2.4),
	 * und ein Rundlauf, der nur `vite dev` prüft, ginge an genau der Stelle vorbei.
	 */
	webServer: {
		command: 'npm run build && node build',
		url: 'http://localhost:4173/houses/api/health',
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			PLAYWRIGHT: 'true',
			PORT: '4173',
			ORIGIN: 'http://localhost:4173'
		}
	}
});
