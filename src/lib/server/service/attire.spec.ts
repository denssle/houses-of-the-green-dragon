import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Relationship } from '$lib/db/model/relationship';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as familyService from '$lib/server/service/familyService';
import * as needService from '$lib/server/service/needService';
import * as relationshipService from '$lib/server/service/relationshipService';
import { GARMENT_BONUS, GARMENT_LIFETIME_TICKS, PERFUME_BONUS } from '$lib/game/attire.logic';
import { COURT_AFFECTION_GAIN } from '$lib/game/family.logic';
import { MAX_ACTION_POINTS, yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.11 gegen die Datenbank: Wirken Gewand und Duftwasser wirklich — und werden sie
 * dabei verbraucht?
 */

const JETZT = 10_000;
let stadtId: string;

async function person(name: string, extras: Record<string, unknown> = {}): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(25),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: MAX_ACTION_POINTS,
		money: 100,
		RegionId: stadtId,
		...extras
	});
	return id;
}

async function geben(characterId: string, itemId: string, menge: number): Promise<void> {
	await Inventory.create({ CharacterId: characterId, itemId, quantity: menge });
}

async function zuneigung(vonId: string, zuId: string): Promise<number> {
	return (await relationshipService.getAffection(vonId, zuId, JETZT)).affection;
}

async function stand(id: string) {
	return (await Character.findByPk(id))!.dataValues;
}

describe('Auftreten', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Inventory.destroy({ where: {} });
		await Relationship.destroy({ where: {} });
		await Character.destroy({ where: {} });
	});

	describe('das Gewand', () => {
		it('wird angezogen und dabei verbraucht', async () => {
			const ich = await person('Ich');
			await geben(ich, 'GARMENT', 2);

			expect(await needService.wearGarment(ich)).toEqual({ ok: true });

			expect((await stand(ich)).wornSinceTick).toBe(JETZT);
			const rest = await needService.getStock(ich);
			expect(rest.find((posten) => posten.itemId === 'GARMENT')?.quantity).toBe(1);
		});

		it('geht nicht ohne eines in der Kammer', async () => {
			const ich = await person('Ich');

			expect(await needService.wearGarment(ich)).toEqual({ ok: false, reason: 'NOT_IN_STOCK' });
			expect((await stand(ich)).wornSinceTick).toBeNull();
		});

		it('wirkt bei jedem Umgang', async () => {
			const ich = await person('Ich');
			const anderer = await person('Anderer');
			const ohne = await person('Ohne');
			await geben(ich, 'GARMENT', 1);
			await needService.wearGarment(ich);

			await relationshipService.spendTimeWith(ich, anderer);
			await relationshipService.spendTimeWith(ohne, anderer);

			// Wer etwas auf sein Äußeres hält, kommt besser an — und zwar um genau den
			// Zuschlag.
			expect(await zuneigung(anderer, ich)).toBe((await zuneigung(anderer, ohne)) + GARMENT_BONUS);
		});

		it('wirkt nicht mehr, wenn es hin ist', async () => {
			const ich = await person('Ich');
			const anderer = await person('Anderer');
			await geben(ich, 'GARMENT', 1);
			await needService.wearGarment(ich);
			await World.update(
				{ currentTick: JETZT + GARMENT_LIFETIME_TICKS },
				{ where: { id: WORLD_ID } }
			);

			await relationshipService.spendTimeWith(ich, anderer);

			const gewonnen: number = (
				await relationshipService.getAffection(anderer, ich, JETZT + GARMENT_LIFETIME_TICKS)
			).affection;
			// Ohne Zuschlag bleibt nur, was das Beisammensein selbst bringt.
			expect(gewonnen).toBeLessThan(GARMENT_BONUS + 10);
		});
	});

	describe('das Duftwasser', () => {
		it('wirkt beim Werben und ist danach weg', async () => {
			const ich = await person('Ich');
			const umworben = await person('Umworbene');
			await geben(ich, 'PERFUME', 1);

			await familyService.courtSomeone(ich, umworben, true);

			expect(await zuneigung(umworben, ich)).toBe(COURT_AFFECTION_GAIN + PERFUME_BONUS);
			expect(await needService.getStock(ich)).toHaveLength(0);
		});

		it('bleibt in der Kammer, wenn man es nicht einsetzt', async () => {
			const ich = await person('Ich');
			const umworben = await person('Umworbene');
			await geben(ich, 'PERFUME', 1);

			await familyService.courtSomeone(ich, umworben, false);

			expect(await zuneigung(umworben, ich)).toBe(COURT_AFFECTION_GAIN);
			expect((await needService.getStock(ich))[0].quantity).toBe(1);
		});

		it('lässt das Werben auch ohne Fläschchen zu', async () => {
			// Wer keines mehr hat, wirbt trotzdem — nur eben ohne Wirkung. Andersherum
			// bekäme er den Zuschlag ohne die Ware.
			const ich = await person('Ich');
			const umworben = await person('Umworbene');

			expect(await familyService.courtSomeone(ich, umworben, true)).toEqual({ ok: true });
			expect(await zuneigung(umworben, ich)).toBe(COURT_AFFECTION_GAIN);
		});
	});

	describe('der Stärkungstrank', () => {
		it('gibt Aktionspunkte zurück und wird verbraucht', async () => {
			const ich = await person('Ich', { actionPoints: 10 });
			await geben(ich, 'TONIC', 1);

			const ergebnis = await needService.drinkTonic(ich);

			expect(ergebnis).toMatchObject({ ok: true });
			expect((await stand(ich)).actionPoints).toBeGreaterThan(10);
			expect(await needService.getStock(ich)).toHaveLength(0);
		});

		it('wird nicht getrunken, wenn nichts fehlt', async () => {
			// Sonst verschwendete ein Klick das Fläschchen.
			const ich = await person('Ich', { actionPoints: MAX_ACTION_POINTS });
			await geben(ich, 'TONIC', 1);

			expect(await needService.drinkTonic(ich)).toEqual({ ok: false, reason: 'NOTHING_TO_DO' });
			expect((await needService.getStock(ich))[0].quantity).toBe(1);
		});
	});
});
