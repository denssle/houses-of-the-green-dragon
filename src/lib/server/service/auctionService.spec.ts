import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Auction, Bid } from '$lib/db/model/auction';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Candidacy, Election, Vote } from '$lib/db/model/election';
import { Event } from '$lib/db/model/event';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as auctionService from '$lib/server/service/auctionService';
import * as electionService from '$lib/server/service/electionService';
import {
	AUCTION_TICKS,
	BID_INCREMENT,
	DEVELOPMENT_COST_PER_PLOT,
	MINIMUM_BID
} from '$lib/game/auction.logic';
import { CAMPAIGN_TICKS } from '$lib/game/election.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.9a gegen die Datenbank. Im Mittelpunkt: dass die Stadt für ihr Land bezahlt,
 * dass der Zuschlag an den Höchstbietenden geht — und dass er den Nächsten trifft, wenn
 * der Höchstbietende nicht mehr zahlen kann.
 */

const JETZT = 10_000;
let stadtId: string;

async function person(
	name: string,
	geld: number,
	rolle: 'PLAYER' | 'NPC' = 'PLAYER'
): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: rolle,
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

async function insAmt(characterId: string): Promise<void> {
	await electionService.advanceElections(stadtId, JETZT);
	await electionService.stand(characterId, stadtId);
	await electionService.advanceElections(stadtId, JETZT + CAMPAIGN_TICKS);
}

async function kasse(): Promise<number> {
	return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
}

async function geld(id: string): Promise<number> {
	return (await Character.findByPk(id))!.dataValues.money;
}

/** Eine laufende Versteigerung — der Bürgermeister lässt ein Grundstück ausweisen. */
async function versteigerung(buergermeister: string): Promise<string> {
	await auctionService.developLand(buergermeister, stadtId, 1);
	const offen = await auctionService.getOpenAuctions(stadtId);
	return offen[0].id;
}

describe('Erschließung und Versteigerung', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		await Event.destroy({ where: {} });
		await Bid.destroy({ where: {} });
		await Auction.destroy({ where: {} });
		await Vote.destroy({ where: {} });
		await Candidacy.destroy({ where: {} });
		await Election.destroy({ where: {} });
		await Building.destroy({ where: {} });
		await Plot.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Region.update({ treasury: 1000 }, { where: { id: stadtId } });
	});

	describe('erschließen', () => {
		it('darf nur der Amtsinhaber, und die Stadt zahlt', async () => {
			const buergermeister = await person('Amtsperson', 100);
			const buerger = await person('Bürger', 100);
			await insAmt(buergermeister);

			expect(await auctionService.developLand(buerger, stadtId, 2)).toEqual({
				ok: false,
				reason: 'NOT_IN_OFFICE'
			});

			const ergebnis = await auctionService.developLand(buergermeister, stadtId, 2);

			expect(ergebnis).toEqual({ ok: true, plots: 2, spent: 2 * DEVELOPMENT_COST_PER_PLOT });
			expect(await kasse()).toBe(1000 - 2 * DEVELOPMENT_COST_PER_PLOT);
			expect(await Plot.count()).toBe(2);
			// Erschlossenes Land geht nicht in den Verkauf, sondern unter den Hammer.
			expect(await auctionService.getOpenAuctions(stadtId)).toHaveLength(2);
		});

		it('scheitert an einer leeren Stadtkasse', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			await Region.update({ treasury: 10 }, { where: { id: stadtId } });

			expect(await auctionService.developLand(buergermeister, stadtId, 1)).toEqual({
				ok: false,
				reason: 'NOT_ENOUGH_MONEY'
			});
			expect(await Plot.count()).toBe(0);
		});

		it('gibt jedem Grundstück eine eigene Adresse', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			await auctionService.developLand(buergermeister, stadtId, 4);

			const adressen = (await Plot.findAll()).map((p) => p.dataValues.address);
			expect(new Set(adressen).size).toBe(4);
		});

		it('steht in der Chronik', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			await auctionService.developLand(buergermeister, stadtId, 3);

			const eintrag = await Event.findOne({ where: { kind: 'LAND_DEVELOPED' } });
			expect(eintrag?.dataValues.value).toBe(3);
		});
	});

	describe('bieten', () => {
		it('nimmt das Gebot an und weist zu niedrige ab', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			const auktion = await versteigerung(buergermeister);
			const bieter = await person('Bieterin', 500);

			expect(await auctionService.bid(bieter, auktion, MINIMUM_BID)).toEqual({ ok: true });

			const zweiter = await person('Zweiter', 500);
			expect(await auctionService.bid(zweiter, auktion, MINIMUM_BID)).toEqual({
				ok: false,
				reason: 'BID_TOO_LOW'
			});
			expect(await auctionService.bid(zweiter, auktion, MINIMUM_BID + BID_INCREMENT)).toEqual({
				ok: true
			});
		});

		it('ersetzt das eigene Gebot, statt ein zweites danebenzustellen', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			const auktion = await versteigerung(buergermeister);
			const bieter = await person('Bieterin', 500);
			const gegner = await person('Gegner', 500);

			await auctionService.bid(bieter, auktion, 50);
			await auctionService.bid(gegner, auktion, 60);
			await auctionService.bid(bieter, auktion, 70);

			expect(await Bid.count({ where: { AuctionId: auktion } })).toBe(2);
		});

		it('nimmt kein Geld beim Bieten', async () => {
			// Gezahlt wird erst beim Zuschlag — es gibt keine Reservierung.
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			const auktion = await versteigerung(buergermeister);
			const bieter = await person('Bieterin', 500);

			await auctionService.bid(bieter, auktion, 200);

			expect(await geld(bieter)).toBe(500);
		});
	});

	describe('der Zuschlag', () => {
		it('geht an das höchste Gebot, und das Geld an die Stadt', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			const auktion = await versteigerung(buergermeister);
			const wenig = await person('Wenigbietende', 500);
			const viel = await person('Vielbietender', 500);
			await auctionService.bid(wenig, auktion, 100);
			await auctionService.bid(viel, auktion, 200);
			const vorher: number = await kasse();

			const lauf = await auctionService.advanceAuctions(stadtId, JETZT + AUCTION_TICKS);

			expect(lauf).toEqual({ closed: 1, awarded: 1 });
			expect(await geld(viel)).toBe(300);
			expect(await geld(wenig)).toBe(500);
			expect(await kasse()).toBe(vorher + 200);

			const flaeche = await Plot.findOne({ where: { OwnerCharacterId: viel } });
			expect(flaeche).not.toBeNull();
		});

		/**
		 * Der Grund für die Bauart ohne Reservierung: Wer bis zum Zuschlag sein Geld
		 * ausgibt, verliert den Zuschlag — und der Nächste rückt nach, wie beim Amt.
		 */
		it('übergeht, wer inzwischen nicht mehr zahlen kann', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			const auktion = await versteigerung(buergermeister);
			const grosstuer = await person('Großtuer', 500);
			const solide = await person('Solide', 500);
			// Der Reihe nach — ein Gebot muss das vorige uebertreffen.
			await auctionService.bid(solide, auktion, 200);
			await auctionService.bid(grosstuer, auktion, 300);

			// Er gibt sein Geld aus, bevor zugeschlagen wird.
			await Character.update({ money: 5 }, { where: { id: grosstuer } });
			await auctionService.advanceAuctions(stadtId, JETZT + AUCTION_TICKS);

			expect(await geld(solide)).toBe(300);
			expect(await Plot.count({ where: { OwnerCharacterId: solide } })).toBe(1);
			expect(await Plot.count({ where: { OwnerCharacterId: grosstuer } })).toBe(0);
		});

		it('kommt nicht vor der Zeit', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			const auktion = await versteigerung(buergermeister);
			const bieter = await person('Bieterin', 500);
			await auctionService.bid(bieter, auktion, 100);

			expect(await auctionService.advanceAuctions(stadtId, JETZT + AUCTION_TICKS - 1)).toEqual({
				closed: 0,
				awarded: 0
			});
			expect(await geld(bieter)).toBe(500);
		});

		it('lässt NPCs mitbieten, damit die Stadt nicht leer ausgeht', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			const auktion = await versteigerung(buergermeister);
			await person('Reicher NPC', 1000, 'NPC');
			expect(auktion).toBeDefined();
			const vorher: number = await kasse();

			await auctionService.advanceAuctions(stadtId, JETZT + AUCTION_TICKS);

			// Ohne NPC-Gebote wäre das Grundstück ohne Zuschlag geblieben.
			expect(await kasse()).toBeGreaterThan(vorher);
		});

		it('steht in der Chronik', async () => {
			const buergermeister = await person('Amtsperson', 100);
			await insAmt(buergermeister);
			const auktion = await versteigerung(buergermeister);
			const bieter = await person('Bieterin', 500);
			await auctionService.bid(bieter, auktion, 100);
			await auctionService.advanceAuctions(stadtId, JETZT + AUCTION_TICKS);

			const eintrag = await Event.findOne({ where: { kind: 'AUCTION_WON' } });
			expect(eintrag?.dataValues.subjectId).toBe(bieter);
			expect(eintrag?.dataValues.value).toBe(100);
		});
	});

	/**
	 * Der Rückweg in private Hand (Punkt 79).
	 *
	 * Wer ohne Erben stirbt, dessen Häuser fallen an die Stadt — und blieben dort liegen.
	 * Bei knappem Bauland ist das der teuerste Teil: Ein bebautes Grundstück nimmt kein
	 * zweites Haus auf, also war jeder erbenlose Tod ein Bauplatz weniger, für immer.
	 */
	describe('was der Stadt zufällt', () => {
		const WOHNHAUS = 1;
		const RATHAUS = 0;
		const SCHMIEDE = 2;

		/**
		 * Ein städtisches Grundstück, wahlweise mit einem Haus darauf.
		 *
		 * `heimgefallen` entscheidet über die Herkunft: mit `escheatedTick` ein Nachlass, den
		 * die Stadt weitergeben soll, ohne ihn ein Haus, für das sie einsteht (Punkt 79).
		 */
		async function stadtgrund(
			optionId?: number,
			heimgefallen = true
		): Promise<{ plotId: string; hausId?: string }> {
			const plotId = randomUUID();
			await Plot.create({
				id: plotId,
				address: `Erbgasse ${plotId.slice(0, 4)}`,
				type: 'BUILDING_LAND',
				RegionId: stadtId,
				ownerType: 'CITY'
			});
			if (optionId === undefined) return { plotId };

			const hausId = randomUUID();
			await Building.create({
				id: hausId,
				name: optionId === RATHAUS ? 'Rathaus' : 'Kate',
				optionId,
				lastConditionTick: JETZT,
				PlotId: plotId,
				ownerType: 'CITY',
				escheatedTick: heimgefallen ? JETZT : null
			});
			return { plotId, hausId };
		}

		it('bietet ein heimgefallenes Anwesen aus', async () => {
			await stadtgrund(WOHNHAUS);

			expect(await auctionService.auctionEscheatedEstates(stadtId, JETZT)).toBe(1);
			expect(await auctionService.getOpenAuctions(stadtId)).toHaveLength(1);
		});

		it('lässt freien Stadtgrund in Ruhe', async () => {
			// Aus ihm baut der Bürgermeister Schule und Unterkunft. Eine Stadt, die jedes
			// freie Fleckchen ausbietet, kann nie wieder etwas errichten.
			await stadtgrund();

			expect(await auctionService.auctionEscheatedEstates(stadtId, JETZT)).toBe(0);
		});

		it('rührt nicht an, wofür die Stadt einsteht', async () => {
			// Das Rathaus gehört ihr von jeher — und die städtische Schmiede genauso. Nicht
			// die Bauart entscheidet, sondern die Herkunft: Ein geerbter Betrieb sähe aus wie
			// die Schmiede aus dem Weltaufbau.
			await stadtgrund(RATHAUS, false);
			await stadtgrund(SCHMIEDE, false);

			expect(await auctionService.auctionEscheatedEstates(stadtId, JETZT)).toBe(0);
		});

		it('bietet dasselbe Anwesen nicht zweimal aus', async () => {
			await stadtgrund(WOHNHAUS);
			await auctionService.auctionEscheatedEstates(stadtId, JETZT);

			expect(await auctionService.auctionEscheatedEstates(stadtId, JETZT + 1)).toBe(0);
		});

		it('wartet ein Spieljahr, wenn sich kein Käufer fand', async () => {
			// Ohne Frist stünde dasselbe Haus im nächsten Tick wieder unter dem Hammer, ein
			// Spieljahr lang fünfzig Mal.
			await stadtgrund(WOHNHAUS);
			await auctionService.auctionEscheatedEstates(stadtId, JETZT);
			const ohneGebot: number = JETZT + AUCTION_TICKS;
			await auctionService.advanceAuctions(stadtId, ohneGebot);

			expect(await auctionService.auctionEscheatedEstates(stadtId, ohneGebot + 1)).toBe(0);
			expect(
				await auctionService.auctionEscheatedEstates(
					stadtId,
					ohneGebot + auctionService.RE_AUCTION_AFTER
				)
			).toBe(1);
		});

		it('gibt Haus und Boden an denselben Ersteigerer', async () => {
			// Zwei Eigentümer für ein Anwesen sind kein Zustand, den das Spiel kennt.
			const { plotId, hausId } = await stadtgrund(WOHNHAUS);
			await auctionService.auctionEscheatedEstates(stadtId, JETZT);
			const auktion = (await auctionService.getOpenAuctions(stadtId))[0];
			const bieter = await person('Bieterin', 500);
			await auctionService.bid(bieter, auktion.id, 100);

			await auctionService.advanceAuctions(stadtId, JETZT + AUCTION_TICKS);

			const grund = await Plot.findByPk(plotId);
			const haus = await Building.findByPk(hausId!);
			expect(grund!.dataValues.OwnerCharacterId).toBe(bieter);
			expect(haus!.dataValues.OwnerCharacterId).toBe(bieter);
			expect(haus!.dataValues.ownerType).toBe('CHARACTER');
		});
	});
});
