import { type Handle, redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import type { User } from '$lib/model/user';
import { startDB } from '$lib/db/db';

// Top-Level-await mit Absicht: Ohne Datenbank — oder mit gescheiterter Migration — soll
// der Server gar nicht erst hochkommen, statt scheinbar zu laufen und auf jedem Request
// zu werfen. Der Fehler propagiert hier heraus und beendet den Prozess.
await startDB();

const noAuthURLs: string[] = ['/login', '/register', '/about', '/impressum'];

export const handle: Handle = async ({ event, resolve }): Promise<Response> => {
	const pathname: string = event.url.pathname;
	if (pathname === '/logout') {
		userService.logout(event.locals, event.cookies);
		redirect(303, '/');
	}
	const extractedUser: User | null = userService.extractUser(event.cookies.get('session'));
	const userExistsAndValid: boolean = userService.userExists(extractedUser);
	if (extractedUser && userExistsAndValid) {
		userService.login(event.locals, extractedUser);
	} else {
		userService.logout(event.locals, event.cookies);
	}
	if (noAuthURLs.includes(pathname) || userExistsAndValid) {
		return resolve(event);
	} else {
		return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
	}
};
