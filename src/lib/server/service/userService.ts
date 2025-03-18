import type { User } from '$lib/model/user';
import type { BackendUser } from '$lib/model/backendUser';
import * as characterService from '$lib/server/service/characterService';
import type { Cookies } from '@sveltejs/kit';

const userMap: Map<number, BackendUser> = new Map();

export function getUserForNickAndPW(nicknameS: string, passwordS: string) {
	return mapBackendUserToUser(
		userMap.values().find((value) => value.nickname === nicknameS && value.password === passwordS)
	);
}

export function validateExtractedUser(currentUser: User | null) {
	return Boolean(currentUser?.id && userMap.has(currentUser.id));
}

export function extractUser(sessionCookie: string | undefined): User | null {
	if (sessionCookie) {
		return JSON.parse(sessionCookie);
	}
	return null;
}

export function nickNameAlreadyUsed(nickname: string): boolean {
	return Boolean(userMap.values().find((value) => value.nickname === nickname));
}

export function createUser(
	nickname: string,
	email: string | undefined,
	password: string
): User | undefined {
	const newUser: BackendUser = {
		id: Date.now(),
		nickname: nickname,
		email: email,
		password: password
	};
	userMap.set(newUser.id, newUser);
	return mapBackendUserToUser(newUser);
}

export function createSession(user: User): string {
	return JSON.stringify(user);
}

function mapBackendUserToUser(backend: BackendUser | undefined): User | undefined {
	if (backend) {
		return { ...backend };
	}
	return undefined;
}

export function emailAlreadyUsed(s: string): boolean {
	// TODO implement
	return false;
}

export function login(locals: App.Locals, currentUser: User) {
	locals.currentUser = {
		id: currentUser.id,
		email: currentUser.email,
		nickname: currentUser.nickname
	};
	locals.currentCharacter = characterService.getCharacterForUser(currentUser.id);
}

export function logout(locals: App.Locals, cookies: Cookies) {
	locals.currentUser = undefined;
	locals.currentCharacter = undefined;
	cookies.delete('session', { path: '/' });
}