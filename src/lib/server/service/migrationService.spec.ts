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
import { arrivalGender } from '$lib/game/migration.logic';

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

	describe('als Familie (0.9.0)', () => {
		/** Ein Würfel: erst die gegebenen Werte, danach 0.5. */
		const folge =
			(...werte: number[]) =>
			() =>
				werte.length > 0 ? werte.shift()! : 0.5;

		it('kommt mit drei Generationen, verheiratet und verwandt, unter einem Haus', async () => {
			// Kommt (0), Großfamilie (0.95), drei Kinder (0.99), zwei Großeltern (0.99).
			const ankunft = (await migrationService.admitNewcomers(
				stadtId,
				JETZT,
				folge(0, 0.95, 0.99, 0.99)
			))!;

			expect(ankunft.form).toBe('GROSSFAMILIE');
			expect(ankunft.members).toHaveLength(7);

			const leute = await Character.findAll({
				where: { id: ankunft.members.map((m) => m.characterId) }
			});
			const rolle = (r: string) =>
				leute.find(
					(p) => p.dataValues.id === ankunft.members.find((m) => m.rolle === r)!.characterId
				)!.dataValues;
			const vater = rolle('HAUPT');
			const mutter = rolle('PARTNER');
			const opa = rolle('GROSSVATER');
			const oma = rolle('GROSSMUTTER');

			// Ein Haus für alle.
			expect(new Set(leute.map((p) => p.dataValues.DynastyId)).size).toBe(1);
			// Verheiratet, beide Paare.
			expect(vater.spouseId).toBe(mutter.id);
			expect(mutter.spouseId).toBe(vater.id);
			expect(opa.spouseId).toBe(oma.id);
			// Der Vater ist das Kind der Großeltern — damit greifen Erbe und Vormundschaft.
			expect(vater.fatherId).toBe(opa.id);
			expect(vater.motherId).toBe(oma.id);

			const kinder = leute.filter((p) => p.dataValues.fatherId === vater.id);
			expect(kinder).toHaveLength(3);
			for (const kind of kinder) {
				expect(kind.dataValues.motherId).toBe(mutter.id);
				// Kinder ziehen sofort mit ein und bringen kein eigenes Handwerk mit.
				expect(kind.dataValues.HomeBuildingId).not.toBeNull();
				expect(kind.dataValues.money).toBe(0);
				expect(await Skill.count({ where: { CharacterId: kind.dataValues.id } })).toBe(0);
			}
			// Jeder Erwachsene bringt ein Handwerk mit.
			for (const erwachsen of [vater, mutter, opa, oma]) {
				expect(await Skill.count({ where: { CharacterId: erwachsen.id } })).toBe(1);
			}
		});

		it('schickt eine Frau, wenn ledige Männer warten und keine Frau', async () => {
			// Zwei ledige Männer im passenden Alter.
			for (const name of ['Ledig1', 'Ledig2']) {
				await Character.create({
					id: randomUUID(),
					firstName: name,
					role: 'NPC',
					gender: 'MALE',
					birthTick: JETZT - yearsToTicks(30),
					lastTickProcessed: JETZT,
					satiety: 100,
					lastNeedTick: JETZT,
					actionPoints: 0,
					money: 0,
					RegionId: stadtId,
					arrivedTick: JETZT - 1
				});
			}
			const ledige = await migrationService.ledigeErwachsene(stadtId, JETZT);
			expect(ledige.maenner).toBeGreaterThan(ledige.frauen);
			// Allein (0.1), Geschlecht 0.7: unter der Frauenchance, falls die Männer überwiegen.
			const ankunft = (await migrationService.admitNewcomers(stadtId, JETZT, folge(0, 0.1, 0.7)))!;
			const person = (await Character.findByPk(ankunft.characterId))!.dataValues;

			expect(ankunft.form).toBe('ALLEIN');
			// Derselbe Wurf, dieselben Ledigen — die Ankunft folgt dem Heiratsmarkt.
			expect(person.gender).toBe(arrivalGender(ledige.maenner, ledige.frauen, 0.7));
		});
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
