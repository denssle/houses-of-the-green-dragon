import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { Skill } from '$lib/db/model/skill';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as employmentService from '$lib/server/service/employmentService';
import * as skillService from '$lib/server/service/skillService';
import * as tradeService from '$lib/server/service/tradeService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 5.31: **die beiden Enden einer Anstellung.**
 *
 * Zwei Dinge fehlten (Punkt 33): Der Arbeitgeber wurde niemanden wieder los, und eine
 * Schicht ohne Material kostete den Angestellten den Tag. Beides betrifft dieselbe Frage
 * — wer trägt, was schiefgeht? — und beide Male lautet die Antwort ab hier: der, der es
 * zu verantworten hat.
 */

const JETZT = 10_000;
/** Die Zimmerei: zwei Stämme hinein, drei Bretter heraus. */
const ZIMMEREI = 9;
let stadtId: string;

async function person(name: string, geld: number = 100): Promise<string> {
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
		money: geld,
		RegionId: stadtId
	});
	return id;
}

/** Eine Zimmerei auf eigenem Grund. */
async function zimmerei(besitzerId: string): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Sägegasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: 'Zimmerei',
		optionId: ZIMMEREI,
		level: 1,
		condition: 100,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	return id;
}

async function geld(characterId: string): Promise<number> {
	return (await Character.findByPk(characterId))!.dataValues.money;
}

async function imLager(buildingId: string, itemId: string): Promise<number> {
	const lager = await tradeService.getBuildingStock(buildingId);
	return lager.find((posten) => posten.itemId === itemId)?.quantity ?? 0;
}

/** Meister und Knecht, die Stelle bereits angetreten. */
async function angestellt(lohn: number = 3): Promise<{
	meister: string;
	knecht: string;
	betrieb: string;
}> {
	const meister = await person('Meisterin', 500);
	const knecht = await person('Knecht', 0);
	const betrieb = await zimmerei(meister);

	await employmentService.offerJob(meister, betrieb, lohn);
	await employmentService.takeJob(knecht, betrieb);
	return { meister, knecht, betrieb };
}

describe('Anstellung', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Employment.destroy({ where: {} });
		await Building.destroy({ where: { optionId: ZIMMEREI } });
		await Skill.destroy({ where: {} });
		await Character.destroy({ where: { role: 'PLAYER' } });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	describe('eine Schicht ohne Material', () => {
		/**
		 * **Der Kern von 5.31.** Vorher scheiterte die Schicht an einem leeren Lager, und
		 * der Angestellte hatte umsonst angetreten — für ein Versäumnis, das nicht seines
		 * war.
		 */
		it('wird trotzdem bezahlt', async () => {
			const { meister, knecht } = await angestellt(3);

			const schicht = await employmentService.workForEmployer(knecht);

			expect(schicht).toMatchObject({ ok: true, wage: 3, produced: 0, idle: true });
			expect(await geld(knecht)).toBe(3);
			expect(await geld(meister)).toBe(497);
		});

		it('kostet den Angestellten trotzdem seine Aktionspunkte', async () => {
			// Sonst wäre der Leerlauf ein Geschenk: Lohn, ohne den Tag herzugeben.
			const { knecht } = await angestellt();

			await employmentService.workForEmployer(knecht);

			expect((await Character.findByPk(knecht))!.dataValues.actionPoints).toBe(47);
		});

		it('bringt nichts hervor und lehrt nichts', async () => {
			// Übung braucht etwas unter den Händen. Wer den Tag in einer leeren Werkstatt
			// steht, wird kein besserer Zimmermann.
			const { knecht, betrieb } = await angestellt();

			await employmentService.workForEmployer(knecht);

			expect(await imLager(betrieb, 'PLANK')).toBe(0);
			expect(await skillService.getSkills(knecht)).toEqual([]);
		});

		it('lässt bei leerer Kasse weiterhin gar nichts geschehen', async () => {
			// Der Unterschied, um den es geht: Dort fehlt die Arbeit, hier fehlt der Lohn.
			// Nur eines davon kann der Angestellte am Abend in der Hand halten.
			const { meister, knecht } = await angestellt(3);
			await Character.update({ money: 0 }, { where: { id: meister } });

			expect(await employmentService.workForEmployer(knecht)).toEqual({
				ok: false,
				reason: 'EMPLOYER_BROKE'
			});
			expect((await Character.findByPk(knecht))!.dataValues.actionPoints).toBe(48);
		});

		it('arbeitet richtig, sobald Material da ist', async () => {
			const { knecht, betrieb } = await angestellt();
			await sequelize.transaction((t) => tradeService.changeBuildingStock(betrieb, 'WOOD', 10, t));

			const schicht = await employmentService.workForEmployer(knecht);

			expect(schicht).toMatchObject({ ok: true, idle: false });
			expect(await imLager(betrieb, 'PLANK')).toBeGreaterThan(0);
			expect(await imLager(betrieb, 'WOOD')).toBe(8);
		});
	});

	describe('entlassen', () => {
		it('beendet die Stelle', async () => {
			const { meister, knecht, betrieb } = await angestellt();

			expect(await employmentService.dismiss(meister, betrieb, knecht)).toEqual({ ok: true });

			expect(await employmentService.getJobOf(knecht)).toBeUndefined();
			expect(await employmentService.getStaff(betrieb)).toEqual([]);
		});

		it('steht in der Chronik — und zwar als Entlassung', async () => {
			// Wer geht, ist eine andere Geschichte als wer gehen muss. Bis 5.31 schrieb
			// beides niemand mit: `JOB_ENDED` gab es, gerufen wurde es nie.
			const { meister, knecht, betrieb } = await angestellt();

			await employmentService.dismiss(meister, betrieb, knecht);

			const seins = await chronicleService.getChronicle({ characterId: knecht });
			const ende = seins.find((eintrag) => eintrag.kind === 'JOB_ENDED');
			expect(ende?.detail).toBe('DISMISSED');
		});

		it('schreibt auch die Kündigung mit', async () => {
			const { knecht } = await angestellt();

			await employmentService.endEmployment(knecht);

			const seins = await chronicleService.getChronicle({ characterId: knecht });
			expect(seins.find((eintrag) => eintrag.kind === 'JOB_ENDED')?.detail).toBe('QUIT');
		});

		it('geht nur den an, dem der Betrieb gehört', async () => {
			// Sonst räumte ein Fremder die Werkstatt des Nachbarn leer.
			const { knecht, betrieb } = await angestellt();
			const fremder = await person('Fremder');

			expect(await employmentService.dismiss(fremder, betrieb, knecht)).toEqual({
				ok: false,
				reason: 'PLOT_NOT_OWNED'
			});
			expect(await employmentService.getJobOf(knecht)).toBeDefined();
		});

		it('trifft niemanden, der anderswo arbeitet', async () => {
			// Die Anstellung wird über Person **und** Gebäude gesucht: Ein Kennungswurf
			// darf nicht den Knecht eines anderen Hauses treffen.
			const { knecht } = await angestellt();
			const nachbar = await person('Nachbarin', 500);
			const anderer = await zimmerei(nachbar);

			expect(await employmentService.dismiss(nachbar, anderer, knecht)).toEqual({
				ok: false,
				reason: 'NO_JOB_OFFERED'
			});
			expect(await employmentService.getJobOf(knecht)).toBeDefined();
		});
	});
});
