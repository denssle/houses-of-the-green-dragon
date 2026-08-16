import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Candidacy, Election, Vote } from '$lib/db/model/election';
import { Law } from '$lib/db/model/law';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as electionService from '$lib/server/service/electionService';
import * as lawService from '$lib/server/service/lawService';
import * as mayorService from '$lib/server/service/mayorService';
import { CAMPAIGN_TICKS } from '$lib/game/election.logic';
import { LAW_RULES } from '$lib/game/law.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Führt ein NPC sein Amt?
 *
 * Bis 4.15 richtete er nur öffentliche Bauten her — kein Gesetz, kein Bauland, keine
 * Wache. Unter ihm wuchs die Stadt nur, soweit sie ohnehin wuchs, und für einen Spieler
 * wäre es kein Ziel gewesen, ihm das Amt abzunehmen.
 */

const JETZT = 10_000;
const WACHHAUS = 7;
const SCHMIEDE = 2;
let stadtId: string;

async function person(name: string, rolle: 'PLAYER' | 'NPC' = 'NPC'): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: rolle,
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(35),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 100,
		RegionId: stadtId
	});
	return id;
}

/** Macht jemanden zum Bürgermeister — über eine echte Wahl. */
async function insAmt(characterId: string): Promise<void> {
	await electionService.advanceElections(stadtId, JETZT);
	await electionService.stand(characterId, stadtId);
	await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);
}

async function kasse(): Promise<number> {
	return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
}

async function stadtgrund(optionId?: number): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Amtsgasse ${plotId.slice(0, 4)}`,
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
		ownerType: 'CITY'
	});
	return id;
}

describe('Der Bürgermeister im Amt', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Law.destroy({ where: {} });
		await Vote.destroy({ where: {} });
		await Candidacy.destroy({ where: {} });
		await Election.destroy({ where: {} });
		await Building.destroy({ where: {} });
		await Plot.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 1000 }, { where: { id: stadtId } });
	});

	it('tut nichts, solange niemand im Amt ist', async () => {
		expect(await mayorService.governAsNpcMayor(stadtId, JETZT)).toBeUndefined();
	});

	it('lässt einen Spieler im Amt selbst entscheiden', async () => {
		// Sonst wäre jede Amtshandlung eine Schaltfläche, die erledigt, was ohnehin
		// geschieht.
		const spieler = await person('Amtsperson', 'PLAYER');
		await insAmt(spieler);
		await stadtgrund();

		expect(await mayorService.governAsNpcMayor(stadtId, JETZT)).toBeUndefined();
	});

	it('bezahlt seine Wache', async () => {
		const npc = await person('Amtsperson');
		await insAmt(npc);
		const wachhaus = await stadtgrund(WACHHAUS);

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('PAY_WAGE');
		expect((await Building.findByPk(wachhaus))!.dataValues.offeredWage).toBeGreaterThan(0);
	});

	it('schreibt auch die städtische Schmiede aus', async () => {
		// **Der Befund vom 16.08.2026** (Punkt 63): In der Welt auf dem Server stand die
		// Schmiede aus `seed.ts` 97 Spieljahre ohne Schmied. Der Bürgermeister suchte
		// allein nach dem Wachhaus, also hing für sie nie ein Sold aus — und ohne Aushang
		// bewirbt sich niemand. Ein Arbeitsplatz, den die Stadt besitzt, aber nie
		// ausschreibt, ist eine Kulisse.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		const schmiede = await stadtgrund(SCHMIEDE);

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('PAY_WAGE');
		expect((await Building.findByPk(schmiede))!.dataValues.offeredWage).toBeGreaterThan(0);
	});

	it('schreibt nicht zweimal aus, was schon einen Sold hat', async () => {
		// Sonst setzte er in jedem Tick denselben Aushang neu und käme nie dazu, etwas
		// anderes zu tun — dieselbe Falle, in der die NPCs vor 4.14 vor ihrem leeren
		// Bauplatz standen.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		const wachhaus = await stadtgrund(WACHHAUS);
		await Building.update({ offeredWage: 3 }, { where: { id: wachhaus } });

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).not.toBe('PAY_WAGE');
	});

	it('baut, was der Stadt fehlt', async () => {
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await stadtgrund();

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('BUILD_PUBLIC');
		expect(await Building.count({ where: { ownerType: 'CITY' } })).toBe(1);
		expect(await kasse()).toBeLessThan(1000);
	});

	it('erhöht die Steuer, wenn die Kasse leer ist', async () => {
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('SET_TAX');
		expect(await lawService.rate(stadtId, 'TITHE')).toBeGreaterThan(LAW_RULES.TITHE.fallback);
	});

	it('tut höchstens eines je Tick', async () => {
		// Ein Bürgermeister, der in derselben Stunde die Steuern erhöht, ein Wachhaus baut
		// und Land erschließt, wäre kein Amtsinhaber, sondern ein Automat.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await stadtgrund(WACHHAUS);
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('PAY_WAGE');
		// Die Steuer bleibt, wo sie war — sie ist erst im nächsten Tick an der Reihe.
		expect(await lawService.rate(stadtId, 'TITHE')).toBe(LAW_RULES.TITHE.fallback);
	});
});
