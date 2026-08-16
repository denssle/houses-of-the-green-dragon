import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Op } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Skill } from '$lib/db/model/skill';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as migrationService from '$lib/server/service/migrationService';
import { canVote, isSettled, CITIZENSHIP_AFTER_YEARS } from '$lib/game/election.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Zuzug (5.24, Punkt 71).
 *
 * Die Welt bekommt eine Tür. Wer ankommt, bringt ein Handwerk mit, das der Stadt fehlt
 * (Punkt 70), und das Geld, das er anderswo verdient hat (Punkt 66) — eine Geldquelle,
 * die die Regel aus `KONZEPT.md` nicht bricht.
 */

const JETZT = 10_000;
/** Ein Wurf, bei dem sicher jemand kommt: unter der Ankunftswahrscheinlichkeit. */
const KOMMT = () => 0;
let stadtId: string;

describe('Zuzug', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		// Nur die Zugezogenen des vorigen Tests — die Gründer der Welt bleiben stehen,
		// denn an ihnen hängt die Unterkunft, die den Zuzug überhaupt erst erlaubt.
		await Character.destroy({ where: { arrivedTick: { [Op.ne]: null } } });
	});

	it('bringt einen Menschen mit Haus, Handwerk und Geld', async () => {
		const angekommen = await migrationService.admitNewcomers(stadtId, JETZT, KOMMT);

		expect(angekommen).toBeDefined();
		const person = (await Character.findByPk(angekommen!.characterId))!;

		// Ein eigenes Haus (5.10) — wer ankommt, gründet eine Linie.
		expect(person.dataValues.DynastyId).not.toBeNull();
		// Das Geld kommt von draußen und nicht aus dem Nichts.
		expect(person.dataValues.money).toBeGreaterThan(0);
		// Und der Tag der Ankunft steht fest: Daran hängt das Wahlrecht.
		expect(person.dataValues.arrivedTick).toBe(JETZT);

		const koennen = await Skill.findAll({ where: { CharacterId: angekommen!.characterId } });
		expect(koennen).toHaveLength(1);
		expect(koennen[0].dataValues.level).toBeGreaterThan(0);
	});

	it('bringt ein Handwerk mit, das in der Stadt fehlt', async () => {
		// Die Startwelt hat eine Schmiede — also kommt kein Schmied.
		const angekommen = await migrationService.admitNewcomers(stadtId, JETZT, KOMMT);

		expect(angekommen?.skill).not.toBe('SMITHING');
	});

	it('steht in der Chronik', async () => {
		// **Ein Fremder, der ankommt, ist ein Ereignis.** Nach fünf Generationen heißt sonst
		// jeder Müller oder Schmied, und niemand sähe, woher das Handwerk kam.
		const angekommen = await migrationService.admitNewcomers(stadtId, JETZT, KOMMT);

		const eintraege = await chronicleService.getChronicle({
			characterId: angekommen!.characterId,
			limit: 5
		});

		const ankunft = eintraege.find((eintrag) => eintrag.kind === 'ARRIVED');
		expect(ankunft).toBeDefined();
		// Das Handwerk gehört in den Eintrag: Es ist der Grund, warum die Ankunft zählt.
		expect(ankunft?.detail).toBe(angekommen!.skill);
	});

	it('lässt niemanden kommen, wo kein Bett frei ist', async () => {
		// Ohne Unterkunft findet niemand Platz — und zieht weiter.
		await Building.destroy({ where: { optionId: 3 } });

		expect(await migrationService.admitNewcomers(stadtId, JETZT, KOMMT)).toBeUndefined();
	});
});

describe('Das Wahlrecht der Zugezogenen', () => {
	const WAHL = { open: true, candidates: ['kandidat'] };
	const ERWACHSEN = JETZT - yearsToTicks(30);

	it('lässt den frisch Angekommenen nicht wählen', () => {
		// **Ohne diese Frist gewänne eine Wahl, wer Leute ansiedelt** — das Konzept nennt
		// genau diesen Fall (Abschnitt 16).
		const frisch = { birthTick: ERWACHSEN, alreadyVoted: false, arrivedTick: JETZT };

		expect(canVote(frisch, WAHL, 'kandidat', JETZT)).toEqual({
			ok: false,
			reason: 'NOT_A_CITIZEN'
		});
	});

	it('lässt ihn nach einer Wahlperiode wählen', () => {
		const eingesessen = {
			birthTick: ERWACHSEN,
			alreadyVoted: false,
			arrivedTick: JETZT - yearsToTicks(CITIZENSHIP_AFTER_YEARS)
		};

		expect(canVote(eingesessen, WAHL, 'kandidat', JETZT)).toEqual({ ok: true });
	});

	it('betrifft niemanden, der hier geboren ist', () => {
		// `arrivedTick` ist null für jeden, der nicht zugezogen ist — und das ist jeder
		// bestehende Charakter der Welt.
		expect(isSettled(null, JETZT)).toBe(true);

		const hiesig = { birthTick: ERWACHSEN, alreadyVoted: false, arrivedTick: null };
		expect(canVote(hiesig, WAHL, 'kandidat', JETZT)).toEqual({ ok: true });
	});
});
