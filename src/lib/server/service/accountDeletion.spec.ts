import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { SessionToken } from '$lib/db/model/sessionToken';
import { User } from '$lib/db/model/user';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as userService from '$lib/server/service/userService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 5.9 — Kontolöschung als Anonymisierung (Punkt 28).
 *
 * Die Frage dahinter ist nicht, ob etwas gelöscht wird, sondern **was bleiben muss**: An
 * einer Dynastie hängen Gebäude, Ämter und die Vorfahren anderer Spieler.
 */

const JETZT = 30_000;
let stadtId: string;

async function konto(nickname: string): Promise<{ userId: string; characterId: string }> {
	const userId = randomUUID();
	await User.create({ id: userId, nickname, email: `${nickname}@example.org`, password: 'hash' });
	await SessionToken.create({
		UserId: userId,
		token: randomUUID(),
		expiresAt: new Date(Date.now() + 86_400_000)
	});

	const hausId = randomUUID();
	await Dynasty.create({ id: hausId, name: `Haus ${nickname}`, UserId: userId, foundedAtTick: 0 });

	const characterId = randomUUID();
	await Character.create({
		id: characterId,
		firstName: 'Wenzel',
		role: 'PLAYER',
		gender: 'MALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 100,
		DynastyId: hausId,
		RegionId: stadtId
	});

	return { userId, characterId };
}

describe('Ein Konto löschen', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await SessionToken.destroy({ where: {} });
		await Character.destroy({ where: { role: 'PLAYER' } });
		await Dynasty.destroy({ where: {} });
		await User.destroy({ where: {} });
	});

	it('nimmt dem Konto alles Persönliche', async () => {
		const { userId } = await konto('abschied');

		expect(await userService.anonymizeAccount(userId)).toBe(true);

		const danach = (await User.findByPk(userId))!.dataValues;
		expect(danach.nickname).not.toBe('abschied');
		expect(danach.email).toBeNull();
		// Kein gültiger bcrypt-Hash: Ein Anmeldeversuch scheitert damit von selbst,
		// ohne dass es dafür eine Sonderprüfung im Anmeldeweg bräuchte.
		expect(danach.password).not.toContain('$2');
	});

	it('beendet alle Sitzungen', async () => {
		const { userId } = await konto('abschied');

		await userService.anonymizeAccount(userId);

		expect(await SessionToken.count({ where: { UserId: userId } })).toBe(0);
	});

	it('lässt die Figur in der Welt — namenlos und ungespielt', async () => {
		// Sie zu entfernen hieße, in fremde Stammbäume Löcher zu reißen und Ereignisse zu
		// tilgen, an denen andere beteiligt waren.
		const { userId, characterId } = await konto('abschied');

		await userService.anonymizeAccount(userId);

		const figur = (await Character.findByPk(characterId))!.dataValues;
		expect(figur.deathTick).toBeNull();
		expect(figur.firstName).toBe('Namenlos');
		// Aus dem gespielten Charakter wird ein Einwohner wie jeder andere: Er wohnt und
		// arbeitet weiter, aber niemand führt ihn mehr.
		expect(figur.role).toBe('NPC');
	});

	it('nimmt auch dem Haus seinen Namen', async () => {
		const { userId } = await konto('abschied');

		await userService.anonymizeAccount(userId);

		const haus = (await Dynasty.findOne({ where: { UserId: userId } }))!.dataValues;
		expect(haus.name).not.toContain('abschied');
		// Er muss sich als Nachname lesen lassen, denn genau das ist er (5.10).
		expect(haus.name).toBe('Vergessen');
	});

	it('lässt die Chronik stehen, aber ohne den Namen', async () => {
		// Die Chronik speichert Kennungen, nicht Namen — der Satz entsteht beim Lesen.
		// Deshalb genügt es, die Figur umzubenennen: Der Eintrag bleibt, der Name geht.
		const { userId, characterId } = await konto('abschied');
		await chronicleService.record('BIRTH', stadtId, JETZT, { subjectId: characterId });

		await userService.anonymizeAccount(userId);

		const chronik = await chronicleService.getChronicle({ characterId });
		expect(chronik).toHaveLength(1);
		// Seit 5.10 trägt jeder den Namen seines Hauses — auch der Namenlose. „Vergessen"
		// ist dabei kein Rest, sondern die Auskunft: Hier stand einmal jemand.
		expect(chronik[0].subject?.name).toBe('Namenlos Vergessen');
	});

	it('meldet einen unbekannten Benutzer, statt etwas zu tun', async () => {
		expect(await userService.anonymizeAccount(randomUUID())).toBe(false);
	});
});
