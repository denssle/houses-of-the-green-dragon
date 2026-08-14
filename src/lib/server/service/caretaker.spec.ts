import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { User } from '$lib/db/model/user';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as npcService from '$lib/server/service/npcService';
import { ABSENCE_AFTER_TICKS } from '$lib/game/npc.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 5.5 — läuft ein Charakter weiter, den gerade niemand spielt?
 *
 * Die Logik prüft `caretaker.logic.spec.ts`; hier geht es um den Weg durch den Takt: Wird
 * ein verwaister Spielercharakter überhaupt eingesammelt, und bleibt ein bespielter in
 * Ruhe?
 */

const JETZT = 20_000;
let stadtId: string;
let userId: string;

async function spieler(name: string, extras: Record<string, unknown> = {}): Promise<string> {
	const hausId = randomUUID();
	await Dynasty.create({ id: hausId, name: `Haus ${name}`, UserId: userId, foundedAtTick: 0 });

	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'PLAYER',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 5,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 500,
		DynastyId: hausId,
		RegionId: stadtId,
		...extras
	});
	return id;
}

async function stand(id: string) {
	return (await Character.findByPk(id))!.dataValues;
}

describe('Der verwaiste Charakter im Takt', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
		userId = randomUUID();
		await User.create({ id: userId, nickname: 'verwaist-test', password: 'egal' });
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Character.destroy({ where: { role: 'PLAYER' } });
		await Dynasty.destroy({ where: {} });
	});

	it('versorgt einen Hungernden, den lange niemand gespielt hat', async () => {
		// Ohne Selbstverwaltung verhungert er: 4,5 % Risiko je Tick, und niemand ist da,
		// der ihm ein Brot kauft.
		const vergessen = await spieler('Vergessen', {
			lastSeenTick: JETZT - ABSENCE_AFTER_TICKS
		});

		await npcService.actForNpcs(JETZT);

		const danach = await stand(vergessen);
		// Er hat entweder gegessen oder eingekauft — beides heißt, dass für ihn gehandelt
		// wurde. Untätig geblieben wäre er nur, wenn ihn niemand eingesammelt hätte.
		expect(danach.satiety > 5 || danach.money < 500).toBe(true);
	});

	it('lässt einen bespielten Charakter in Ruhe', async () => {
		// Wer eben noch da war, entscheidet selbst — auch wenn er hungert und nichts tut.
		const anwesend = await spieler('Anwesend', { lastSeenTick: JETZT });

		await npcService.actForNpcs(JETZT);

		const danach = await stand(anwesend);
		expect(danach.satiety).toBe(5);
		expect(danach.money).toBe(500);
	});

	it('nimmt ihm keine Entscheidungen ab', async () => {
		// Werben, heiraten, bauen, Grundstücke kaufen: Was der Spieler bei seiner Rückkehr
		// vorfindet, soll er selbst bestimmt haben. Hier zeigt sich das daran, dass der
		// Verwalter trotz vollem Beutel nichts erwirbt.
		const vergessen = await spieler('Reich', {
			satiety: 100,
			money: 5_000,
			lastSeenTick: JETZT - ABSENCE_AFTER_TICKS * 3
		});

		await npcService.actForNpcs(JETZT);

		const danach = await stand(vergessen);
		expect(danach.spouseId).toBeNull();
		// Gearbeitet haben darf er — dabei wird Geld mehr, nicht weniger.
		expect(danach.money).toBeGreaterThanOrEqual(5_000);
	});
});
