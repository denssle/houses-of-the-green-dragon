import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Die Simulationen, die eine Stadt über Hunderte Ticks laufen lassen. Jede braucht für
 * sich mehrere Minuten (gemessen am 09.10.2026: 353, 207 und 169 Sekunden), alle übrigen
 * Dateien zusammen kaum eine. Sie bekommen deshalb ein eigenes Projekt: `npm run
 * test:unit` lässt sie aus, `npm run test:sim` nimmt nur sie, und ein schlichtes
 * `vitest run` — so ruft es die CI — prüft weiterhin beide.
 *
 * Das ist eine Umgehung, keine Abhilfe. Die Ursache ist Punkt 67: Ein Tick stellt
 * Hunderte Abfragen, weil jede NPC-Entscheidung die halbe Welt neu aufnimmt.
 */
const SIMULATIONEN = [
	'src/lib/server/service/worldComesAlive.spec.ts',
	'src/lib/server/service/selfSustaining.spec.ts',
	'src/lib/server/service/selfSustainingEconomy.spec.ts'
];

export default defineConfig({
	// sveltekit() liefert die $lib- und $app-Aliase mit. Ohne das Plugin scheitern
	// Tests, die Servermodule importieren, schon am Auflösen von '$lib/...'.
	plugins: [sveltekit()],
	test: {
		// Node statt jsdom: getestet werden die reinen Logikmodule und die
		// Datenbankschicht, keine Komponenten.
		environment: 'node',
		projects: [
			{
				extends: true,
				test: { name: 'unit', include: ['src/**/*.spec.ts'], exclude: SIMULATIONEN }
			},
			{
				extends: true,
				test: { name: 'sim', include: SIMULATIONEN }
			}
		]
	}
});
