import { base } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import * as userService from '$lib/server/service/userService';
import * as dynastyService from '$lib/server/service/dynastyService';
import type { Actions } from './$types';
import type { User } from '$lib/model/user';

export const actions = {
	default: async ({ cookies, request }) => {
		const data = await request.formData();
		const nickname = data.get('nickname')?.toString();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const password2 = data.get('password2')?.toString();
		const dynasty = data.get('dynasty')?.toString();

		if (!nickname) {
			return fail(400, { message: 'Nickname ist erforderlich' });
		}
		if (await userService.nickNameAlreadyUsed(nickname)) {
			return fail(400, { message: 'Der Nickname ist bereits vergeben' });
		}
		if (email && (await userService.emailAlreadyUsed(email))) {
			return fail(400, { message: 'Diese Email wird bereits verwendet' });
		}
		if (!password) {
			return fail(400, { message: 'Password wird benötigt' });
		}
		if (password !== password2) {
			return fail(400, { message: 'Passwort muss gleich sein' });
		}
		if (!dynasty) {
			return fail(400, { message: 'Die Dynastie muss gegeben sein' });
		}

		const user: User | undefined = await userService.create(nickname, email, password);
		if (!user) {
			return fail(500, { message: 'User anlegen gescheitert!' });
		}

		await dynastyService.create(dynasty, user.id);
		await userService.startSession(user, cookies);
		redirect(303, `${base}/`);
	}
} satisfies Actions;
