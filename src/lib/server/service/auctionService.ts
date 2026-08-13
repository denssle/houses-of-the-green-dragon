import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Auction, Bid as BidRow } from '$lib/db/model/auction';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import {
	AUCTION_TICKS,
	award,
	type Bid,
	canBid,
	DEVELOPMENT_COST_PER_PLOT,
	MAX_PLOTS_PER_DEVELOPMENT,
	nextBid,
	npcBid,
	ranking
} from '$lib/game/auction.logic';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as electionService from '$lib/server/service/electionService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Erschließung und Versteigerung.
 *
 * Der Bürgermeister lässt Bauland ausweisen, die Stadt zahlt dafür — und was dabei
 * entsteht, geht an den Höchstbietenden. Damit hat die Stadtkasse zum ersten Mal eine
 * Einnahme, die größer sein kann als die Ausgabe: Wie viel, entscheidet die Knappheit.
 *
 * **Der Zuschlag ist eine Rechnung, kein gespeicherter Zustand** — das höchste Gebot,
 * dessen Bieter noch zahlen kann. Wer inzwischen sein Geld ausgegeben hat, wird
 * übergangen; der Nächste rückt nach, genau wie bei der Amtsnachfolge aus 4.7a. Dadurch
 * braucht es keine Reservierung, die mitgeführt werden müsste.
 */

export type AuctionResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/** Die Namen für neue Gassen — in dieser Reihenfolge vergeben. */
const NEUE_GASSEN = [
	'Neustadt',
	'Hinter der Mauer',
	'Lehmgrube',
	'Brunnenweg',
	'Lange Zeile',
	'Krummer Winkel'
] as const;

export type DevelopResult =
	| { ok: true; plots: number; spent: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Bauland ausweisen — die dritte Amtshandlung mit Kosten.
 *
 * Die Stadt zahlt je Grundstück; die Grundstücke gehen anschließend in die
 * Versteigerung, nicht in den Verkauf. Deshalb ist die Erschließung kein sicheres
 * Geschäft: Sind alle satt, bleibt sie auf den Kosten sitzen.
 */
export async function developLand(
	characterId: string,
	regionId: string,
	count: number
): Promise<DevelopResult> {
	const tick: number = await worldService.currentTick();

	const inhaber = await electionService.getHolder(regionId);
	if (inhaber?.characterId !== characterId) return { ok: false, reason: 'NOT_IN_OFFICE' };
	if (!Number.isInteger(count) || count < 1 || count > MAX_PLOTS_PER_DEVELOPMENT) {
		return { ok: false, reason: 'NOTHING_TO_DO' };
	}

	return sequelize.transaction(async (t: Transaction) => {
		const stadt = await Region.findByPk(regionId, { transaction: t, lock: t.LOCK.UPDATE });
		const kasse: number = stadt?.dataValues.treasury ?? 0;
		const kosten: number = count * DEVELOPMENT_COST_PER_PLOT;
		if (!stadt || kasse < kosten) return { ok: false, reason: 'NOT_ENOUGH_MONEY' } as const;

		await stadt.update({ treasury: kasse - kosten }, { transaction: t });

		// Die Adresse ergibt sich aus dem, was schon steht: erst die Gasse auffüllen, dann
		// die nächste anfangen. Sonst hieße jedes neue Grundstück „Neustadt 1".
		const vorhanden: number = await Plot.count({ where: { RegionId: regionId }, transaction: t });
		for (let i = 0; i < count; i++) {
			const laufend: number = vorhanden + i;
			const gasse: string = NEUE_GASSEN[Math.floor(laufend / 4) % NEUE_GASSEN.length];
			const hausnummer: number = (laufend % 4) + 1;

			const plotId: string = randomUUID();
			await Plot.create(
				{
					id: plotId,
					address: `${gasse} ${hausnummer}`,
					type: 'BUILDING_LAND',
					RegionId: regionId,
					ownerType: 'NONE'
				},
				{ transaction: t }
			);
			await Auction.create(
				{
					id: randomUUID(),
					PlotId: plotId,
					RegionId: regionId,
					openedTick: tick,
					closesTick: tick + AUCTION_TICKS,
					closed: false
				},
				{ transaction: t }
			);
		}

		await chronicleService.record(
			'LAND_DEVELOPED',
			regionId,
			tick,
			{ subjectId: characterId, value: count },
			t
		);
		return { ok: true, plots: count, spent: kosten } as const;
	});
}

// --- Bieten --------------------------------------------------------------------------

async function gebote(auctionId: string, t?: Transaction): Promise<Bid[]> {
	const zeilen = await BidRow.findAll({ where: { AuctionId: auctionId }, transaction: t });
	return zeilen.map((zeile) => ({
		bidderId: zeile.dataValues.CharacterId,
		amount: zeile.dataValues.amount,
		tick: zeile.dataValues.tick
	}));
}

export async function bid(
	characterId: string,
	auctionId: string,
	amount: number
): Promise<AuctionResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const auktion = await Auction.findByPk(auctionId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!auktion) return { ok: false, reason: 'NOT_FOR_SALE' } as const;

		const bieter = await Character.findByPk(characterId, { transaction: t });
		if (!bieter) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const bisher: Bid[] = await gebote(auctionId, t);
		const bestes: Bid | undefined = ranking(bisher)[0];

		const geprueft = canBid(
			{ money: bieter.dataValues.money, isHighest: bestes?.bidderId === characterId },
			{
				open: !auktion.dataValues.closed && tick < auktion.dataValues.closesTick,
				highest: bestes?.amount ?? null
			},
			amount
		);
		if (!geprueft.ok) return geprueft;

		// Ein Bieter, eine Zeile: Ein neues Gebot ersetzt sein altes.
		await BidRow.upsert(
			{ AuctionId: auctionId, CharacterId: characterId, amount, tick },
			{ transaction: t }
		);
		return { ok: true } as const;
	});
}

// --- Zuschlag ------------------------------------------------------------------------

export interface AuctionTick {
	closed: number;
	awarded: number;
}

/**
 * Fällige Versteigerungen zuschlagen.
 *
 * Vorher bieten die NPCs — wie beim Wählen erst zum Schluss: Ein Gebot ist eine
 * Entscheidung, und wer sie am ersten Tag trifft, hatte nur weniger Zeit, sich den Preis
 * anzusehen.
 */
export async function advanceAuctions(regionId: string, tick: number): Promise<AuctionTick> {
	const faellige = await Auction.findAll({
		where: { RegionId: regionId, closed: false, closesTick: { [Op.lte]: tick } }
	});

	let zugeschlagen = 0;
	for (const auktion of faellige) {
		await npcsBietenLassen(auktion.dataValues.id, regionId, tick);

		const alle: Bid[] = await gebote(auktion.dataValues.id);
		const kassen = new Map<string, number>();
		for (const gebot of alle) {
			const person = await Character.findByPk(gebot.bidderId);
			// Ein Toter zahlt nicht — sein Gebot fällt beim Zuschlag heraus, ohne dass es
			// jemand löschen müsste.
			if (person && person.dataValues.deathTick === null) {
				kassen.set(gebot.bidderId, person.dataValues.money);
			}
		}

		const sieger: Bid | undefined = award(alle, kassen);
		await auktion.update({ closed: true });
		if (!sieger) continue;

		await sequelize.transaction(async (t: Transaction) => {
			await Character.increment('money', {
				by: -sieger.amount,
				where: { id: sieger.bidderId },
				transaction: t
			});
			await Region.increment('treasury', {
				by: sieger.amount,
				where: { id: regionId },
				transaction: t
			});
			await Plot.update(
				{ ownerType: 'CHARACTER', OwnerCharacterId: sieger.bidderId },
				{ where: { id: auktion.dataValues.PlotId }, transaction: t }
			);
			await chronicleService.record(
				'AUCTION_WON',
				regionId,
				tick,
				{ subjectId: sieger.bidderId, value: sieger.amount },
				t
			);
		});
		zugeschlagen++;
	}

	return { closed: faellige.length, awarded: zugeschlagen };
}

/**
 * NPCs bieten mit.
 *
 * Sonst wäre jede Versteigerung ohne anwesenden Spieler eine Formsache, und die Stadt
 * bekäme für ihr erschlossenes Land nie mehr als das Mindestgebot. Geboten wird nur, wer
 * noch kein Grundstück hat — wer schon eins besitzt, hat Dringenderes mit seinem Geld
 * vor.
 */
async function npcsBietenLassen(
	auctionId: string,
	regionId: string,
	tick: number
): Promise<number> {
	const npcs = await Character.findAll({
		where: { RegionId: regionId, deathTick: null, role: 'NPC', money: { [Op.gt]: 0 } }
	});

	let neue = 0;
	for (const npc of npcs) {
		const schonBesitz: number = await Plot.count({
			where: { OwnerCharacterId: npc.dataValues.id }
		});
		if (schonBesitz > 0) continue;

		const bisher: Bid[] = await gebote(auctionId);
		const bestes: Bid | undefined = ranking(bisher)[0];
		if (bestes?.bidderId === npc.dataValues.id) continue;

		const gebot: number | undefined = npcBid(npc.dataValues.money, bestes?.amount ?? null);
		if (gebot === undefined) continue;

		await BidRow.upsert({
			AuctionId: auctionId,
			CharacterId: npc.dataValues.id,
			amount: gebot,
			tick
		});
		neue++;
	}
	return neue;
}

// --- Anzeigen ------------------------------------------------------------------------

export interface AuctionOnList {
	id: string;
	address: string;
	closesTick: number;
	highest: number | null;
	highestBidderName: string | null;
	mine: boolean;
	nextBid: number;
}

export async function getOpenAuctions(
	regionId: string,
	viewerId?: string
): Promise<AuctionOnList[]> {
	const offene = await Auction.findAll({
		where: { RegionId: regionId, closed: false },
		order: [['closesTick', 'ASC']]
	});

	const liste: AuctionOnList[] = [];
	for (const auktion of offene) {
		const flaeche = await Plot.findByPk(auktion.dataValues.PlotId);
		if (!flaeche) continue;

		const bestes: Bid | undefined = ranking(await gebote(auktion.dataValues.id))[0];
		const bieter = bestes ? await Character.findByPk(bestes.bidderId) : null;

		liste.push({
			id: auktion.dataValues.id,
			address: flaeche.dataValues.address,
			closesTick: auktion.dataValues.closesTick,
			highest: bestes?.amount ?? null,
			highestBidderName: bieter?.dataValues.firstName ?? null,
			mine: bestes?.bidderId === viewerId,
			nextBid: nextBid(bestes?.amount ?? null)
		});
	}
	return liste;
}
