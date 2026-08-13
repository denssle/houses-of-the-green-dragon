import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
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
import { CAMPAIGN_TICKS } from '$lib/game/election.logic';
import { LAW_RULES } from '$lib/game/law.logic';
import { TICKS_PER_YEAR, yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.7b gegen die Datenbank. Im Mittelpunkt: dass nur der Amtsinhaber etwas
 * erlassen kann, dass der jüngste Erlass gilt — und dass die Grundsteuer niemanden ins
 * Minus treibt.
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

async function grundstueck(besitzerId: string): Promise<string> {
	const id = randomUUID();
	await Plot.create({
		id,
		address: `Steuergasse ${id.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	return id;
}

/** Macht jemanden zum Bürgermeister — über eine echte Wahl, nicht per Hand. */
async function insAmt(characterId: string): Promise<void> {
	await electionService.advanceElections(stadtId, JETZT);
	await electionService.stand(characterId, stadtId);
	await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);
}

async function geld(id: string): Promise<number> {
	return (await Character.findByPk(id))!.dataValues.money;
}

describe('Gesetze gegen die Datenbank', () => {
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
		await Plot.destroy({ where: { ownerType: 'CHARACTER' } });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 0, lastTaxTick: null }, { where: { id: stadtId } });
	});

	describe('erlassen', () => {
		it('darf nur der Amtsinhaber', () => {
			return (async () => {
				const buerger = await person('Bürger');
				expect(await lawService.enact(buerger, stadtId, 'TITHE', 20, JETZT)).toEqual({
					ok: false,
					reason: 'NOT_IN_OFFICE'
				});
			})();
		});

		it('wirkt sofort', async () => {
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);

			expect(await lawService.rate(stadtId, 'TITHE')).toBe(LAW_RULES.TITHE.fallback);
			expect(
				await lawService.enact(buergermeister, stadtId, 'TITHE', 20, JETZT + CAMPAIGN_TICKS)
			).toEqual({ ok: true });
			expect(await lawService.rate(stadtId, 'TITHE')).toBe(20);
		});

		it('überschreibt nichts, sondern schreibt fort', async () => {
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);
			const spaeter = JETZT + CAMPAIGN_TICKS;

			await lawService.enact(buergermeister, stadtId, 'TITHE', 20, spaeter);
			await lawService.enact(buergermeister, stadtId, 'TITHE', 5, spaeter + 10);

			// Zwei Zeilen, ein geltender Satz — und die Chronik weiß noch von beiden.
			expect(await Law.count()).toBe(2);
			expect(await lawService.rate(stadtId, 'TITHE')).toBe(5);
			const chronik = await lawService.chronicle(stadtId);
			expect(chronik.map((e) => e.value)).toEqual([5, 20]);
			expect(chronik[0].enactedBy).toBe('Amtsperson');
		});

		it('weist Sätze jenseits der Grenzen ab', async () => {
			const buergermeister = await person('Amtsperson');
			await insAmt(buergermeister);

			expect(
				await lawService.enact(
					buergermeister,
					stadtId,
					'TITHE',
					LAW_RULES.TITHE.max + 1,
					JETZT + CAMPAIGN_TICKS
				)
			).toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' });
			expect(await Law.count()).toBe(0);
		});
	});

	describe('die Grundsteuer', () => {
		async function satzSetzen(wert: number): Promise<void> {
			await Law.create({
				id: randomUUID(),
				RegionId: stadtId,
				kind: 'PROPERTY_TAX',
				value: wert,
				enactedTick: JETZT,
				EnactedByCharacterId: null
			});
		}

		it('erhebt beim ersten Mal nichts, sondern merkt sich den Zeitpunkt', async () => {
			// Sonst zöge eine frisch aufgesetzte Welt sofort ein volles Jahr ein.
			await satzSetzen(5);
			const besitzer = await person('Besitzerin');
			await grundstueck(besitzer);

			expect(await lawService.collectPropertyTax(stadtId, JETZT)).toBeUndefined();
			expect(await geld(besitzer)).toBe(100);
		});

		it('erhebt erst nach einem Spieljahr', async () => {
			await satzSetzen(5);
			const besitzer = await person('Besitzerin');
			await grundstueck(besitzer);
			await lawService.collectPropertyTax(stadtId, JETZT);

			expect(
				await lawService.collectPropertyTax(stadtId, JETZT + TICKS_PER_YEAR - 1)
			).toBeUndefined();
			expect(await lawService.collectPropertyTax(stadtId, JETZT + TICKS_PER_YEAR)).toEqual({
				collected: 5,
				payers: 1,
				shortfall: 0
			});
			expect(await geld(besitzer)).toBe(95);
		});

		it('rechnet je Grundstück und füllt die Stadtkasse', async () => {
			await satzSetzen(5);
			const besitzer = await person('Besitzerin');
			await grundstueck(besitzer);
			await grundstueck(besitzer);
			await grundstueck(besitzer);
			await lawService.collectPropertyTax(stadtId, JETZT);

			const lauf = await lawService.collectPropertyTax(stadtId, JETZT + TICKS_PER_YEAR);

			expect(lauf?.collected).toBe(15);
			expect(await geld(besitzer)).toBe(85);
			expect((await Region.findByPk(stadtId))!.dataValues.treasury).toBe(15);
		});

		it('nimmt niemandem mehr, als er hat', async () => {
			// Kein Minusstand und keine vorgetragene Schuld — der Rest wird erlassen.
			await satzSetzen(20);
			const arm = await person('Arme', { money: 7 });
			await grundstueck(arm);
			await lawService.collectPropertyTax(stadtId, JETZT);

			const lauf = await lawService.collectPropertyTax(stadtId, JETZT + TICKS_PER_YEAR);

			expect(lauf).toEqual({ collected: 7, payers: 1, shortfall: 13 });
			expect(await geld(arm)).toBe(0);
		});

		it('lässt Tote und die Stadt selbst aus', async () => {
			await satzSetzen(5);
			const tot = await person('Verstorbene', { deathTick: JETZT - 1 });
			await grundstueck(tot);
			await lawService.collectPropertyTax(stadtId, JETZT);

			const lauf = await lawService.collectPropertyTax(stadtId, JETZT + TICKS_PER_YEAR);

			// Die städtischen Grundstücke aus dem Seed zählen nicht mit, der Tote auch nicht.
			expect(lauf?.collected).toBe(0);
			expect(lauf?.payers).toBe(0);
		});

		it('bleibt aus, solange der Satz null ist', async () => {
			const besitzer = await person('Besitzerin');
			await grundstueck(besitzer);
			await lawService.collectPropertyTax(stadtId, JETZT);

			expect(await lawService.collectPropertyTax(stadtId, JETZT + TICKS_PER_YEAR)).toBeUndefined();
			expect(await geld(besitzer)).toBe(100);
		});
	});
});
