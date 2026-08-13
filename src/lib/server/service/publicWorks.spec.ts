import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Candidacy, Election, Vote } from '$lib/db/model/election';
import { Employment } from '$lib/db/model/employment';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as buildingService from '$lib/server/service/buildingService';
import * as electionService from '$lib/server/service/electionService';
import * as employmentService from '$lib/server/service/employmentService';
import { CAMPAIGN_TICKS } from '$lib/game/election.logic';
import { CONDITION_MAX, YEARS_TO_RUIN } from '$lib/game/building.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.7c: was das Amt mit der Stadtkasse anfangen kann.
 *
 * Im Mittelpunkt: dass **nur** der Amtsinhaber öffentliche Bauten herrichten und
 * errichten kann, dass die Stadt dabei zahlt und nicht er — und dass ein Wächter seinen
 * Sold aus der Stadtkasse bekommt wie jeder Angestellte aus der Kasse seines Chefs.
 */

const WACHHAUS = 7;
const JETZT = 10_000;
/** So weit verfallen, dass ein NPC-Buergermeister eingreift — unter der halben Guete. */
const VERFALLEN: number = yearsToTicks(YEARS_TO_RUIN * 0.75);
let stadtId: string;

async function person(name: string, extras: Record<string, unknown> = {}): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'PLAYER',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 100,
		RegionId: stadtId,
		...extras
	});
	return id;
}

/** Ein städtisches Grundstück, wahlweise mit Gebäude darauf. */
async function stadtgrund(
	optionId?: number,
	extras: Record<string, unknown> = {}
): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Ratsgasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CITY'
	});
	if (optionId === undefined) return plotId;

	const id = randomUUID();
	await Building.create({
		id,
		name: 'Städtisches Haus',
		optionId,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CITY',
		...extras
	});
	return id;
}

async function insAmt(characterId: string): Promise<void> {
	await electionService.advanceElections(stadtId, JETZT);
	await electionService.stand(characterId, stadtId);
	await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);
}

async function kasse(): Promise<number> {
	return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
}

async function weltzeit(tick: number): Promise<void> {
	await World.update({ currentTick: tick }, { where: { id: WORLD_ID } });
}

describe('Öffentliche Bauten', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await weltzeit(JETZT);
		await Employment.destroy({ where: {} });
		await Vote.destroy({ where: {} });
		await Candidacy.destroy({ where: {} });
		await Election.destroy({ where: {} });
		await Building.destroy({ where: {} });
		await Plot.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 1000 }, { where: { id: stadtId } });
	});

	describe('der Verfall', () => {
		it('trifft auch die Häuser der Stadt', async () => {
			// Bis 4.7c waren sie ausgenommen — es gab niemanden, der sie hätte herrichten
			// können.
			const id = await stadtgrund(3);
			await weltzeit(JETZT + VERFALLEN);

			expect((await buildingService.getBuilding(id))?.condition).toBe(CONDITION_MAX / 4);
		});

		it('lässt sie aber nicht einstürzen', async () => {
			const id = await stadtgrund(0);
			await weltzeit(JETZT + yearsToTicks(YEARS_TO_RUIN * 2));

			expect((await buildingService.getBuilding(id))?.condition).toBe(0);
			expect(await Building.findByPk(id)).not.toBeNull();
		});
	});

	describe('herrichten', () => {
		it('darf nur der Amtsinhaber, und die Stadt zahlt', async () => {
			const id = await stadtgrund(3);
			const buergermeister = await person('Amtsperson');
			const buerger = await person('Bürger');
			await insAmt(buergermeister);
			await weltzeit(JETZT + VERFALLEN);

			expect(await buildingService.renovatePublicBuilding(buerger, id)).toEqual({
				ok: false,
				reason: 'NOT_IN_OFFICE'
			});

			const ergebnis = await buildingService.renovatePublicBuilding(buergermeister, id);
			expect(ergebnis.ok).toBe(true);
			expect((await buildingService.getBuilding(id))?.condition).toBe(CONDITION_MAX);

			// Die Zeit ist seine, das Geld ist das der Stadt.
			expect(await kasse()).toBeLessThan(1000);
			expect((await Character.findByPk(buergermeister))!.dataValues.money).toBe(100);
			expect((await Character.findByPk(buergermeister))!.dataValues.actionPoints).toBeLessThan(48);
		});

		it('geht nicht an einem privaten Haus', async () => {
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);

			const plotId = randomUUID();
			await Plot.create({
				id: plotId,
				address: 'Privatgasse 1',
				type: 'BUILDING_LAND',
				RegionId: stadtId,
				ownerType: 'CHARACTER',
				OwnerCharacterId: buergermeister
			});
			const id = randomUUID();
			await Building.create({
				id,
				name: 'Wohnhaus',
				optionId: 1,
				lastConditionTick: JETZT,
				PlotId: plotId,
				ownerType: 'CHARACTER',
				OwnerCharacterId: buergermeister
			});

			expect(await buildingService.renovatePublicBuilding(buergermeister, id)).toEqual({
				ok: false,
				reason: 'PLOT_NOT_OWNED'
			});
		});

		it('scheitert an einer leeren Stadtkasse', async () => {
			const id = await stadtgrund(3);
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);
			await Region.update({ treasury: 0 }, { where: { id: stadtId } });
			await weltzeit(JETZT + VERFALLEN);

			expect(await buildingService.renovatePublicBuilding(buergermeister, id)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
		});

		it('lässt ein NPC im Amt von selbst herrichten', async () => {
			// Ohne das verfiele jede Stadt, in der gerade kein Spieler regiert — und das
			// ist der Normalfall.
			const id = await stadtgrund(3);
			const npc = await person('Amtsperson', { role: 'NPC' });
			await insAmt(npc);
			await weltzeit(JETZT + VERFALLEN);

			const getan = await buildingService.maintainAsNpcMayor(stadtId);

			expect(getan).toBeDefined();
			expect((await buildingService.getBuilding(id))?.condition).toBe(CONDITION_MAX);
		});

		it('lässt einen Spieler im Amt selbst entscheiden', async () => {
			const id = await stadtgrund(3);
			const spieler = await person('Amtsperson');
			await insAmt(spieler);
			await weltzeit(JETZT + VERFALLEN);

			expect(await buildingService.maintainAsNpcMayor(stadtId)).toBeUndefined();
			expect((await buildingService.getBuilding(id))?.condition).toBe(CONDITION_MAX / 4);
		});
	});

	describe('errichten', () => {
		it('geht nur im Amt, nur auf städtischem Grund, nur aus der Stadtkasse', async () => {
			const plotId = await stadtgrund();
			const buergermeister = await person('Amtsperson');
			const buerger = await person('Bürger');
			await insAmt(buergermeister);

			expect(await buildingService.buildPublicBuilding(buerger, WACHHAUS, plotId)).toEqual({
				ok: false,
				reason: 'NOT_IN_OFFICE'
			});

			const ergebnis = await buildingService.buildPublicBuilding(buergermeister, WACHHAUS, plotId);

			expect(ergebnis.ok).toBe(true);
			expect(await kasse()).toBe(1000 - 300);
			// Sein eigenes Geld bleibt unangetastet — es ist das Haus der Stadt.
			expect((await Character.findByPk(buergermeister))!.dataValues.money).toBe(100);
		});

		it('baut nichts Privates auf Stadtkosten', async () => {
			// Sonst schenkte sich ein Bürgermeister einen Betrieb, den er nicht bezahlt hat.
			const plotId = await stadtgrund();
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);

			expect(await buildingService.buildPublicBuilding(buergermeister, 5, plotId)).toEqual({
				ok: false,
				reason: 'NOT_FOR_SALE'
			});
		});

		it('baut kein zweites Wachhaus', async () => {
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);
			await buildingService.buildPublicBuilding(buergermeister, WACHHAUS, await stadtgrund());

			expect(
				await buildingService.buildPublicBuilding(buergermeister, WACHHAUS, await stadtgrund())
			).toEqual({ ok: false, reason: 'LIMIT_REACHED' });
		});

		it('scheitert an einer leeren Stadtkasse', async () => {
			const plotId = await stadtgrund();
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);
			await Region.update({ treasury: 10 }, { where: { id: stadtId } });

			expect(await buildingService.buildPublicBuilding(buergermeister, WACHHAUS, plotId)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
		});
	});

	describe('die Stadtwache', () => {
		async function wachhausMitSold(sold: number): Promise<{ id: string; mayor: string }> {
			const plotId = await stadtgrund();
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);
			const gebaut = await buildingService.buildPublicBuilding(buergermeister, WACHHAUS, plotId);
			if (!gebaut.ok) throw new Error('Wachhaus liess sich nicht bauen');

			await employmentService.offerJob(buergermeister, gebaut.building.id, sold);
			return { id: gebaut.building.id, mayor: buergermeister };
		}

		it('bekommt ihren Sold vom Bürgermeister ausgesetzt', async () => {
			const { id, mayor } = await wachhausMitSold(4);
			const buerger = await person('Bürger');

			// Wer nicht im Amt ist, setzt am Haus der Stadt keinen Aushang.
			expect(await employmentService.offerJob(buerger, id, 9)).toEqual({
				ok: false,
				reason: 'NOT_IN_OFFICE'
			});
			expect((await Building.findByPk(id))!.dataValues.offeredWage).toBe(4);
			expect(mayor).toBeDefined();
		});

		it('steht als offene Stelle in der Stadt', async () => {
			await wachhausMitSold(4);
			const stellen = await employmentService.getOpenJobs(stadtId);

			expect(stellen.map((s) => [s.buildingName, s.wage, s.employerName])).toContainEqual([
				'Wachhaus',
				4,
				'der Stadt'
			]);
		});

		it('nimmt den Buergermeister nicht selbst in Dienst', async () => {
			// Sonst setzte er sich den Hoechstsold aus und hobe ihn ab — die Stadtkasse waere
			// eine zweite Boerse.
			const { id, mayor } = await wachhausMitSold(4);

			expect(await employmentService.takeJob(mayor, id)).toEqual({
				ok: false,
				reason: 'ALREADY_OWNED'
			});
		});

		it('wird aus der Stadtkasse bezahlt', async () => {
			const { id } = await wachhausMitSold(4);
			const waechter = await person('Wächterin');
			await employmentService.takeJob(waechter, id);
			const vorher: number = await kasse();

			const schicht = await employmentService.workForEmployer(waechter);

			expect(schicht.ok).toBe(true);
			expect((await Character.findByPk(waechter))!.dataValues.money).toBe(104);
			// Der Lohn kommt aus der Kasse der Stadt, nicht aus dem Nichts.
			expect(await kasse()).toBe(vorher - 4);
		});

		it('arbeitet nicht umsonst, wenn die Stadtkasse leer ist', async () => {
			const { id } = await wachhausMitSold(4);
			const waechter = await person('Wächterin');
			await employmentService.takeJob(waechter, id);
			await Region.update({ treasury: 2 }, { where: { id: stadtId } });

			expect(await employmentService.workForEmployer(waechter)).toEqual({
				ok: false,
				reason: 'EMPLOYER_BROKE'
			});
			// Dieselbe Regel wie beim privaten Arbeitgeber: Es kostet ihn auch nichts.
			expect((await Character.findByPk(waechter))!.dataValues.actionPoints).toBe(48);
		});
	});
});
