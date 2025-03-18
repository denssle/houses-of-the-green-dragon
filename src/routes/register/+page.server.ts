import { fail, redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import type { Actions } from './$types';

export const actions = {
	default: async ({ cookies, request }) => {
		const data = await request.formData();
		const nickname = data.get('nickname');
		const email: string | undefined = data.get('email')?.toString();
		const password = data.get('password');

		if (!nickname) {
			return fail(400, { success: false, message: 'Nickname is required' });
		}

		const nicknameS: string = nickname.toString();

		if (userService.nickNameAlreadyUsed(nicknameS)) {
			return fail(400, { success: false, message: 'Nickname is already used' });
		}

		if (email && userService.emailAlreadyUsed(email.toString())) {
			return fail(400, { success: false, message: 'Email is already used' });
		}

		if (!password) {
			return fail(400, { success: false, message: 'Password is required' });
		}

		cookies.set(
			'session',
			userService.createSession(userService.createUser(nicknameS, email, password.toString())!),
			{ path: '/' }
		);
		redirect(303, '/');
	}
} satisfies Actions;
