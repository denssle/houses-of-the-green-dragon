import { fail, redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import type { Actions } from '../../../.svelte-kit/types/src/routes/register/$types';
import type { User } from '$lib/model/user';

export const actions = {
	default: async ({ cookies, request, locals }) => {
		const data = await request.formData();
		const nickname = data.get('nickname');
		const password = data.get('password');

		if (!nickname) {
			return fail(400, { message: 'Nickname is required' });
		}
		const nicknameS: string = nickname.toString();

		if (!password) {
			return fail(400, { message: 'Password is required' });
		}
		const passwordS: string = password.toString();

		const user: User | undefined = userService.getUserForNickAndPW(nicknameS, passwordS);

		if (user) {
			cookies.set('session', userService.createSession(user), { path: '/' });
			userService.login(locals, user);
			redirect(303, '/');
		}

		return fail(400, { message: 'Kein User für die Daten gefunden. ' });
	}
} satisfies Actions;
