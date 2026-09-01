import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Plot } from '$lib/db/model/plot';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import { yearsToTicks } from '$lib/game/time';
import type { IdleReason } from '$lib/game/npc.logic';
import * as npcService from '$lib/server/service/npcService';
import * as skillService from '$lib/server/service/skillService';

/**
 * Warum in dieser Welt nie ein Backhaus steht (Punkte 85, 70, 93).
 *
 * **Die Frage stammt aus den Messläufen.** In der Stadt saßen drei zugezogene Bäcker mit
 * 187, 189 und 266 Münzen — das Backhaus kostet 220 —, und keiner baute. Die Vermutungen
 * waren: das Geld (Punkt 76), der Bauplatz (Punkt 87) oder der Kornspeicher, der jeden
 * Bäcker unterbiete (Punkt 85). Diese Datei nimmt ihnen allen dreien den Vorwand und
 * fragt, was dann noch übrig bleibt.
 *
 * **Die Ausgangslage lässt keine Ausrede zu:** achthundert Münzen für ein Backhaus zu
 * zweihundertzwanzig, ein eigenes Grundstück, beide Handwerke gelernt, und niemand sonst
 * in der Stadt, der ihr das Bauland oder die Arbeit wegnähme.
 *
 * Was dabei herauskam, steht als Erwartung in den Tests: **Sie steht still.** Und der
 * zweite Block sagt, woran es liegt — nicht am Geld und nicht am Platz, sondern an drei
 * Quadern und zwei Stück Eisen, die es in dieser Welt nirgends zu kaufen gibt.
 */

const JETZT = 10_000;
const MUEHLE = 4;
const BAECKEREI = 5;

async function baeckerin(stadtId: string, name: string): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 800,
		RegionId: stadtId,
		// Dieselben Anlagen wie in `ironChain.spec.ts`, und aus denselben Gründen: Der
		// Eigenbrötler wirbt nicht, der Unternehmende unternimmt, die Rücklage ist
		// berechenbar.
		sociability: -100,
		ambition: 60,
		diligence: 60,
		greed: 0
	});
	await skillService.addPractice(id, 'BAKING', 500);
	await skillService.addPractice(id, 'FARMING', 500);

	await Plot.create({
		id: randomUUID(),
		address: 'Bäckergasse 1',
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: id
	});
	return id;
}

async function ticken(anzahl: number): Promise<Record<string, number>> {
	const gruende: Record<string, number> = {};
	const start: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
	for (let i = 0; i < anzahl; i++) {
		const lauf = await npcService.actForNpcs(start + i);
		for (const [was, oft] of Object.entries(lauf.byIdleReason)) {
			gruende[was as IdleReason] = (gruende[was as IdleReason] ?? 0) + oft;
		}
		await World.update({ currentTick: start + i + 1 }, { where: { id: WORLD_ID } });
	}
	return gruende;
}

async function stadtOhneLeute(): Promise<string> {
	await sequelize.sync();
	await seedWorld(seededRoll(86));
	const stadtId: string = await findStartRegionId();
	// **Allein in der Stadt**, wie in `ironChain.spec.ts`: Die Gründer nähmen ihr das
	// Bauland und die Arbeit weg und verschöben die Entscheidung, um die es hier geht.
	await Character.destroy({ where: { role: 'NPC' } });
	await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
	return stadtId;
}

describe('Die Brotkette', () => {
	describe('mit Geld, Grund und Können allein', () => {
		let gruende: Record<string, number> = {};
		let baeckerinId: string;

		beforeAll(async () => {
			const stadtId: string = await stadtOhneLeute();
			baeckerinId = await baeckerin(stadtId, 'Adelheid');
			gruende = await ticken(30);
		}, 300_000);

		it('baut sie trotzdem nichts', async () => {
			// Dreißig Ticks, achthundert Münzen, ein leeres Grundstück — und kein Stein wird
			// aufeinandergesetzt.
			expect(await Building.count({ where: { ownerType: 'CHARACTER' } })).toBe(0);
		});

		it('und gibt keine einzige Münze aus', async () => {
			expect((await Character.findByPk(baeckerinId))!.dataValues.money).toBe(800);
		});

		it('sondern steht still, mit einem Vorhaben, das keinen Preis hat', async () => {
			// **`GOAL_UNREACHABLE` — und hier ist zu sehen, was das wirklich heißt.** Sie hat
			// etwas vor (Werkstatt, sie ist unternehmend, sie hat keine), aber
			// `savingsTarget` ergibt `null`: Es fehlt ihr das Werkstattmaterial, und
			// `workshopMaterialPrice` ist `null`, weil es in dieser Welt niemand anbietet.
			//
			// Das ist die Zahl aus Punkt 93 an einem einzigen Fall, und sie belegt dort die
			// erste der beiden Lesarten: Die Stadt liefert wirklich nicht, was ihre Einwohner
			// vorhaben.
			expect(gruende.GOAL_UNREACHABLE).toBeGreaterThan(25);
		});
	});

	/**
	 * **Die Gegenprobe.** Dieselbe Frau, dieselbe Stadt, dieselben dreißig Ticks — nur
	 * liegen jetzt acht Bretter, vier Quader und zwei Stück Eisen in ihrer Kammer.
	 *
	 * Mehr braucht es nicht. Das Backhaus kostet zweihundertzwanzig Münzen, und die hatte
	 * sie vorher auch.
	 */
	describe('mit Baumaterial in der Kammer', () => {
		let baeckerinId: string;

		beforeAll(async () => {
			const stadtId: string = await stadtOhneLeute();
			baeckerinId = await baeckerin(stadtId, 'Adelheid');
			// `materialFor(220, 'CRAFT')` verlangt 9 Bretter, 4 Quader und 2 Eisen;
			// großzügig bemessen, damit der Test nicht an einer Rundung hängt.
			for (const [itemId, quantity] of [
				['PLANK', 12],
				['BLOCK', 6],
				['IRON', 4]
			] as const) {
				await Inventory.create({ CharacterId: baeckerinId, itemId, quantity });
			}
			await ticken(30);
		}, 300_000);

		it('baut sie sofort', async () => {
			const werkstatt = await Building.findOne({
				where: { ownerType: 'CHARACTER', OwnerCharacterId: baeckerinId }
			});

			// **Damit ist die Ursache bewiesen und nicht mehr vermutet:** Es war weder das
			// Geld (Punkt 76) noch der Bauplatz (Punkt 87) noch der Kornspeicher (Punkt 85).
			// Es waren Quader und Eisen — und die gibt es nur, wenn jemand eine
			// Steinmetzhütte und eine Schmiede betreibt und ihre Ware auch aushängt.
			expect([MUEHLE, BAECKEREI]).toContain(werkstatt?.dataValues.optionId);
		});
	});
});
