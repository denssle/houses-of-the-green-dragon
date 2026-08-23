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
import * as npcService from '$lib/server/service/npcService';
import * as skillService from '$lib/server/service/skillService';

/**
 * Die Eisenkette (Punkt 86).
 *
 * **Was hier bewiesen wird, konnte der Messlauf nicht beweisen.** `measure()` würfelte
 * seine Welt bis 5.64 frei; zwei Läufe sind deshalb zwei verschiedene Städte, und ein
 * Vorher-Nachher-Vergleich daran ist keiner. Diese Datei stellt stattdessen **eine**
 * Ausgangslage her und fragt, was aus ihr wird.
 *
 * **Die Lage.** Die Startwelt trägt eine städtische Schmiede. Sie ist das einzige Rezept,
 * das `IRON` erzeugt — und Eisen steht im Baumaterial jeder Werkstatt außer Zimmerei,
 * Steinmetzhütte und Schmiede. Solange sie das Handwerk als „vorhanden" gelten ließ, baute
 * kein NPC je eine eigene, es entstand nie ein Stück Eisen, und Mühle, Bäckerei,
 * Schneiderei und Alchemistenküche waren dauerhaft unbaubar.
 *
 * Geprüft wird deshalb nicht die Entscheidung allein (das tut `workshopChoice.spec.ts`),
 * sondern der ganze Weg: **bauen, herstellen, aushängen.** Erst wenn Eisen am Markt liegt,
 * ist die Kette offen.
 */

const JETZT = 10_000;
const SCHMIEDE = 2;
let stadtId: string;
let schmiedId: string;

/**
 * Ein Eigenbrötler mit Geld, Können und einem Bauplatz.
 *
 * **Jede Anlage hier hat einen Grund**, und keiner davon ist Bequemlichkeit:
 *
 * - `sociability: -100` hält ihn vom Werben ab. Zugehörigkeit steht über der Entfaltung;
 *   ein Freier verbrächte seine Punkte sonst am Brautwerben statt am Bau.
 * - `ambition`/`diligence` über der Schwelle: Nur wen sein Wesen dazu drängt, unternimmt
 *   etwas (`isEnterprising`).
 * - `greed: 0` macht die Rücklage berechenbar — neun Mahlzeiten, also 36 Münzen, die er
 *   nicht anfasst. Mit 400 in der Tasche bleiben 364 für eine Schmiede zu 250.
 * - Das Grundstück gehört ihm schon: Ob einer **Bauland kaufen** kann, ist Punkt 87 und
 *   nicht diese Frage.
 */
async function schmied(): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: 'Reinhard',
		role: 'NPC',
		gender: 'MALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 400,
		RegionId: stadtId,
		sociability: -100,
		ambition: 60,
		diligence: 60,
		greed: 0
	});
	await skillService.addPractice(id, 'SMITHING', 500);

	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: 'Schmiedgasse 1',
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: id
	});
	return id;
}

async function ticken(anzahl: number): Promise<void> {
	const start: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
	for (let i = 0; i < anzahl; i++) {
		await npcService.actForNpcs(start + i);
		await World.update({ currentTick: start + i + 1 }, { where: { id: WORLD_ID } });
	}
}

describe('Die Eisenkette', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld(seededRoll(86));
		stadtId = await findStartRegionId();

		// **Allein in der Stadt.** Die Gründer würfen sonst mit: Sie kaufen dasselbe
		// Bauland, nehmen dieselbe Arbeit und verschieben die Entscheidung, um die es hier
		// geht. Was sie tun, prüfen die Selbsterhaltungstests.
		await Character.destroy({ where: { role: 'NPC' } });
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		schmiedId = await schmied();

		// **In zwei Abschnitten, und das hat einen Grund.** Erst bauen, dann das Erz — wer
		// vor dem Bau Erz besitzt, verkauft es: Für einen ohne Werkstatt ist es Überschuss,
		// und `marktUeberschuss` hält nur die Zutaten eines Betriebs zurück, den es schon
		// gibt. Im Versuch hat er es im zweiten Tick am Markt ausgehängt und stand danach
		// mit leerer Esse da (festgehalten als Punkt 93).
		await ticken(4);
		await Inventory.create({ CharacterId: schmiedId, itemId: 'ORE', quantity: 6 });
		await ticken(4);
	}, 120_000);

	it('lässt neben der städtischen eine eigene Schmiede entstehen', async () => {
		// Vor 5.65 war das unmöglich: `fehlendeWerkstatt` sah die städtische und hielt das
		// Handwerk für versorgt.
		const eigene = await Building.findOne({
			where: { optionId: SCHMIEDE, ownerType: 'CHARACTER' }
		});

		expect(eigene?.dataValues.OwnerCharacterId).toBe(schmiedId);
	});

	it('und in ihr entsteht Eisen', async () => {
		// Der eigentliche Befund von Punkt 86: Bis hierher gab es in dieser Welt kein
		// einziges Stück Eisen — und ohne Eisen kein Baumaterial für Mühle, Bäckerei,
		// Schneiderei und Alchemistenküche.
		const angebot = await ShopOffer.findOne({ where: { itemId: 'IRON' } });

		expect(angebot).not.toBeNull();
		expect(angebot!.dataValues.quantity).toBeGreaterThan(0);
	});
});
