import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { User } from '$lib/db/model/user';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.2 gegen die Datenbank. Der Kern: Ein Todesfall darf keine Münze und kein
 * Grundstück verlieren — und kein Haus versehentlich auslöschen.
 */

const JETZT = 10_000;
let stadtId: string;
let userId: string;

/** Legt einen Charakter an. Alter in Jahren, gerechnet ab `JETZT`. */
async function person(
	name: string,
	alter: number,
	extras: Record<string, unknown> = {}
): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(alter),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 0,
		money: 0,
		RegionId: stadtId,
		...extras
	});
	return id;
}

async function stand(id: string) {
	const gefunden = await Character.findByPk(id);
	return gefunden!.dataValues;
}

async function stadtkasse(): Promise<number> {
	const gefunden = await Region.findByPk(stadtId);
	return gefunden!.dataValues.treasury!;
}

/** Ein Grundstück, das jemandem gehört. */
async function grundstueck(besitzerId: string): Promise<string> {
	const id = randomUUID();
	await Plot.create({
		id,
		address: `Erbgasse ${id.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	return id;
}

describe('Sterben und Erben', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
		userId = randomUUID();
		await User.create({ id: userId, nickname: 'erbe-test', password: 'egal' });
	});

	beforeEach(async () => {
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await Plot.destroy({ where: { ownerType: 'CHARACTER' } });
		await Character.destroy({ where: {} });
		await Dynasty.destroy({ where: {} });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	describe('der Durchlauf', () => {
		it('lässt die Jungen in Ruhe, auch beim schlechtesten Wurf', async () => {
			const jung = await person('Jung', 30);

			const tote = await lifecycleService.reapTheDead(JETZT, () => 0);

			expect(tote).toHaveLength(0);
			expect((await stand(jung)).deathTick).toBeNull();
		});

		it('holt den Greis beim schlechtesten Wurf', async () => {
			const greis = await person('Greis', 90);

			const tote = await lifecycleService.reapTheDead(JETZT, () => 0);

			expect(tote).toHaveLength(1);
			expect(tote[0].age).toBe(90);
			expect((await stand(greis)).deathTick).toBe(JETZT);
		});

		it('verschont beim besten Wurf jeden', async () => {
			const greis = await person('Greis', 90);

			await lifecycleService.reapTheDead(JETZT, () => 0.999999);

			expect((await stand(greis)).deathTick).toBeNull();
		});

		it('rührt Tote nicht noch einmal an', async () => {
			const greis = await person('Greis', 90, { deathTick: JETZT - 100, money: 50 });

			const tote = await lifecycleService.reapTheDead(JETZT, () => 0);

			expect(tote).toHaveLength(0);
			expect((await stand(greis)).money).toBe(50);
			expect((await stand(greis)).deathTick).toBe(JETZT - 100);
		});
	});

	describe('mit Kindern', () => {
		it('gibt dem benannten Erben Geld und Boden', async () => {
			const vater = await person('Vater', 80, { money: 400 });
			const anna = await person('Anna', 30, { motherId: vater });
			const bernd = await person('Bernd', 25, { motherId: vater });
			await Character.update({ heirId: bernd }, { where: { id: vater } });
			const acker = await grundstueck(vater);

			await lifecycleService.die(vater, JETZT);

			// 25 % von 400 sind 100 für das eine Geschwisterkind.
			expect((await stand(bernd)).money).toBe(300);
			expect((await stand(anna)).money).toBe(100);
			expect((await stand(vater)).money).toBe(0);
			expect((await Plot.findByPk(acker))!.dataValues.OwnerCharacterId).toBe(bernd);
			expect(await stadtkasse()).toBe(0);
		});

		it('nimmt ohne Benennung das älteste volljährige Kind', async () => {
			const vater = await person('Vater', 80, { money: 100 });
			const anna = await person('Anna', 30, { fatherId: vater });
			await person('Bernd', 25, { fatherId: vater });

			const fall = await lifecycleService.die(vater, JETZT);

			expect(fall?.heirId).toBe(anna);
		});

		it('übergeht einen Benannten, der schon tot ist', async () => {
			const vater = await person('Vater', 80, { money: 100 });
			const anna = await person('Anna', 30, { motherId: vater });
			const bernd = await person('Bernd', 25, { motherId: vater, deathTick: JETZT - 10 });
			await Character.update({ heirId: bernd }, { where: { id: vater } });

			const fall = await lifecycleService.die(vater, JETZT);

			expect(fall?.heirId).toBe(anna);
			// Der Tote bekommt auch keinen Geschwisteranteil.
			expect((await stand(bernd)).money).toBe(0);
		});

		it('führt das Haus mit dem Erben fort', async () => {
			const hausId = randomUUID();
			await Dynasty.create({ id: hausId, name: 'Haus Adler', UserId: userId, foundedAtTick: 0 });
			const vater = await person('Vater', 80, { role: 'PLAYER', DynastyId: hausId });
			const anna = await person('Anna', 30, { motherId: vater, DynastyId: hausId });

			const fall = await lifecycleService.die(vater, JETZT);

			expect(fall?.extinctDynastyId).toBeNull();
			expect((await stand(anna)).role).toBe('PLAYER');
			expect((await Dynasty.findByPk(hausId))!.dataValues.isExtinct).toBe(false);
		});
	});

	describe('ohne Erben', () => {
		it('gibt Geld und Besitz an die Stadt', async () => {
			const einsam = await person('Einsam', 80, { money: 250 });
			const acker = await grundstueck(einsam);

			await lifecycleService.die(einsam, JETZT);

			expect(await stadtkasse()).toBe(250);
			const danach = (await Plot.findByPk(acker))!.dataValues;
			expect(danach.ownerType).toBe('CITY');
			expect(danach.OwnerCharacterId).toBeNull();
		});

		it('macht aus vergebenem Bauland kein nie vergebenes', async () => {
			// `NONE` hieße „die Stadt hat es nie hergegeben“ und stellte das Grundstück
			// wieder zum Erstverkauf — für 40 Münzen, obwohl darauf ein Haus steht.
			const einsam = await person('Einsam', 80);
			const acker = await grundstueck(einsam);

			await lifecycleService.die(einsam, JETZT);

			expect((await Plot.findByPk(acker))!.dataValues.ownerType).not.toBe('NONE');
		});

		it('lässt das Haus erlöschen', async () => {
			const hausId = randomUUID();
			await Dynasty.create({ id: hausId, name: 'Haus Ende', UserId: userId, foundedAtTick: 0 });
			const letzter = await person('Letzter', 80, { role: 'PLAYER', DynastyId: hausId });

			const fall = await lifecycleService.die(letzter, JETZT);

			expect(fall?.extinctDynastyId).toBe(hausId);
			const haus = (await Dynasty.findByPk(hausId))!.dataValues;
			expect(haus.isExtinct).toBe(true);
			expect(haus.extinctAtTick).toBe(JETZT);
		});

		it('lässt auch ein Haus ohne Spieler erlöschen', async () => {
			// Seit 5.10 gehört jeder zu einem Haus, auch die NPC-Familien. Dieselbe Regel
			// für alle: Wer ohne Erben stirbt, dessen Linie endet — ein Nachname, den
			// niemand mehr trägt, gehört zu einer Familie, die es nicht mehr gibt.
			const hausId = randomUUID();
			await Dynasty.create({ id: hausId, name: 'Töpfer', UserId: null, foundedAtTick: 0 });
			const letzte = await person('Letzte', 80, { DynastyId: hausId });

			const fall = await lifecycleService.die(letzte, JETZT);

			expect(fall?.extinctDynastyId).toBe(hausId);
			expect((await Dynasty.findByPk(hausId))!.dataValues.isExtinct).toBe(true);
		});

		it('lässt ein NPC-Haus am Leben, solange jemand darin lebt', async () => {
			const hausId = randomUUID();
			await Dynasty.create({ id: hausId, name: 'Seiler', UserId: null, foundedAtTick: 0 });
			await person('Tochter', 25, { DynastyId: hausId });
			const mutter = await person('Mutter', 80, { DynastyId: hausId });

			const fall = await lifecycleService.die(mutter, JETZT);

			expect(fall?.extinctDynastyId).toBeNull();
			expect((await Dynasty.findByPk(hausId))!.dataValues.isExtinct).toBe(false);
		});

		it('lässt ein Haus am Leben, wenn ein NPC des Hauses stirbt', async () => {
			// Nur der Tod des **gespielten** Charakters entscheidet über das Haus. Stürbe
			// jedes kinderlose Geschwisterkind die Dynastie mit, wäre sie nicht zu halten.
			const hausId = randomUUID();
			await Dynasty.create({ id: hausId, name: 'Haus Bestand', UserId: userId, foundedAtTick: 0 });
			await person('Spieler', 30, { role: 'PLAYER', DynastyId: hausId });
			const onkel = await person('Onkel', 80, { DynastyId: hausId });

			const fall = await lifecycleService.die(onkel, JETZT);

			expect(fall?.extinctDynastyId).toBeNull();
			expect((await Dynasty.findByPk(hausId))!.dataValues.isExtinct).toBe(false);
		});
	});

	describe('der überlebende Ehepartner', () => {
		it('bekommt seinen Anteil und ist wieder frei', async () => {
			// Die Ehe endete bis 5.1 gar nicht: `spouseId` blieb auf einen Toten stehen.
			// Damit konnte die Witwe nicht wieder heiraten — und trotzdem noch empfangen.
			const witwe = await person('Witwe', 50);
			const mann = await person('Mann', 70, { money: 400, spouseId: witwe });
			await Character.update({ spouseId: mann }, { where: { id: witwe } });

			await lifecycleService.die(mann, JETZT);

			const danach = await stand(witwe);
			expect(danach.money).toBe(100);
			expect(danach.spouseId).toBeNull();
		});

		it('behält seinen Anteil, auch wenn das Haus erlischt', async () => {
			const witwe = await person('Witwe', 50);
			const mann = await person('Mann', 80, { money: 400, spouseId: witwe });
			await Character.update({ spouseId: mann }, { where: { id: witwe } });

			await lifecycleService.die(mann, JETZT);

			expect((await stand(witwe)).money).toBe(100);
			// Der Rest fällt an die Stadt: Ein Haus endet, ein Mensch nicht.
			expect(await stadtkasse()).toBe(300);
		});

		it('geht leer aus, wenn er den Erblasser nicht überlebt hat', async () => {
			// Sterben beide im selben Durchlauf, ist der Zweite kein Hinterbliebener.
			const zuerst = await person('Zuerst', 80);
			const mann = await person('Mann', 80, { money: 400, spouseId: zuerst });
			await Character.update({ spouseId: mann }, { where: { id: zuerst } });
			await lifecycleService.die(zuerst, JETZT);

			await lifecycleService.die(mann, JETZT);

			expect((await stand(zuerst)).money).toBe(0);
			expect(await stadtkasse()).toBe(400);
		});

		it('nimmt dem Erben nur den Vorwegabzug', async () => {
			const witwe = await person('Witwe', 50);
			const vater = await person('Vater', 70, { money: 400, spouseId: witwe });
			await Character.update({ spouseId: vater }, { where: { id: witwe } });
			const kind = await person('Kind', 20, { motherId: vater });

			await lifecycleService.die(vater, JETZT);

			expect((await stand(witwe)).money).toBe(100);
			expect((await stand(kind)).money).toBe(300);
		});
	});

	describe('einem Kind seinen Namen geben', () => {
		it('nimmt einen neuen Namen an', async () => {
			const vater = await person('Vater', 40);
			const kind = await person('Namenlos', 5, { motherId: vater });

			const ergebnis = await lifecycleService.renameChild(vater, kind, '  Adelbert ', JETZT);

			expect(ergebnis).toEqual({ ok: true, name: 'Adelbert' });
			expect((await stand(kind)).firstName).toBe('Adelbert');
		});

		it('lässt fremde Kinder in Ruhe', async () => {
			const fremder = await person('Fremder', 40);
			const vater = await person('Vater', 40);
			const kind = await person('Kind', 5, { motherId: vater });

			const ergebnis = await lifecycleService.renameChild(fremder, kind, 'Meins', JETZT);

			expect(ergebnis).toEqual({ ok: false, reason: 'NOT_YOURS' });
			expect((await stand(kind)).firstName).toBe('Kind');
		});

		it('hört mit der Volljährigkeit auf', async () => {
			const vater = await person('Vater', 50);
			const kind = await person('Erwachsen', 16, { motherId: vater });

			const ergebnis = await lifecycleService.renameChild(vater, kind, 'Anders', JETZT);

			expect(ergebnis).toEqual({ ok: false, reason: 'TOO_OLD' });
			expect((await stand(kind)).firstName).toBe('Erwachsen');
		});

		it('lässt zwei Geschwister nicht gleich heißen', async () => {
			const vater = await person('Vater', 40);
			await person('Alheid', 8, { motherId: vater });
			const zweites = await person('Zweites', 5, { motherId: vater });

			const ergebnis = await lifecycleService.renameChild(vater, zweites, 'alheid', JETZT);

			expect(ergebnis).toEqual({ ok: false, reason: 'TAKEN' });
		});

		it('lässt ein Kind seinen eigenen Namen behalten', async () => {
			// Das Kind selbst zählt nicht zu den belegten Namen — sonst ließe sich eine
			// bloße Änderung der Schreibweise nie bestätigen.
			const vater = await person('Vater', 40);
			const kind = await person('Alheid', 5, { motherId: vater });

			expect(await lifecycleService.renameChild(vater, kind, 'Alheid', JETZT)).toEqual({
				ok: true,
				name: 'Alheid'
			});
		});
	});

	describe('die Benennung', () => {
		it('nimmt ein eigenes lebendes Kind an', async () => {
			const vater = await person('Vater', 60);
			const anna = await person('Anna', 20, { motherId: vater });

			expect(await lifecycleService.designateHeir(vater, anna)).toBe(true);
			expect((await stand(vater)).heirId).toBe(anna);
		});

		it('weist einen Fremden ab', async () => {
			const vater = await person('Vater', 60);
			const fremder = await person('Fremder', 20);

			expect(await lifecycleService.designateHeir(vater, fremder)).toBe(false);
			expect((await stand(vater)).heirId).toBeNull();
		});

		it('weist ein totes Kind ab', async () => {
			const vater = await person('Vater', 60);
			const tot = await person('Tot', 20, { motherId: vater, deathTick: JETZT - 5 });

			expect(await lifecycleService.designateHeir(vater, tot)).toBe(false);
		});

		it('lässt sich zurücknehmen', async () => {
			const vater = await person('Vater', 60);
			const anna = await person('Anna', 20, { motherId: vater });
			await lifecycleService.designateHeir(vater, anna);

			expect(await lifecycleService.designateHeir(vater, null)).toBe(true);
			expect((await stand(vater)).heirId).toBeNull();
		});
	});
});
