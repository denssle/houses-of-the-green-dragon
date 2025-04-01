import type { User } from '$lib/model/user';
import type { BackendUser } from '$lib/model/backendUser';
import * as characterService from '$lib/server/service/characterService';
import * as fileService from '$lib/server/service/fileService';
import type { Cookies } from '@sveltejs/kit';

let backendUsers: BackendUser[] = [];

load();

function load() {
	fileService.read('USER', (err, data) => {
		if (err) {
			return console.error(err);
		}
		backendUsers = JSON.parse(data.toString());
	});
}

function write() {
	fileService.write('USER', JSON.stringify(backendUsers));
}

export function getUserForNickAndPW(nicknameS: string, passwordS: string): User | undefined {
	return mapBackendUserToUser(
		backendUsers.find((value) => value.nickname === nicknameS && value.password === passwordS)
	);
}

export function userExists(currentUser: User | null): boolean {
	return Boolean(currentUser?.id && backendUsers.find(value => value.id === currentUser.id));
}

export function extractUser(sessionCookie: string | undefined): User | null {
	if (sessionCookie) {
		return JSON.parse(sessionCookie);
	}
	return null;
}

export function nickNameAlreadyUsed(nickname: string): boolean {
	return Boolean(backendUsers.find((value) => value.nickname === nickname));
}

export function create(
	nickname: string,
	email: string | undefined,
	password: string
): User | undefined {
	const newUser: BackendUser = {
		id: BigInt(Date.now()),
		nickname: nickname,
		email: email,
		password: password
	};
	backendUsers.push(newUser);
	write();
	return mapBackendUserToUser(newUser);
}

export function createSession(user: User): string {
	return JSON.stringify(user);
}

function mapBackendUserToUser(backend: BackendUser | undefined): User | undefined {
	if (backend) {
		return { id: backend.id, email: backend.email, nickname: backend.nickname };
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

export function getUser(userId: bigint) {
	return mapBackendUserToUser(backendUsers.find(value => value.id === userId));
}
