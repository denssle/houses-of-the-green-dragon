import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Candidacy, Election, Vote } from '$lib/db/model/election';
import { Law } from '$lib/db/model/law';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as auctionService from '$lib/server/service/auctionService';
import * as electionService from '$lib/server/service/electionService';
import * as lawService from '$lib/server/service/lawService';
import * as mayorService from '$lib/server/service/mayorService';
import { CAMPAIGN_TICKS } from '$lib/game/election.logic';
import { LAW_RULES } from '$lib/game/law.logic';
import { yearsToTicks } from '$lib/game/time';
import { DEVELOPMENT_SHIFTS_PER_PLOT } from '$lib/game/auction.logic';
import { TAGELOHN } from '$lib/game/economy';

/**
 * Führt ein NPC sein Amt?
 *
 * Bis 4.15 richtete er nur öffentliche Bauten her — kein Gesetz, kein Bauland, keine
 * Wache. Unter ihm wuchs die Stadt nur, soweit sie ohnehin wuchs, und für einen Spieler
 * wäre es kein Ziel gewesen, ihm das Amt abzunehmen.
 */

const JETZT = 10_000;
const WACHHAUS = 7;
const SCHMIEDE = 2;
let stadtId: string;

async function person(name: string, rolle: 'PLAYER' | 'NPC' = 'NPC'): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: rolle,
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(35),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: 100,
		RegionId: stadtId
	});
	return id;
}

/** Macht jemanden zum Bürgermeister — über eine echte Wahl. */
async function insAmt(characterId: string): Promise<void> {
	await electionService.advanceElections(stadtId, JETZT);
	await electionService.stand(characterId, stadtId);
	await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);
}

async function kasse(): Promise<number> {
	return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
}

async function stadtgrund(optionId?: number): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Amtsgasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CITY'
	});
	if (optionId === undefined) return plotId;

	const id = randomUUID();
	await Building.create({
		id,
		name: 'Städtisches Haus',
		optionId,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CITY'
	});
	return id;
}

/** Ein Grundstück in Bürgerhand — die Bemessungsgrundlage der Grundsteuer. */
async function buergergrund(besitzerId: string): Promise<void> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Bürgergasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
}

/**
 * Eine Erschließung, an der schon gearbeitet wird.
 *
 * **Sie gehört in jede Lage, in der es ums Sparen geht** (5.92): Seit die Erschließung
 * nichts mehr kostet, ist sie die erste Wahl einer Stadt ohne freies Bauland — und die
 * Testwelten haben keines. Ohne diese Baustelle käme der Amtsinhaber nie zu der Frage, um
 * die es im jeweiligen Test geht.
 */
async function laufendeErschliessung(): Promise<void> {
	await Plot.create({
		id: randomUUID(),
		address: 'Neustadt 1',
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'NONE',
		developmentShifts: 0
	});
}

describe('Der Bürgermeister im Amt', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Law.destroy({ where: {} });
		await Vote.destroy({ where: {} });
		await Candidacy.destroy({ where: {} });
		await Election.destroy({ where: {} });
		await Building.destroy({ where: {} });
		await Plot.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 1000 }, { where: { id: stadtId } });
	});

	it('tut nichts, solange niemand im Amt ist', async () => {
		expect(await mayorService.governAsNpcMayor(stadtId, JETZT)).toBeUndefined();
	});

	it('lässt einen Spieler im Amt selbst entscheiden', async () => {
		// Sonst wäre jede Amtshandlung eine Schaltfläche, die erledigt, was ohnehin
		// geschieht.
		const spieler = await person('Amtsperson', 'PLAYER');
		await insAmt(spieler);
		await stadtgrund();

		expect(await mayorService.governAsNpcMayor(stadtId, JETZT)).toBeUndefined();
	});

	it('bezahlt seine Wache', async () => {
		const npc = await person('Amtsperson');
		await insAmt(npc);
		const wachhaus = await stadtgrund(WACHHAUS);

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('PAY_WAGE');
		expect((await Building.findByPk(wachhaus))!.dataValues.offeredWage).toBeGreaterThan(0);
	});

	it('schreibt auch die städtische Schmiede aus', async () => {
		// **Der Befund vom 16.08.2026** (Punkt 63): In der Welt auf dem Server stand die
		// Schmiede aus `seed.ts` 97 Spieljahre ohne Schmied. Der Bürgermeister suchte
		// allein nach dem Wachhaus, also hing für sie nie ein Sold aus — und ohne Aushang
		// bewirbt sich niemand. Ein Arbeitsplatz, den die Stadt besitzt, aber nie
		// ausschreibt, ist eine Kulisse.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		const schmiede = await stadtgrund(SCHMIEDE);

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('PAY_WAGE');
		expect((await Building.findByPk(schmiede))!.dataValues.offeredWage).toBeGreaterThan(0);
	});

	it('schreibt nicht zweimal aus, was schon einen Sold hat', async () => {
		// Sonst setzte er in jedem Tick denselben Aushang neu und käme nie dazu, etwas
		// anderes zu tun — dieselbe Falle, in der die NPCs vor 4.14 vor ihrem leeren
		// Bauplatz standen.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		const wachhaus = await stadtgrund(WACHHAUS);
		await Building.update({ offeredWage: 3 }, { where: { id: wachhaus } });

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).not.toBe('PAY_WAGE');
	});

	it('baut, was der Stadt fehlt', async () => {
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await stadtgrund();

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('BUILD_PUBLIC');
		expect(await Building.count({ where: { ownerType: 'CITY' } })).toBe(1);
		// **Und die Kasse bleibt unangetastet** (5.93, Punkt 102): Was entsteht, ist ein
		// Rohbau, den Schichten fertig machen — bezahlt wird die Arbeit, nicht ein Preis.
		expect(await kasse()).toBe(1000);
		expect(
			(await Building.findOne({ where: { ownerType: 'CITY' } }))!.dataValues.underConstruction
		).toBe(true);
	});

	it('legt kein zweites Fundament, solange das erste offen ist', async () => {
		// Die Bremse, die an die Stelle des Preises getreten ist — dieselbe wie bei der
		// Erschließung (5.92): Ohne sie beschlösse der Amtsinhaber in jedem Tick den
		// nächsten Bau, und die Stadt hätte drei angefangene Häuser und kein fertiges.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await stadtgrund();
		await stadtgrund();

		await mayorService.governAsNpcMayor(stadtId, JETZT);
		const zweiter = await mayorService.governAsNpcMayor(stadtId, JETZT + 1);

		expect(zweiter?.action).not.toBe('BUILD_PUBLIC');
		expect(await Building.count({ where: { ownerType: 'CITY' } })).toBe(1);
	});

	/**
	 * **Und zwar die, die etwas einbringt** (5.71, Punkt 96). Bis dahin war der Zehnt das
	 * einzige Gesetz, das ein NPC anfassen konnte — er greift auf die Ernte einer Pacht,
	 * und eine Stadt ohne Pächter konnte ihre Kasse mit nichts füllen, was ihr zur
	 * Verfügung stand.
	 */
	it('erhöht die Steuer, wenn die Kasse leer ist', async () => {
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
		// Ein Grundstück in Bürgerhand — sonst erreichte die Grundsteuer niemanden.
		await buergergrund(npc);
		// **Am eigenen Gehalt ist nichts mehr zu sparen** (5.91): Seit die Entschädigung in
		// NPC-Hand liegt, kommt sie vor der Steuer. Ohne diese Zeile prüfte der Test die
		// neue Reihenfolge statt der Steuer — die hat ihren eigenen Fall weiter oben.
		await lawService.enact(npc, stadtId, 'OFFICE_STIPEND', LAW_RULES.OFFICE_STIPEND.min, JETZT);
		// **Und die Erschließung läuft schon** (5.92): Seit sie nichts mehr kostet, geht sie
		// bei leerer Kasse vor — sie bringt der Stadt etwas ein, statt ihre Bürger zu
		// belasten. Auch das ist die Rangfolge, nicht die Steuer.
		await laufendeErschliessung();

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('SET_TAX');
		expect(getan?.detail).toBe(LAW_RULES.PROPERTY_TAX.name);
		expect(await lawService.rate(stadtId, 'PROPERTY_TAX')).toBeGreaterThan(
			LAW_RULES.PROPERTY_TAX.fallback
		);
	});

	it('lässt die Steuern in Ruhe, wenn sie niemanden erreichen', async () => {
		// Kein Grundbesitz, keine Pacht: Eine Erhöhung brächte nichts ein und stünde
		// trotzdem an der Tafel im Rathaus. Genau daran drehte das Amt vor 5.71 in fast
		// jedem Tick.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).not.toBe('SET_TAX');
		expect(await lawService.rate(stadtId, 'PROPERTY_TAX')).toBe(LAW_RULES.PROPERTY_TAX.fallback);
	});

	it('kürzt bei leerer Kasse zuerst die eigene Entschädigung', async () => {
		// **Grünau, Tick 5648** (Punkt 93): 13 Münzen in der Kasse, 50 je Spieljahr für das
		// Amt — und sieben Steuererhöhungen in Folge, weil das der einzige Hebel war.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await Character.update({ greed: 0 }, { where: { id: npc } });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
		await buergergrund(npc);
		await laufendeErschliessung();

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('SET_STIPEND');
		expect(await lawService.rate(stadtId, 'OFFICE_STIPEND')).toBeLessThan(
			LAW_RULES.OFFICE_STIPEND.fallback
		);
		// Die Steuer der anderen bleibt, wo sie war — sie ist erst danach an der Reihe.
		expect(await lawService.rate(stadtId, 'PROPERTY_TAX')).toBe(LAW_RULES.PROPERTY_TAX.fallback);
	});

	it('lässt einen Gierigen sein Gehalt behalten und die Steuer erhöhen', async () => {
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await Character.update({ greed: 100 }, { where: { id: npc } });
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
		await buergergrund(npc);
		await laufendeErschliessung();

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('SET_TAX');
		expect(await lawService.rate(stadtId, 'OFFICE_STIPEND')).toBe(
			LAW_RULES.OFFICE_STIPEND.fallback
		);
	});

	it('erschließt auch mit leerer Kasse — es kostet keine Münze mehr', async () => {
		// **Die beiden Tests, die hier bis 5.91 standen, sind mit der Schwelle gefallen**
		// (5.92, Punkt 102): Sie prüften, dass der Amtsinhaber erst ausweist, wenn er beide
		// Grundstücke über der Rücklage bezahlen kann. Diese Rechnung gibt es nicht mehr —
		// die Erschließung ist Arbeit, der Lohn fällt je Schicht an. Was die Schwelle
		// angerichtet hat, steht in Punkt 93: In Grünau hielt die Kasse 13 Münzen, nötig
		// waren 180, und seit Tick 5291 ist dort kein Grundstück mehr entstanden.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('DEVELOP_LAND');
		expect(getan?.value).toBe(2);
		// Angelegt, aber noch nicht unter dem Hammer: Erst die Arbeit macht daraus ein
		// Grundstück, auf dem jemand bauen kann.
		expect(await Plot.count({ where: { RegionId: stadtId, ownerType: 'NONE' } })).toBe(2);
		expect(await auctionService.getOpenAuctions(stadtId)).toHaveLength(0);
		expect(await auctionService.getDevelopments(stadtId)).toHaveLength(2);
		expect((await Region.findByPk(stadtId))!.dataValues.treasury).toBe(0);
	});

	it('weist nicht zweimal aus, solange die erste Baustelle offen ist', async () => {
		// Die Bremse, die an die Stelle des Preises getreten ist: Ohne sie legte der
		// Amtsinhaber in jedem Tick zwei weitere Parzellen an, solange kein Bauland frei
		// ist.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await Region.update({ treasury: 1000 }, { where: { id: stadtId } });
		await laufendeErschliessung();

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).not.toBe('DEVELOP_LAND');
		// Die eine Baustelle von vorhin — keine zweite daneben.
		expect(await auctionService.getDevelopments(stadtId)).toHaveLength(1);
	});

	it('zahlt für eine Erschließung genau ihren alten Preis — nur an Menschen', async () => {
		// Der Maßstab dieses Schritts: zwanzig Schichten zum Tagelohn sind sechzig Münzen,
		// und damit liegt die Erschließung dort, wo ihr Münzpreis lag. Der Messlauf soll
		// zeigen, wohin dasselbe Geld fließt, und nicht, dass Erschließen billiger wurde.
		expect(DEVELOPMENT_SHIFTS_PER_PLOT * TAGELOHN).toBe(60);
	});

	it('tut höchstens eines je Tick', async () => {
		// Ein Bürgermeister, der in derselben Stunde die Steuern erhöht, ein Wachhaus baut
		// und Land erschließt, wäre kein Amtsinhaber, sondern ein Automat.
		const npc = await person('Amtsperson');
		await insAmt(npc);
		await stadtgrund(WACHHAUS);
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });

		const getan = await mayorService.governAsNpcMayor(stadtId, JETZT);

		expect(getan?.action).toBe('PAY_WAGE');
		// Die Steuer bleibt, wo sie war — sie ist erst im nächsten Tick an der Reihe.
		expect(await lawService.rate(stadtId, 'TITHE')).toBe(LAW_RULES.TITHE.fallback);
	});
});
