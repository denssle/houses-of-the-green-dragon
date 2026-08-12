import { randomUUID } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { User } from '$lib/model/user';
import type { BackendUser } from '$lib/model/backendUser';
import { User as UserModel } from '$lib/db/model/user';
import { convertToBackendUser, convertToUser } from '$lib/db/attributes/user.attributes';
import * as characterService from '$lib/server/service/characterService';

/**
 * Hinweis zum Stand: Passwörter liegen hier noch im Klartext, und das Sitzungs-Cookie
 * enthält weiterhin den Benutzer als JSON. Beides ist in Phase 2 an der Reihe (bcrypt
 * und ein opakes Token). Dieser Schritt tauscht ausschließlich den Speicher — Dateien
 * gegen Datenbank —, damit ein Fehlschlag eindeutig einer Ursache zuzuordnen ist.
 */

export async function getUserForNickAndPW(
	nickname: string,
	password: string
): Promise<User | undefined> {
	const gefunden = await UserModel.findOne({ where: { nickname, password } });
	return gefunden ? convertToUser(gefunden.dataValues) : undefined;
}

export async function userExists(currentUser: User | null): Promise<boolean> {
	if (!currentUser?.id) return false;
	return (await UserModel.count({ where: { id: currentUser.id } })) > 0;
}

export function extractUser(sessionCookie: string | undefined): User | null {
	if (!sessionCookie) return null;
	try {
		return JSON.parse(sessionCookie);
	} catch {
		// Ein unlesbares Cookie ist kein Grund, den Request abzubrechen — es zählt wie
		// keines.
		return null;
	}
}

export async function nickNameAlreadyUsed(nickname: string): Promise<boolean> {
	return (await UserModel.count({ where: { nickname } })) > 0;
}

export async function emailAlreadyUsed(email: string): Promise<boolean> {
	if (!email) return false;
	return (await UserModel.count({ where: { email } })) > 0;
}

export async function create(
	nickname: string,
	email: string | undefined,
	password: string
): Promise<User | undefined> {
	const angelegt = await UserModel.create({
		id: randomUUID(),
		nickname,
		email: email ?? null,
		password
	});
	return convertToUser(angelegt.dataValues);
}

export async function getUser(userId: string): Promise<User | undefined> {
	const gefunden = await UserModel.findByPk(userId);
	return gefunden ? convertToUser(gefunden.dataValues) : undefined;
}

export async function getBackendUser(nickname: string): Promise<BackendUser | undefined> {
	const gefunden = await UserModel.findOne({ where: { nickname } });
	return gefunden ? convertToBackendUser(gefunden.dataValues) : undefined;
}

export function createSession(user: User): string {
	return JSON.stringify(user);
}

export async function login(locals: App.Locals, currentUser: User): Promise<void> {
	locals.currentUser = currentUser;
	locals.currentCharacter = await characterService.getCharacterForUser(currentUser.id);
}

export function logout(locals: App.Locals, cookies: Cookies): void {
	locals.currentUser = undefined;
	locals.currentCharacter = undefined;
	cookies.delete('session', { path: '/' });
}
