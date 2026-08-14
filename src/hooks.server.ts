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

/**
 * Was ohne Anmeldung offensteht.
 *
 * Die **Chronik** gehört ausdrücklich dazu: Sie ist das Schaufenster der Welt. Wer
 * hereinschaut, soll sehen, dass hier etwas geschieht — wer geboren wurde, wer gewählt
 * wurde, wo es gebrannt hat —, bevor er sich für ein Konto entscheidet. Eine Stadtchronik,
 * die man nur als Bürger lesen darf, wäre auch inhaltlich verkehrt herum.
 */
const noAuthURLs: string[] = [
	'/login',
	'/register',
	'/about',
	'/impressum',
	'/chronicle',
	// Rechtstexte müssen **vor** der Anmeldung lesbar sein: Wer wissen will, was mit
	// seinen Daten geschieht, soll das entscheiden können, bevor er welche hergibt. Eine
	// Datenschutzerklärung hinter einer Anmeldung wäre ein Widerspruch in sich.
	'/datenschutz',
	'/regeln'
];

export const handle: Handle = async ({ event, resolve }): Promise<Response> => {
	// Die App läuft unter einem Base-Pfad (siehe svelte.config.js), und der Uberspace
	// reicht ihn unverändert durch — `event.url.pathname` enthält ihn also. Einmal
	// abschneiden, damit alle Vergleiche unten mit den route-eigenen Pfaden arbeiten
	// ('/houses/login' → '/login'). Lokal ist `base` leer, die Zeile ändert dort nichts.
	const roh: string = event.url.pathname.slice(base.length) || '/';
	// Eine Client-Navigation fragt nicht die Seite an, sondern ihre Daten
	// ('/chronicle/__data.json'). Ohne diesen Schnitt gälte die Freigabe nur für den
	// ersten Aufruf über die Adresszeile, und ein Klick auf denselben Link führte zur
	// Anmeldung — ein Fehler, der sich nur im Browser zeigt, nie im curl.
	const pathname: string = roh.replace(/\/__data\.json$/, '') || '/';

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
