import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Skill } from '$lib/db/model/skill';
import { Inventory } from '$lib/db/model/inventory';
import { ARRIVAL_PROVISIONS } from '$lib/game/need.logic';
import { CARRIED_CAPACITY } from '$lib/game/inventory.logic';
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
const SCHMIEDE = 2;
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

	/**
	 * **Was der Stadt fehlt, geht vor — aber ein städtischer Betrieb besetzt kein Handwerk**
	 * (5.75, Punkt 104).
	 *
	 * Bis dahin zählte `handwerkeInDerStadt` **alle** Häuser der Region. Die Städtische
	 * Schmiede trägt `SMITHING`, also galt das Schmiedehandwerk als versorgt, und es zog nie
	 * ein Schmied zu: In zwei Messläufen mit 51 Charakteren kam `SMITHING` kein einziges Mal
	 * vor. Ohne Schmied kein Eisen, und ohne Eisen keine Mühle, Bäckerei, Schneiderei und
	 * Alchemistenküche (Punkt 103) — die städtische Krücke sperrte die halbe Wirtschaft.
	 *
	 * Dieselbe Verwechslung wie in Punkt 86, nur eine Tür weiter: Eine Krücke soll einen
	 * Beruf überbrücken, bis ihn jemand ergreift, und ihn nicht besetzen.
	 */
	it('lässt sich von einem städtischen Betrieb nicht abhalten', async () => {
		// `KOMMT` würfelt null, `skillToBring` nimmt also das erste fehlende Handwerk der
		// Liste — und das ist `SMITHING`, obwohl die Stadt eine Schmiede hat.
		const angekommen = await migrationService.admitNewcomers(stadtId, JETZT, KOMMT);

		expect(angekommen?.skill).toBe('SMITHING');
	});

	it('bringt aber kein Handwerk mit, das ein Bürger schon ausübt', async () => {
		// Ein Betrieb in Bürgerhand versorgt die Stadt wirklich — dann lohnt ein zweiter
		// desselben Gewerks nicht, und der Nächste bringt etwas anderes mit.
		const grundstueck = (await Plot.findOne({ where: { RegionId: stadtId } }))!;
		const buerger = (await Character.findOne({ where: { role: 'NPC' } }))!;
		await Building.create({
			id: randomUUID(),
			name: 'Schmiede eines Bürgers',
			optionId: SCHMIEDE,
			lastConditionTick: JETZT,
			PlotId: grundstueck.dataValues.id,
			ownerType: 'CHARACTER',
			OwnerCharacterId: buerger.dataValues.id
		});

		const angekommen = await migrationService.admitNewcomers(stadtId, JETZT, KOMMT);

		expect(angekommen?.skill).not.toBe('SMITHING');
	});

	it('bringt Wegzehrung mit (5.103)', async () => {
		// **Punkt 85.** Seit es keinen Kornspeicher mehr gibt, soll niemand in seiner ersten
		// Woche verhungern, nur weil er noch keine Arbeit gefunden hat.
		const angekommen = await migrationService.admitNewcomers(stadtId, JETZT, KOMMT);

		const brot = await Inventory.findOne({
			where: { CharacterId: angekommen!.characterId, itemId: 'BREAD' }
		});
		expect(brot?.dataValues.quantity).toBe(ARRIVAL_PROVISIONS);
		expect(ARRIVAL_PROVISIONS).toBeLessThanOrEqual(CARRIED_CAPACITY);
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
