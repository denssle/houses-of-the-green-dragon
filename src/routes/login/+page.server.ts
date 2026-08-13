import { base } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import { loginRateLimiter } from '$lib/server/service/loginRateLimit';
import { loginRateLimitKey } from '$lib/server/rateLimit.logic';
import type { Actions } from './$types';
import type { User } from '$lib/model/user';

export const actions = {
	default: async ({ cookies, request, locals, getClientAddress }) => {
		const data = await request.formData();
		const nickname = data.get('nickname')?.toString();
		const password = data.get('password')?.toString();

		if (!nickname) {
			return fail(400, { message: 'Nickname ist erforderlich' });
		}
		if (!password) {
			return fail(400, { message: 'Passwort ist erforderlich' });
		}

		const key: string = loginRateLimitKey(getClientAddress(), nickname);
		if (loginRateLimiter.isBlocked(key)) {
			const minuten: number = Math.ceil(loginRateLimiter.retryAfterSeconds(key) / 60);
			return fail(429, {
				message: `Zu viele Fehlversuche. Bitte in ${minuten} Minuten erneut versuchen.`
			});
		}

		const user: User | undefined = await userService.loginWithCredentials(nickname, password);
		if (!user) {
			loginRateLimiter.recordFailure(key);
			// Bewusst dieselbe Meldung für falschen Namen und falsches Passwort: Sonst
			// verrät die Anmeldemaske, welche Nicknames vergeben sind.
			return fail(400, { message: 'Nickname oder Passwort stimmt nicht.' });
		}

		loginRateLimiter.reset(key);
		await userService.startSession(user, cookies);
		await userService.login(locals, user);
		redirect(303, `${base}/`);
	}
} satisfies Actions;
