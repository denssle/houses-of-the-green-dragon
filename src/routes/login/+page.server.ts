import { fail, redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import type { Actions } from './$types';
import type { User } from '$lib/model/user';

export const actions = {
	default: async ({ cookies, request, locals }) => {
		const data = await request.formData();
		const nickname = data.get('nickname')?.toString();
		const password = data.get('password')?.toString();

		if (!nickname) {
			return fail(400, { message: 'Nickname is required' });
		}
		if (!password) {
			return fail(400, { message: 'Password is required' });
		}

		const user: User | undefined = await userService.getUserForNickAndPW(nickname, password);
		if (!user) {
			return fail(400, { message: 'Kein User für die Daten gefunden. ' });
		}

		cookies.set('session', userService.createSession(user), { path: '/' });
		await userService.login(locals, user);
		redirect(303, '/');
	}
} satisfies Actions;
