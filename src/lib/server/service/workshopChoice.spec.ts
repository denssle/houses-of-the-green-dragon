import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Skill } from '$lib/db/model/skill';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as npcService from '$lib/server/service/npcService';
import * as skillService from '$lib/server/service/skillService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Welche Werkstatt einer baut (5.19).
 *
 * **Vorher entschied allein der Preis** — und damit machte eine Preisliste die Reihenfolge
 * der Berufe: Nach der Zimmerei (180) kam die Schneiderei (190), dann erst die Mühle (200)
 * und das Backhaus (220). Eine Stadt nähte eher Kleider, als dass sie Brot buk, und
 * niemand konnte sagen warum.
 */

const JETZT = 10_000;
/**
 * Mühle (200) und Backhaus (220) sind beide teurer als Zimmerei (180) und Schneiderei
 * (190) — und teilen sich die Fertigkeit `BAKING`. Wer backen kann, kann auch mahlen.
 */
const MUEHLE = 4;
const BACKHAUS = 5;
const ZIMMEREI = 9;
let stadtId: string;

/**
 * Ein Haus **auf einem Grundstück** — ohne eines zählt es nicht zur Stadt.
 *
 * `getBuildingsInRegion` verbindet über den Plot, und zwar mit `required: true`. Ein
 * Gebäude ohne Grund taucht dort nicht auf und gilt der Werkstattwahl deshalb als
 * nicht vorhanden. Beim ersten Anlauf war genau das der Grund, warum ein Test grün war,
 * ohne etwas zu prüfen.
 */
async function hausMitGrund(optionId: number, besitzerId: string): Promise<void> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Handwerksgasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	await Building.create({
		id: randomUUID(),
		name: `Haus ${optionId}`,
		optionId,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
}

async function person(name: string): Promise<string> {
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
		money: 300,
		RegionId: stadtId
	});
	return id;
}

describe('Welche Werkstatt einer baut', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await Skill.destroy({ where: {} });
		await Character.destroy({ where: { role: 'NPC' } });
		// Die Startwelt trägt eine städtische Schmiede; alles andere fehlt.
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
	});

	it('nimmt ohne Können die billigste, die fehlt', async () => {
		// Das Verhalten vor 5.19 — und weiterhin richtig für den, der nichts gelernt hat:
		// Wer wenig hat, fängt klein an.
		const neuling = await person('Neuling');

		const wahl = await npcService.fehlendeWerkstatt(stadtId, neuling);

		expect(wahl?.optionId).toBe(ZIMMEREI);
	});

	it('baut das Handwerk, das er kann — auch wenn es teurer ist', async () => {
		// **Der Kern:** Wer sein Leben lang gebacken hat, baut sein Handwerk und keine
		// Zimmerei, obwohl die zwanzig Münzen billiger wäre. Können geht in den Ertrag ein;
		// ein Meister holt aus derselben Werkstatt mehr heraus als ein Anfänger.
		//
		// Es wird die **Mühle**, nicht das Backhaus: Beide gehören zu `BAKING`, und unter
		// gleich gut Beherrschtem gewinnt das billigere. Das trifft hier auch die richtige
		// Reihenfolge — ohne Mehl backt niemand.
		const baeckerin = await person('Bäckerin');
		await skillService.addPractice(baeckerin, 'BAKING', 500);

		const wahl = await npcService.fehlendeWerkstatt(stadtId, baeckerin);

		expect(wahl?.optionId).toBe(MUEHLE);
		expect(wahl?.price).toBeGreaterThan(180);
	});

	it('geht zum Backhaus über, sobald die Mühle steht', async () => {
		// Die Kette wächst dadurch in ihrer eigenen Reihenfolge: Was fehlt, entscheidet
		// die Stadt, und unter dem Fehlenden entscheidet das Können.
		const baeckerin = await person('Bäckerin');
		await skillService.addPractice(baeckerin, 'BAKING', 500);
		await hausMitGrund(MUEHLE, baeckerin);

		const wahl = await npcService.fehlendeWerkstatt(stadtId, baeckerin);

		expect(wahl?.optionId).toBe(BACKHAUS);
	});

	it('entscheidet bei gleichem Können nach dem Preis', async () => {
		// Zwei Handwerke gleich gut zu können heißt nicht, das teurere zu wählen.
		const vielseitig = await person('Vielseitige');
		await skillService.addPractice(vielseitig, 'BAKING', 500);
		await skillService.addPractice(vielseitig, 'CONSTRUCTION', 500);

		const wahl = await npcService.fehlendeWerkstatt(stadtId, vielseitig);

		expect(wahl?.optionId).toBe(ZIMMEREI);
	});

	it('schlägt nichts vor, was schon steht', async () => {
		// Ein NPC, der die vierte Bäckerei danebenstellt, ruiniert sich und den Markt.
		// Geprüft am ganzen Backhandwerk: Stehen Mühle und Backhaus, bleibt für die
		// Bäckerin nichts aus ihrem Fach — dann entscheidet wieder der Preis.
		const baeckerin = await person('Bäckerin');
		await skillService.addPractice(baeckerin, 'BAKING', 500);
		await hausMitGrund(MUEHLE, baeckerin);
		await hausMitGrund(BACKHAUS, baeckerin);

		const wahl = await npcService.fehlendeWerkstatt(stadtId, baeckerin);

		expect(wahl?.optionId).not.toBe(MUEHLE);
		expect(wahl?.optionId).not.toBe(BACKHAUS);
		expect(wahl?.optionId).toBe(ZIMMEREI);
	});
});
