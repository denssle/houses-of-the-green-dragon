import { fail, redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import * as dynastyService from '$lib/server/service/dynastyService';
import type { Actions } from './$types';
import type { User } from '$lib/model/user';

export const actions = {
	default: async ({ cookies, request }) => {
		const data = await request.formData();
		const nickname = data.get('nickname');
		const email: string | undefined = data.get('email')?.toString();
		const password = data.get('password');
		const password2 = data.get('password2');
		const dynasty = data.get('dynasty');

		if (!nickname) {
			return fail(400, { message: 'Nickname ist erforderlich' });
		}

		const nicknameS: string = nickname.toString();

		if (userService.nickNameAlreadyUsed(nicknameS)) {
			return fail(400, { message: 'Der Nickname ist bereits vergeben' });
		}

		if (email && userService.emailAlreadyUsed(email.toString())) {
			return fail(400, { message: 'Diese Email wird bereits verwendet' });
		}

		if (!password) {
			return fail(400, { message: 'Password wird benötigt' });
		}

		if (password && password2 && password.toString() !== password2.toString()) {
			return fail(400, { message: 'Passwort muss gleich sein' });
		}

		if (!dynasty) {
			return fail(400, { message: 'Die Dynastie muss gegeben sein' });
		}

		const dynastyS: string = dynasty.toString();
		const user: User | undefined = userService.create(nicknameS, email, password.toString());
		if (user && dynasty) {
			dynastyService.create(dynastyS, user.id);
			cookies.set('session', userService.createSession(user), { path: '/' });
			redirect(303, '/');
		}
		return fail(500, { message: 'User anlegen gescheitert!' });
	}
} satisfies Actions;
