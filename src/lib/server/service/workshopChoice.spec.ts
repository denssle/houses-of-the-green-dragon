import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Plot } from '$lib/db/model/plot';
import { Skill } from '$lib/db/model/skill';
import { BuildingStock } from '$lib/db/model/shop';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as buildingService from '$lib/server/service/buildingService';
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
 * (190). Seit 5.96 hat jede ihre eigene Fertigkeit: `MILLING` und `BAKING`.
 */
const MUEHLE = 4;
const BACKHAUS = 5;
const ZIMMEREI = 9;
/** Die einzige Quelle für Eisen — und im Weltaufbau städtisch (Punkt 86). */
const SCHMIEDE = 2;
let stadtId: string;

/**
 * Ein Haus **auf einem Grundstück** — ohne eines zählt es nicht zur Stadt.
 *
 * `getBuildingsInRegion` verbindet über den Plot, und zwar mit `required: true`. Ein
 * Gebäude ohne Grund taucht dort nicht auf und gilt der Werkstattwahl deshalb als
 * nicht vorhanden. Beim ersten Anlauf war genau das der Grund, warum ein Test grün war,
 * ohne etwas zu prüfen.
 */
async function hausMitGrund(
	optionId: number,
	besitzerId: string,
	extras: { underConstruction?: boolean; lager?: { itemId: string; quantity: number } } = {}
): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Handwerksgasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: `Haus ${optionId}`,
		optionId,
		condition: extras.underConstruction ? 0 : 100,
		underConstruction: extras.underConstruction ?? false,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	if (extras.lager) {
		await BuildingStock.create({
			BuildingId: id,
			itemId: extras.lager.itemId,
			quantity: extras.lager.quantity
		});
	}
	return id;
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
		// Die Startwelt trägt eine städtische Schmiede; alles andere fehlt. Was ein Test
		// heimfallen ließ, muss eigens weg: Es gehört der Stadt und fällt deshalb nicht
		// unter die Zeile davor.
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await Building.destroy({ where: { escheatedTick: { [Op.ne]: null } } });
		await BuildingStock.destroy({ where: {} });
	});

	it('nimmt ohne Können die billigste, die fehlt', async () => {
		// Das Verhalten vor 5.19 — und weiterhin richtig für den, der nichts gelernt hat:
		// Wer wenig hat, fängt klein an.
		const neuling = await person('Neuling');

		const wahl = await npcService.fehlendeWerkstatt(
			await buildingService.getBuildingsInRegion(stadtId),
			neuling
		);

		expect(wahl?.optionId).toBe(ZIMMEREI);
	});

	it('baut das Handwerk, das er kann — auch wenn es teurer ist', async () => {
		// **Der Kern:** Wer sein Leben lang gebacken hat, baut sein Handwerk und keine
		// Zimmerei, obwohl die zwanzig Münzen billiger wäre. Können geht in den Ertrag ein;
		// ein Meister holt aus derselben Werkstatt mehr heraus als ein Anfänger.
		//
		// Bis 5.96 wurde es hier die **Mühle**: Beide gehörten zu `BAKING`, und unter gleich
		// gut Beherrschtem gewann das billigere. Seitdem baut die Bäckerin ihr Backhaus.
		const baeckerin = await person('Bäckerin');
		await skillService.addPractice(baeckerin, 'BAKING', 500);

		const wahl = await npcService.fehlendeWerkstatt(
			await buildingService.getBuildingsInRegion(stadtId),
			baeckerin
		);

		expect(wahl?.optionId).toBe(BACKHAUS);
		expect(wahl?.price).toBeGreaterThan(180);
	});

	it('und der Müller seine Mühle (5.96)', async () => {
		// Die zweite Hälfte der Trennung: Wer mahlen kann, baut die Mühle — und das Backen
		// gilt beim Zuzug erst dann als versorgt, wenn ein Backhaus steht.
		const mueller = await person('Müller');
		await skillService.addPractice(mueller, 'MILLING', 500);

		const wahl = await npcService.fehlendeWerkstatt(
			await buildingService.getBuildingsInRegion(stadtId),
			mueller
		);

		expect(wahl?.optionId).toBe(MUEHLE);
	});

	it('entscheidet bei gleichem Können nach dem Preis', async () => {
		// Zwei Handwerke gleich gut zu können heißt nicht, das teurere zu wählen.
		const vielseitig = await person('Vielseitige');
		await skillService.addPractice(vielseitig, 'BAKING', 500);
		await skillService.addPractice(vielseitig, 'CONSTRUCTION', 500);

		const wahl = await npcService.fehlendeWerkstatt(
			await buildingService.getBuildingsInRegion(stadtId),
			vielseitig
		);

		expect(wahl?.optionId).toBe(ZIMMEREI);
	});

	it('übergeht die städtische Schmiede — sie führt niemand', async () => {
		// **Punkt 86.** Die Schmiede ist das einzige Rezept, das Eisen erzeugt, und Eisen
		// steht im Material jeder Werkstatt außer Zimmerei, Steinmetzhütte und Schmiede.
		// Solange die städtische das Handwerk „besetzt" hielt, entstand in dieser Welt kein
		// einziges Stück Eisen — und damit war keine Mühle, keine Bäckerei, keine
		// Schneiderei und keine Alchemistenküche je zu bauen.
		const schmiedin = await person('Schmiedin');
		await skillService.addPractice(schmiedin, 'SMITHING', 500);

		const wahl = await npcService.fehlendeWerkstatt(
			await buildingService.getBuildingsInRegion(stadtId),
			schmiedin
		);

		expect(wahl?.optionId).toBe(SCHMIEDE);
	});

	it('aber nicht eine private — die versorgt die Stadt', async () => {
		// Die Gegenprobe zum Test darüber: Die Regel ist nicht abgeschafft, sie fragt nur
		// nach dem Betreiber. Steht die Schmiede in Bürgerhand, baut niemand die zweite.
		const schmiedin = await person('Schmiedin');
		await skillService.addPractice(schmiedin, 'SMITHING', 500);
		await hausMitGrund(SCHMIEDE, schmiedin);

		const wahl = await npcService.fehlendeWerkstatt(
			await buildingService.getBuildingsInRegion(stadtId),
			schmiedin
		);

		expect(wahl?.optionId).not.toBe(SCHMIEDE);
	});

	it('gibt ein heimgefallenes Handwerk wieder frei', async () => {
		// **Punkt 89.** Ein Betrieb, der der Stadt aus einem erbenlosen Nachlass zufiel,
		// wird von niemandem geführt. Bliebe er als „vorhanden" stehen, wäre das Handwerk
		// für alle Zeit besetzt — von einem Haus, in dem niemand arbeitet.
		const mueller = await person('Müller');
		await skillService.addPractice(mueller, 'MILLING', 500);
		await hausMitGrund(MUEHLE, mueller);

		await Building.update(
			{ ownerType: 'CITY', OwnerCharacterId: null, escheatedTick: JETZT },
			{ where: { optionId: MUEHLE } }
		);

		const wahl = await npcService.fehlendeWerkstatt(
			await buildingService.getBuildingsInRegion(stadtId),
			mueller
		);

		expect(wahl?.optionId).toBe(MUEHLE);
	});

	it('schlägt nichts vor, was schon steht', async () => {
		// Ein NPC, der die vierte Bäckerei danebenstellt, ruiniert sich und den Markt.
		// Geprüft am ganzen Backhandwerk: Stehen Mühle und Backhaus, bleibt für die
		// Bäckerin nichts aus ihrem Fach — dann entscheidet wieder der Preis.
		//
		// **Ohne Stadt gefragt**, und das ist seit 5.95 der Unterschied: Wer keine Region
		// mitgibt, bekommt die Wahl ohne die Frage nach der Versorgung — so, wie sie bis
		// dahin für alle galt.
		const baeckerin = await person('Bäckerin');
		await skillService.addPractice(baeckerin, 'BAKING', 500);
		await hausMitGrund(MUEHLE, baeckerin);
		await hausMitGrund(BACKHAUS, baeckerin);

		const wahl = await npcService.fehlendeWerkstatt(
			await buildingService.getBuildingsInRegion(stadtId),
			baeckerin
		);

		expect(wahl?.optionId).not.toBe(MUEHLE);
		expect(wahl?.optionId).not.toBe(BACKHAUS);
		expect(wahl?.optionId).toBe(ZIMMEREI);
	});

	describe('wenn die Stadt nicht satt wird (5.95, Punkt 89)', () => {
		/**
		 * Eine Bäckerin, deren Backhaus und Mühle stehen — das Fach ist vergeben.
		 *
		 * **Mit Baumaterial in der Kammer.** Ohne das wiche die Wahl auf eine Werkstatt aus,
		 * die keines verlangt (5.87, Punkt 110), und jeder Test hier landete bei der
		 * Zimmerei — der erste wäre rot und die beiden Gegenproben grün, ohne dass einer
		 * von ihnen die Knappheit geprüft hätte. Genau so ist es beim ersten Anlauf gewesen.
		 */
		async function mitBackhandwerk(): Promise<string> {
			const baeckerin = await person('Bäckerin');
			await skillService.addPractice(baeckerin, 'BAKING', 500);
			for (const itemId of ['PLANK', 'BLOCK', 'IRON']) {
				await Inventory.create({ CharacterId: baeckerin, itemId, quantity: 100 });
			}
			await hausMitGrund(MUEHLE, baeckerin);
			await hausMitGrund(BACKHAUS, baeckerin);
			return baeckerin;
		}

		it('gibt das Handwerk wieder frei, wenn kein Brot da ist', async () => {
			// **Der Kern des Schritts.** Eine Bäckerei versorgt keine Stadt: Im Lauf über
			// 2000 Ticks buk die eine sieben Laibe, während tausend gebraucht wurden, und
			// dreiunddreißig Menschen verhungerten neben ihr. Steht nichts am Markt, ist
			// das Fach wieder offen — für die zweite Bäckerei.
			const baeckerin = await mitBackhandwerk();

			const wahl = await npcService.fehlendeWerkstatt(
				await buildingService.getBuildingsInRegion(stadtId),
				baeckerin,
				stadtId
			);

			expect(wahl?.optionId).toBe(BACKHAUS);
		});

		it('lässt es vergeben, solange die Versorgung reicht', async () => {
			// Die Gegenprobe, ohne die der Schritt eine Einbahn wäre: Wer versorgt ist,
			// braucht keinen zweiten Bäcker. Ein Spieljahr Vorrat genügt — bei einer
			// Handvoll Einwohner sind das wenige Laibe (`supplyNeeded`).
			const baeckerin = await mitBackhandwerk();
			await hausMitGrund(ZIMMEREI, baeckerin, { lager: { itemId: 'BREAD', quantity: 200 } });

			const wahl = await npcService.fehlendeWerkstatt(
				await buildingService.getBuildingsInRegion(stadtId),
				baeckerin,
				stadtId
			);

			expect(wahl?.optionId).not.toBe(BACKHAUS);
		});

		it('zählt einen Rohbau als Antwort auf die Lücke', async () => {
			// **Gegen die Herde** (Punkte 88 und 90): In der Stunde, in der die Lücke
			// aufgeht, bekäme sonst jeder NPC dieselbe Bäckerei vorgeschlagen, und die
			// Stadt bekäme sechs davon. So entsteht eine nach der anderen.
			const baeckerin = await mitBackhandwerk();
			await hausMitGrund(BACKHAUS, baeckerin, { underConstruction: true });

			const wahl = await npcService.fehlendeWerkstatt(
				await buildingService.getBuildingsInRegion(stadtId),
				baeckerin,
				stadtId
			);

			expect(wahl?.optionId).not.toBe(BACKHAUS);
		});
	});
});
