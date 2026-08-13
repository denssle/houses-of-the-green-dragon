import type { Handle } from '@sveltejs/kit';
import { base } from '$app/paths';
import * as userService from '$lib/server/service/userService';
import type { User } from '$lib/model/user';
import { startDB } from '$lib/db/db';
import { startTicker } from '$lib/server/ticker';

// Top-Level-await mit Absicht: Ohne Datenbank — oder mit gescheiterter Migration — soll
// der Server gar nicht erst hochkommen, statt scheinbar zu laufen und auf jedem Request
// zu werfen. Der Fehler propagiert hier heraus und beendet den Prozess.
await startDB();

// Erst danach: Die Welt läuft weiter, auch wenn niemand angemeldet ist — aber nur, wenn
// es eine Welt gibt.
startTicker();

const noAuthURLs: string[] = ['/login', '/register', '/about', '/impressum'];

export const handle: Handle = async ({ event, resolve }): Promise<Response> => {
	// Die App läuft unter einem Base-Pfad (siehe svelte.config.js), und der Uberspace
	// reicht ihn unverändert durch — `event.url.pathname` enthält ihn also. Einmal
	// abschneiden, damit alle Vergleiche unten mit den route-eigenen Pfaden arbeiten
	// ('/houses/login' → '/login'). Lokal ist `base` leer, die Zeile ändert dort nichts.
	const pathname: string = event.url.pathname.slice(base.length) || '/';

	// Der Bereitschaftscheck läuft vor der Sitzungsauflösung: Er soll gerade dann noch
	// antworten, wenn die Datenbank nicht erreichbar ist — die Auflösung unten würde in
	// dem Fall selbst werfen und den Check unbrauchbar machen.
	if (pathname === '/api/health') {
		return resolve(event);
	}

	// Die Identität kommt ausschließlich aus der Sitzungstabelle. Das Cookie ist ein
	// Nachschlagschlüssel ohne eigene Aussage — wer es selbst schreibt, landet hier bei
	// `undefined` und damit auf der Anmeldung.
	const currentUser: User | undefined = await userService.getCurrentUserBySessionToken(
		event.cookies.get(userService.SESSION_COOKIE)
	);

	if (currentUser) {
		await userService.login(event.locals, currentUser);
	} else {
		event.locals.currentUser = undefined;
		event.locals.currentCharacter = undefined;
	}

	if (noAuthURLs.includes(pathname) || currentUser) {
		return resolve(event);
	}
	// Bewusst `${base}` und ein absoluter Pfad: Ein Location-Header wird vom Browser
	// gegen die angefragte Ressource aufgelöst. Bei einem Datenrequest (etwa
	// /houses/dynasty/__data.json) landete ein relativer Pfad damit nicht auf der
	// Anmeldeseite. In SvelteKits eigenem `redirect()` ist das anders — dort wird gegen
	// die Request-URL aufgelöst.
	return new Response('Redirect', { status: 303, headers: { Location: `${base}/login` } });
};
