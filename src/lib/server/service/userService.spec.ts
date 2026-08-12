import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { SessionToken } from '$lib/db/model/sessionToken';
import { User as UserModel } from '$lib/db/model/user';
import * as userService from '$lib/server/service/userService';
import type { User } from '$lib/model/user';

/**
 * Phase 2: Was die Anmeldung zusichern muss — das Passwort verlässt den Klartext, und
 * das Cookie sagt nichts über den Benutzer aus, sondern schlägt ihn nur nach.
 */

interface GesetzterCookie {
	value: string;
	options: Record<string, unknown>;
}

/** Nur so viel von `Cookies`, wie die Anmeldung benutzt. */
function cookieAttrappe(): Cookies & { gesetzt: Map<string, GesetzterCookie> } {
	const gesetzt = new Map<string, GesetzterCookie>();
	return {
		gesetzt,
		get: (name: string) => gesetzt.get(name)?.value,
		set: (name: string, value: string, options: Record<string, unknown>) =>
			void gesetzt.set(name, { value, options }),
		delete: (name: string) => void gesetzt.delete(name)
	} as unknown as Cookies & { gesetzt: Map<string, GesetzterCookie> };
}

async function anlegen(nickname: string, passwort: string): Promise<User> {
	const angelegt: User | undefined = await userService.create(nickname, undefined, passwort);
	expect(angelegt).toBeDefined();
	return angelegt!;
}

describe('Anmeldung', () => {
	beforeAll(async () => {
		await sequelize.sync();
	});

	beforeEach(async () => {
		await SessionToken.destroy({ where: {} });
		await UserModel.destroy({ where: {} });
	});

	describe('Passwörter', () => {
		it('legt das Passwort nur als Hash ab', async () => {
			await anlegen('Adelbert', 'geheim123');

			const gespeichert = await UserModel.findOne({ where: { nickname: 'Adelbert' } });

			expect(gespeichert?.dataValues.password).not.toBe('geheim123');
			expect(gespeichert?.dataValues.password).toMatch(/^\$2[aby]\$/);
		});

		it('lässt das richtige Passwort durch', async () => {
			const angelegt: User = await anlegen('Adelbert', 'geheim123');

			const angemeldet = await userService.loginWithCredentials('Adelbert', 'geheim123');

			expect(angemeldet?.id).toBe(angelegt.id);
		});

		it('weist das falsche Passwort ab', async () => {
			await anlegen('Adelbert', 'geheim123');

			expect(await userService.loginWithCredentials('Adelbert', 'geheim124')).toBeUndefined();
		});

		it('weist einen unbekannten Nickname ab', async () => {
			expect(await userService.loginWithCredentials('Niemand', 'geheim123')).toBeUndefined();
		});
	});

	describe('Sitzung', () => {
		it('legt ein opakes Cookie an, das den Benutzer nicht verrät', async () => {
			const angelegt: User = await anlegen('Adelbert', 'geheim123');
			const cookies = cookieAttrappe();

			await userService.startSession(angelegt, cookies);

			const cookie = cookies.gesetzt.get(userService.SESSION_COOKIE)!;
			expect(cookie.value).not.toContain(angelegt.id);
			expect(cookie.value).not.toContain('Adelbert');
			expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
		});

		it('löst das Cookie zur Identität auf', async () => {
			const angelegt: User = await anlegen('Adelbert', 'geheim123');
			const cookies = cookieAttrappe();
			await userService.startSession(angelegt, cookies);

			const aufgelöst = await userService.getCurrentUserBySessionToken(
				cookies.get(userService.SESSION_COOKIE)
			);

			expect(aufgelöst?.nickname).toBe('Adelbert');
		});

		it('führt mit einem selbst geschriebenen Cookie ins Leere', async () => {
			await anlegen('Adelbert', 'geheim123');

			expect(await userService.getCurrentUserBySessionToken('ausgedacht')).toBeUndefined();
			expect(await userService.getCurrentUserBySessionToken(undefined)).toBeUndefined();
		});

		it('ersetzt bei erneuter Anmeldung die vorige Sitzung', async () => {
			const angelegt: User = await anlegen('Adelbert', 'geheim123');
			const ersteCookies = cookieAttrappe();
			await userService.startSession(angelegt, ersteCookies);
			const ersterToken: string = ersteCookies.get(userService.SESSION_COOKIE)!;

			await userService.startSession(angelegt, cookieAttrappe());

			expect(await userService.getCurrentUserBySessionToken(ersterToken)).toBeUndefined();
			expect(await SessionToken.count({ where: { UserId: angelegt.id } })).toBe(1);
		});

		it('räumt eine abgelaufene Sitzung beim Auflösen weg', async () => {
			const angelegt: User = await anlegen('Adelbert', 'geheim123');
			const cookies = cookieAttrappe();
			await userService.startSession(angelegt, cookies);
			const token: string = cookies.get(userService.SESSION_COOKIE)!;

			const abgelaufen = new Date(Date.now() - 1000);
			await SessionToken.update({ expiresAt: abgelaufen }, { where: { token } });

			expect(await userService.getCurrentUserBySessionToken(token)).toBeUndefined();
			expect(await SessionToken.count({ where: { token } })).toBe(0);
		});

		it('meldet ab — im Browser und in der Datenbank', async () => {
			const angelegt: User = await anlegen('Adelbert', 'geheim123');
			const cookies = cookieAttrappe();
			await userService.startSession(angelegt, cookies);
			const token: string = cookies.get(userService.SESSION_COOKIE)!;
			const locals = { currentUser: angelegt, currentCharacter: undefined } as App.Locals;

			await userService.logout(locals, cookies);

			expect(locals.currentUser).toBeUndefined();
			expect(cookies.get(userService.SESSION_COOKIE)).toBeUndefined();
			expect(await SessionToken.count({ where: { token } })).toBe(0);
		});
	});

	describe('Ablauffrist', () => {
		const jetzt = new Date('2026-08-12T12:00:00Z');

		it('trennt vor und nach der Frist', () => {
			const gleich = new Date(jetzt.getTime() + 1000);
			const knappVorbei = new Date(jetzt.getTime() - 1000);

			expect(userService.isSessionExpired(gleich, jetzt)).toBe(false);
			expect(userService.isSessionExpired(knappVorbei, jetzt)).toBe(true);
		});

		it('setzt die Frist auf dreißig Tage ab Anmeldung', async () => {
			const angelegt: User = await anlegen('Adelbert', 'geheim123');
			const vorher: number = Date.now();

			await userService.startSession(angelegt, cookieAttrappe());

			const sitzung = await SessionToken.findOne({ where: { UserId: angelegt.id } });
			const frist: number = sitzung!.dataValues.expiresAt.getTime();
			expect(frist).toBeGreaterThanOrEqual(vorher + userService.SESSION_MAX_AGE_MS);
			expect(frist).toBeLessThanOrEqual(Date.now() + userService.SESSION_MAX_AGE_MS);
		});

		it('behandelt einen fehlenden Zeitstempel als abgelaufen', () => {
			expect(userService.isSessionExpired(undefined)).toBe(true);
			expect(userService.isSessionExpired(new Date('unsinn'))).toBe(true);
		});
	});
});
