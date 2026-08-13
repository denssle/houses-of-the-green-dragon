import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// adapter-node statt adapter-auto: `vite build` erzeugt unter build/ einen
		// eigenständigen Node-Server, gestartet mit `node build`. Auf dem Uberspace hält
		// ihn der Supervisor am Leben — kein `vite dev` in Produktion, kein npm-Install
		// bei jedem Neustart.
		adapter: adapter(),
		paths: {
			// Die App wird unter https://enzlor.uber.space/houses ausgeliefert; die Wurzel
			// der Domain gehört einem anderen Projekt. SvelteKit stellt diesen Präfix allen
			// Asset- und Formular-URLs voran, im Markup gehört er deshalb NICHT noch einmal
			// hingeschrieben — dort `{base}/…` aus '$app/paths' verwenden, das ist lokal
			// leer und in Produktion der Präfix.
			//
			// Auf dem Host reicht der Präfix unverändert an die App durch
			// (`uberspace web backend set /houses`, ohne --remove-prefix), weshalb
			// `event.url.pathname` in hooks.server.ts ihn ebenfalls enthält.
			base: '/houses'
		}
	}
};

export default config;
