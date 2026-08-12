import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	// sveltekit() liefert die $lib- und $app-Aliase mit. Ohne das Plugin scheitern
	// Tests, die Servermodule importieren, schon am Auflösen von '$lib/...'.
	plugins: [sveltekit()],
	test: {
		// Node statt jsdom: getestet werden die reinen Logikmodule und die
		// Datenbankschicht, keine Komponenten.
		environment: 'node',
		include: ['src/**/*.spec.ts']
	}
});
