import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Plot } from '$lib/db/model/plot';
import { ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import { yearsToTicks } from '$lib/game/time';
import type { IdleReason } from '$lib/game/npc.logic';
import type { SkillType } from '$lib/game/skill.logic';
import * as buildingService from '$lib/server/service/buildingService';
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
const MARKTPLATZ = 6;
const ZIMMEREI = 9;
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

		/**
		 * **Bis 5.87 stand hier `toBe(0)`**: Dreißig Ticks, achthundert Münzen, ein leeres
		 * Grundstück — und kein Stein wurde aufeinandergesetzt. Seit die Wahl das
		 * Unbeschaffbare hintanstellt (Punkt 110), baut sie.
		 */
		it('baut sie die Zimmerei — die Grundlage, nicht ihr Handwerk', async () => {
			const werkstatt = await Building.findOne({
				where: { ownerType: 'CHARACTER', OwnerCharacterId: baeckerinId, optionId: ZIMMEREI }
			});

			// **Nicht die Mühle**, obwohl sie mahlen kann und beides bezahlen könnte: Die
			// Mühle braucht Quader, die es nirgends gibt. Also nimmt sie, was ohne
			// auskommt — und die Zimmerei ist davon die billigste. Bretter sind die erste
			// Stufe jeder Kette; wer sie sägt, wird gebraucht.
			expect(werkstatt).not.toBeNull();
		});

		it('und gibt dafür Geld aus', async () => {
			expect((await Character.findByPk(baeckerinId))!.dataValues.money).toBeLessThan(800);
		});

		it('und steht nicht mehr vor einem Vorhaben ohne Preis', async () => {
			// **Hier stand `toBeGreaterThan(25)`, und das war der Befund.** Sie hatte etwas
			// vor (Werkstatt, sie ist unternehmend, sie hat keine), aber `savingsTarget`
			// ergab `null`: Es fehlte das Werkstattmaterial, und `workshopMaterialPrice`
			// war `null`, weil es in dieser Welt niemand anbot. Dreißig Ticks lang.
			//
			// Das war die Zahl aus Punkt 93 an einem einzigen Fall, und sie belegte dort
			// die erste der beiden Lesarten: Die Stadt liefert wirklich nicht, was ihre
			// Einwohner vorhaben. Sie tut es immer noch nicht — aber die Wahl verlangt es
			// jetzt auch nicht mehr von ihr.
			expect(gruende.GOAL_UNREACHABLE ?? 0).toBe(0);
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

	/**
	 * **Und die Frage dahinter** (5.86, Punkte 85, 103): Warum liegen Quader nirgends aus?
	 *
	 * Die Steinmetzhütte ist eine der drei Werkstätten, die **kein Baumaterial verlangen**
	 * — sie stellt es selbst her (`producesBuildingMaterial`). Wer sie baut, löst die
	 * Sperre für die ganze Stadt: ohne Quader keine Mühle, kein Backhaus, keine
	 * Schneiderei, keine Alchemistenküche.
	 *
	 * **Der Befund von Punkt 110 war, dass sie fast nie vorgeschlagen wurde.**
	 * `fehlendeWerkstatt` sortierte nach Können und bei gleichem Können nach Preis: Die
	 * Steinmetzhütte verlangt `MINING` und kostet 200, die Schneiderei `TAILORING` und
	 * 190. Wer beides nicht gelernt hatte — und das sind fast alle, sobald die Zimmerei
	 * vergeben ist —, bekam die zehn Münzen billigere und stand damit vor Quadern, die es
	 * nirgends gab.
	 *
	 * **Seit 5.87 rückt vor, was ohne Material auskommt**, sobald das Material des
	 * Erstplatzierten nirgends zu haben ist. Die Tests zeigen beide Richtungen: die
	 * Sackgasse ohne Quader am Markt, und dass die Regel sich von selbst zurückzieht,
	 * sobald welche ausliegen.
	 */
	describe('welche Werkstatt einem vorgeschlagen wird', () => {
		let stadtId: string;
		let haeuser: Parameters<typeof npcService.fehlendeWerkstatt>[0];

		beforeAll(async () => {
			stadtId = await stadtOhneLeute();
			// Die Lage jedes Messlaufs: Die Zimmerei steht schon in Bürgerhand — sie ist
			// die billigste und wird deshalb überall zuerst gebaut.
			// **Nur die Häuser der Stadt** — was Charaktere früherer Blöcke gebaut haben,
			// bleibt in derselben Datenbank stehen und würde hier ein Handwerk belegen,
			// das für diese Frage frei sein soll.
			haeuser = [
				...(await buildingService.getBuildingsInRegion(stadtId, JETZT)).filter(
					(haus) => haus.ownerType !== 'CHARACTER'
				),
				{ id: 'zimmerei', ownerType: 'CHARACTER', optionId: ZIMMEREI, level: 1, condition: 100 }
			] as typeof haeuser;
		}, 300_000);

		/**
		 * Baustoff ans Schild — von einem Fremden, damit es nicht das eigene Angebot ist.
		 *
		 * Die Angebote werden hier von Hand gesetzt statt über `placeOffer`: Gefragt ist,
		 * ob die **Wahl** den Markt sieht, nicht ob ein Verkäufer Standgeld zahlen kann.
		 */
		async function marktMit(waren: Array<[string, number]>): Promise<void> {
			const haendlerId = randomUUID();
			await Character.create({
				id: haendlerId,
				firstName: 'Fahrende',
				role: 'NPC',
				gender: 'FEMALE',
				birthTick: JETZT - yearsToTicks(40),
				lastTickProcessed: JETZT,
				satiety: 100,
				lastNeedTick: JETZT,
				actionPoints: 48,
				money: 10,
				RegionId: stadtId
			});
			const marktplatz = (await buildingService.getBuildingsInRegion(stadtId, JETZT)).find(
				(haus) => haus.optionId === MARKTPLATZ
			)!;
			for (const [itemId, quantity] of waren) {
				await ShopOffer.create({
					id: randomUUID(),
					BuildingId: marktplatz.id,
					SellerCharacterId: haendlerId,
					itemId,
					quantity,
					pricePerUnit: 3
				});
			}
		}

		async function vorschlagFuer(skill?: SkillType): Promise<string | undefined> {
			const id = randomUUID();
			await Character.create({
				id,
				firstName: 'Zugezogene',
				role: 'NPC',
				gender: 'FEMALE',
				birthTick: JETZT - yearsToTicks(30),
				lastTickProcessed: JETZT,
				satiety: 100,
				lastNeedTick: JETZT,
				actionPoints: 48,
				money: 800,
				RegionId: stadtId,
				sociability: -100,
				ambition: 60,
				diligence: 60,
				greed: 0
			});
			if (skill) await skillService.addPractice(id, skill, 500);
			const wahl = await npcService.fehlendeWerkstatt(haeuser, id, stadtId);
			return wahl && buildingService.getBuildingOption(wahl.optionId)?.initialName;
		}

		it('ist für den, der nichts Einschlägiges kann, die Steinmetzhütte', async () => {
			// Vor 5.87 stand hier `Schneiderei` — zehn Münzen billiger und in dieser Welt
			// nicht zu bauen. Jetzt bekommt er das, was ohne Quader auskommt und sie
			// obendrein herstellt.
			expect(await vorschlagFuer()).toBe('Steinmetzhütte');
		});

		it('und auch für den Zimmerer, dessen Handwerk schon vergeben ist', async () => {
			// Der häufigste Fall der Messläufe: In den Listen steht bei fast jedem
			// `CONSTRUCTION`, weil daran jeder Bau übt. Die Zimmerei ist besetzt, also
			// zählt sein Können nicht mehr — und vor 5.87 schickte ihn der Preis in die
			// Sackgasse.
			expect(await vorschlagFuer('CONSTRUCTION')).toBe('Steinmetzhütte');
		});

		it('für den Bergmann ohnehin', async () => {
			// Er bekam sie immer schon, und daran ändert sich nichts: Sein Können steht
			// vor dem Preis. Vor 5.87 hing die ganze Wirtschaft daran, dass so einer
			// zuzieht.
			expect(await vorschlagFuer('MINING')).toBe('Steinmetzhütte');
		});

		it('und die Bäckerin bekommt weiter ihr Backhaus — sobald es Quader gibt', async () => {
			// **Die Gegenprobe, und die wichtigere Hälfte der Regel** (5.87): Sie greift
			// nur, solange das Material fehlt. Liegen Quader und Eisen am Markt, zählt
			// wieder das Können — sonst hätte die Stadt eine Steinmetzhütte und sonst nie
			// etwas anderes.
			expect(await vorschlagFuer('BAKING')).toBe('Steinmetzhütte');

			// **Und Brot**, seit 5.98: Fehlt es, ist die Bäckerei knapp, und Knappes geht dem
			// Können vor — dann bekäme jeder das Backhaus, auch der Müller. Hier geht es um das
			// Können, also ist die Stadt versorgt.
			await marktMit([
				['BLOCK', 40],
				['IRON', 40],
				['PLANK', 40],
				['BREAD', 1000]
			]);

			expect(await vorschlagFuer('BAKING')).toBe('Bäckerei');
			// Seit 5.96 mahlt, wer `MILLING` kann — nicht mehr jeder, der backt.
			expect(await vorschlagFuer('MILLING')).toBe('Mühle');
			expect(await vorschlagFuer()).toBe('Schneiderei');
		});
	});
});
