import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Law } from '$lib/db/model/law';
import { Lease } from '$lib/db/model/lease';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as buildingService from '$lib/server/service/buildingService';
import * as employmentService from '$lib/server/service/employmentService';
import * as productionService from '$lib/server/service/productionService';
import * as tradeService from '$lib/server/service/tradeService';
import { yearsToTicks } from '$lib/game/time';
import { CONDITION_MAX, YEARS_TO_RUIN } from '$lib/game/building.logic';

/**
 * Phase 5.15: **auf einer Pacht arbeiten lassen.**
 *
 * Bis hierher war eine Abbaufläche etwas, das man selbst bestellt — wer nicht persönlich
 * aufs Feld ging, bekam nichts. Mit dem Hof wird sie ein Arbeitsplatz wie jeder andere:
 * Der Pächter hängt einen Lohn aus, jemand tritt an, und was wächst, landet im Lager des
 * Hofs statt im Beutel des Erntenden.
 *
 * **Der Hof ist der Kunstgriff**, der das ohne ein zweites Anstellungswesen möglich
 * macht: Die Anstellung hängt im ganzen Spiel an einem Gebäude, also bekommt die Fläche
 * eines. Was darauf entsteht, sagt aber weiterhin der Boden und nicht die Vorlage.
 */

const JETZT = 10_000;
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

/** Eine freie Abbaufläche der Startwelt — Holz trägt zu jeder Jahreszeit. */
async function freieFlaeche(rohstoff: string = 'WOOD'): Promise<string> {
	const flaeche = await Plot.findOne({ where: { type: 'RESOURCE', resourceType: rohstoff } });
	return flaeche!.dataValues.id;
}

async function hofAuf(plotId: string) {
	return Building.findOne({ where: { PlotId: plotId, optionId: buildingService.HOF_OPTION_ID } });
}

async function kasse(regionId: string = stadtId): Promise<number> {
	return (await Region.findByPk(regionId))!.dataValues.treasury ?? 0;
}

describe('Der Hof einer Pacht', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Employment.destroy({ where: {} });
		await Lease.destroy({ where: {} });
		await Law.destroy({ where: {} });
		await Building.destroy({ where: { optionId: buildingService.HOF_OPTION_ID } });
		await Character.destroy({ where: { role: 'PLAYER' } });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	it('entsteht mit der Pacht und gehört dem Pächter', async () => {
		const paechterin = await person('Pächterin');
		const flaeche = await freieFlaeche();

		expect((await productionService.leasePlot(paechterin, flaeche)).ok).toBe(true);

		const hof = await hofAuf(flaeche);
		expect(hof).not.toBeNull();
		expect(hof!.dataValues.OwnerCharacterId).toBe(paechterin);
	});

	it('ist kein Handwerksbetrieb', async () => {
		// Sonst hielte sich jeder Pächter für einen Unternehmer: Ein NPC baute nie eine
		// echte Werkstatt, weil er ja schon eine zu haben glaubt.
		const vorlage = buildingService.getBuildingOption(buildingService.HOF_OPTION_ID);

		expect(vorlage?.type).toBe('EXTRACTION');
	});

	it('lässt einen Knecht ernten, was im Boden steckt', async () => {
		// Der Hof hat kein eigenes Rezept — was hier wächst, sagt die Fläche.
		const paechterin = await person('Pächterin', 200);
		const knecht = await person('Knecht', 0);
		const flaeche = await freieFlaeche();
		await productionService.leasePlot(paechterin, flaeche);
		const hof = (await hofAuf(flaeche))!;

		await employmentService.offerJob(paechterin, hof.dataValues.id, 3);
		expect((await employmentService.takeJob(knecht, hof.dataValues.id)).ok).toBe(true);

		const schicht = await employmentService.workForEmployer(knecht);

		expect(schicht.ok).toBe(true);
		const lager = await tradeService.getBuildingStock(hof.dataValues.id);
		expect(lager.find((posten) => posten.itemId === 'WOOD')?.quantity ?? 0).toBeGreaterThan(0);
		// Der Lohn kommt aus der Tasche der Pächterin, nicht aus dem Nichts.
		expect((await Character.findByPk(knecht))!.dataValues.money).toBeGreaterThan(0);
		expect((await Character.findByPk(paechterin))!.dataValues.money).toBeLessThan(200);
	});

	it('zieht den Zehnt auch vom Ertrag des Knechts ab', async () => {
		// **Der Zehnt trifft die Ernte, nicht den Erntenden.** Sonst wäre eine Handvoll
		// Angestellter der Weg, ihn zu umgehen — und der Satz, den die Stadt beschließt,
		// gälte nur für die, die selbst aufs Feld gehen.
		const paechterin = await person('Pächterin', 200);
		const knecht = await person('Knecht', 0);
		const flaeche = await freieFlaeche();
		await productionService.leasePlot(paechterin, flaeche);
		const hof = (await hofAuf(flaeche))!;

		// **Der Erlass gilt der Stadt** — und seit 5.24 wird er auch dort nachgeschlagen und
		// dorthin abgeführt (Punkt 65). Vorher fragte `harvest` die Umlandregion, in der nie
		// jemand etwas erlässt: Die Erhöhungen des Bürgermeisters blieben wirkungslos, und
		// was einging, landete in einer Kasse ohne Amt und ohne Ausgaben.
		await Law.create({
			id: randomUUID(),
			RegionId: stadtId,
			kind: 'TITHE',
			value: 30,
			enactedTick: JETZT,
			EnactedByCharacterId: null
		});
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });

		await employmentService.offerJob(paechterin, hof.dataValues.id, 3);
		await employmentService.takeJob(knecht, hof.dataValues.id);
		await employmentService.workForEmployer(knecht);

		expect(await kasse(stadtId)).toBeGreaterThan(0);
	});

	/**
	 * **Vom Umland zum Hof** (5.32). Die Liste der Flächen nennt jetzt das Haus, das
	 * darauf steht — sonst führte von hier kein Weg dorthin: zum eigenen nur über den
	 * Umweg der Häuserliste, zu dem eines anderen gar keiner.
	 */
	it('steht in der Liste des Umlands mit Namen und Kennung', async () => {
		const paechterin = await person('Pächterin');
		const fremde = await person('Fremde');
		const flaeche = await freieFlaeche();
		await productionService.leasePlot(paechterin, flaeche);
		const hof = (await hofAuf(flaeche))!;

		const eintrag = (await productionService.getAreas(fremde)).find((f) => f.plotId === flaeche);

		// Auch für die Fremde: Wo ein Haus steht, sieht man es — wem es gehört, steht auf
		// seiner Seite.
		expect(eintrag).toMatchObject({
			leased: true,
			leasedByMe: false,
			buildingId: hof.dataValues.id,
			buildingName: hof.dataValues.name
		});
	});

	it('lässt eine freie Fläche ohne Haus in der Liste', async () => {
		// Sonst zeigte die Umlandliste einen Weg zu einem Gebäude, das es nicht gibt.
		const jemand = await person('Jemand');
		const flaeche = await freieFlaeche();

		const eintrag = (await productionService.getAreas(jemand)).find((f) => f.plotId === flaeche);

		expect(eintrag).toMatchObject({ leased: false, buildingId: null, buildingName: null });
	});

	it('verfällt nicht — auch nach Menschenaltern nicht', async () => {
		// **Der Fehler aus 5.15** (Punkt 69): Der Hof war ein Gebäude wie jedes andere und
		// wurde nach rund fünfundzwanzig Spieljahren zur Ruine. Im Messlauf verschwand
		// „Hof am Eichwald 1" zwischen Tick 1000 und 1250 — die Pacht blieb bestehen,
		// geerntet wurde weiter, aber der Arbeitsplatz war weg, samt aller Knechte, und
		// nirgends stand warum.
		//
		// Er gehört zur Fläche wie der Acker selbst, und über den sagt `harvest`: „Ein
		// Acker hat keinen Zustand wie ein Gebäude — er trägt immer voll."
		const paechterin = await person('Pächterin');
		const flaeche = await freieFlaeche();
		await productionService.leasePlot(paechterin, flaeche);

		// Weit über die Ruinenschwelle hinaus: dreimal so lange, wie ein Haus hält.
		await World.update(
			{ currentTick: JETZT + yearsToTicks(YEARS_TO_RUIN * 3) },
			{ where: { id: WORLD_ID } }
		);

		const hof = await hofAuf(flaeche);
		expect(hof).not.toBeNull();
		// Und er trägt voll — ein halb verfallener Hof erntete weniger.
		expect((await buildingService.getBuilding(hof!.dataValues.id))?.condition).toBe(CONDITION_MAX);
	});

	it('fällt mit der Pacht', async () => {
		// Bliebe er stehen, hätte der nächste Pächter das Haus des Verstorbenen auf seiner
		// Fläche — samt dessen Knechten und dessen Lager.
		const paechterin = await person('Pächterin');
		const flaeche = await freieFlaeche();
		await productionService.leasePlot(paechterin, flaeche);
		expect(await hofAuf(flaeche)).not.toBeNull();

		await productionService.releaseLeases(paechterin);

		expect(await hofAuf(flaeche)).toBeNull();
	});
});
