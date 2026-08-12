import type { Handle } from '@sveltejs/kit';
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
	const pathname: string = event.url.pathname;

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
	return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
};
