import { type Handle, redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import type { User } from '$lib/model/user';

const noAuthURLs: string[] = ['/login', '/register', '/about', '/impressum'];


export const handle: Handle = async ({ event, resolve }): Promise<Response> => {
	const pathname: string = event.url.pathname;
	if (pathname === '/logout') {
		userService.logout(event.locals, event.cookies);
		redirect(303, '/');
	}
	const sessionCookie: string | undefined = event.cookies.get('session');
	const currentUser: User | null = userService.extractUser(sessionCookie);
	const valid: boolean = userService.validateExtractedUser(currentUser);
	if (currentUser && valid) {
		userService.login(event.locals, currentUser);
	} else {
		userService.logout(event.locals, event.cookies);
	}
	if (noAuthURLs.includes(pathname)) {
		return resolve(event);
	} else {
		if (valid) {
			return resolve(event);
		} else {
			return new Response('Redirect', { status: 303, headers: { Location: '/login' } });
		}
	}
};
