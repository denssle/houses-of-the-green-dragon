import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { buy, offer as offerLogic, type ShopKind, shopKindFor } from '$lib/game/trade.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as lawService from '$lib/server/service/lawService';
import * as nameService from '$lib/server/service/nameService';
import * as needService from '$lib/server/service/needService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Handel: Lager, Preisschilder und Käufe.
 *
 * **Jedes Handelshaus ist zugleich Verkaufsstelle** — der Marktplatz ist deshalb kein
 * zweites System, sondern ein öffentliches Gebäude mit einer anderen Regel darüber, wer
 * dort ein Preisschild aushängen darf. Eine Tabelle, zwei Regeln.
 */

export type TradeResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/** Die Vorlage, an der ein Gebäude als Marktplatz zu erkennen ist. */
export const MARKET_OPTION_ID = 6;

async function alsLaden(buildingId: string): Promise<
	| {
			id: string;
			ownerType: string;
			ownerCharacterId: string | null;
			isMarket: boolean;
			regionId: string | null;
	  }
	| undefined
> {
	const gebaeude = await buildingService.getBuilding(buildingId);
	if (!gebaeude) return undefined;

	const grundstueck = gebaeude.plotId ? await Plot.findByPk(gebaeude.plotId) : null;
	return {
		id: gebaeude.id,
		ownerType: gebaeude.ownerType,
		ownerCharacterId: gebaeude.ownerCharacterId,
		isMarket: gebaeude.optionId === MARKET_OPTION_ID,
		regionId: grundstueck?.dataValues.RegionId ?? null
	};
}

// --- Das Lager -----------------------------------------------------------------------

/**
 * Ware zwischen eigener Kammer und Betriebslager bewegen.
 *
 * Nur der Eigentümer, und nur in seinem eigenen Betrieb: Ein fremdes Lager zu füllen
 * wäre ein Geschenk, es zu leeren ein Diebstahl.
 */
export async function moveToStock(
	characterId: string,
	buildingId: string,
	itemId: string,
	quantity: number
): Promise<TradeResult> {
	if (!Number.isInteger(quantity) || quantity === 0) {
		return { ok: false, reason: 'NOTHING_TO_DO' };
	}

	const laden = await alsLaden(buildingId);
	if (!laden || laden.ownerCharacterId !== characterId) {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}

	return sequelize.transaction(async (t: Transaction) => {
		// Einlegen: erst aus der Kammer nehmen, dann ins Lager. Auslagern andersherum.
		if (quantity > 0) {
			if (!(await needService.changeStock(characterId, itemId, -quantity, t))) {
				return { ok: false, reason: 'NOT_IN_STOCK' } as const;
			}
			await changeBuildingStock(buildingId, itemId, quantity, t);
		} else {
			if (!(await changeBuildingStock(buildingId, itemId, quantity, t))) {
				return { ok: false, reason: 'NOT_IN_STOCK' } as const;
			}
			await needService.changeStock(characterId, itemId, -quantity, t);
		}
		return { ok: true } as const;
	});
}

/** Legt etwas ins Betriebslager oder nimmt es heraus. Leere Zeilen verschwinden. */
export async function changeBuildingStock(
	buildingId: string,
	itemId: string,
	delta: number,
	t: Transaction
): Promise<boolean> {
	const zeile = await BuildingStock.findOne({
		where: { BuildingId: buildingId, itemId },
		transaction: t,
		lock: t.LOCK.UPDATE
	});
	const nachher: number = (zeile?.dataValues.quantity ?? 0) + delta;
	if (nachher < 0) return false;

	if (nachher === 0) {
		if (zeile) {
			await BuildingStock.destroy({
				where: { BuildingId: buildingId, itemId },
				transaction: t
			});
		}
		return true;
	}

	await BuildingStock.upsert(
		{ BuildingId: buildingId, itemId, quantity: nachher },
		{ transaction: t }
	);
	return true;
}

export interface StockLine {
	itemId: string;
	name: string;
	quantity: number;
}

export async function getBuildingStock(buildingId: string): Promise<StockLine[]> {
	const alle = await BuildingStock.findAll({ where: { BuildingId: buildingId } });

	const lager: StockLine[] = [];
	for (const zeile of alle) {
		const vorlage = getItemTemplate(zeile.dataValues.itemId);
		if (!vorlage) continue;
		lager.push({ itemId: vorlage.itemId, name: vorlage.name, quantity: zeile.dataValues.quantity });
	}
	return lager;
}

// --- Preisschilder -------------------------------------------------------------------

/**
 * Ein Angebot aushängen.
 *
 * Die Ware wandert dabei ins Angebot: im eigenen Laden aus dem Betriebslager, am Markt
 * aus der eigenen Habe. Das Standgeld geht an die Stadt.
 */
export async function placeOffer(
	sellerId: string,
	buildingId: string,
	itemId: string,
	quantity: number,
	pricePerUnit: number
): Promise<TradeResult> {
	const laden = await alsLaden(buildingId);
	if (!laden) return { ok: false, reason: 'NOT_FOR_SALE' };
	if (!getItemTemplate(itemId)) return { ok: false, reason: 'NOT_FOR_SALE' };

	const art: ShopKind = shopKindFor(laden, sellerId);
	const tick: number = await worldService.currentTick();
	// Der Satz ist ein Gesetz, kein Literal — der Buergermeister kann ihn verschoben haben.
	const standgeld: number = laden.regionId ? await lawService.rate(laden.regionId, 'STALL_FEE') : 0;

	return sequelize.transaction(async (t: Transaction) => {
		const verkaeufer = await characterService.loadForAction(sellerId, tick, t);
		if (!verkaeufer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const vorrat: number =
			art === 'MARKET'
				? ((await needService.getStock(sellerId)).find((p) => p.itemId === itemId)?.quantity ?? 0)
				: ((await getBuildingStock(buildingId)).find((p) => p.itemId === itemId)?.quantity ?? 0);

		const geplant = offerLogic(
			{ money: verkaeufer.dataValues.money },
			art,
			vorrat,
			quantity,
			pricePerUnit,
			standgeld
		);
		if (!geplant.ok) return geplant;

		if (art === 'MARKET') {
			await needService.changeStock(sellerId, itemId, -quantity, t);
		} else {
			await changeBuildingStock(buildingId, itemId, -quantity, t);
		}

		if (geplant.fee > 0) {
			await verkaeufer.update({ money: geplant.sellerMoney }, { transaction: t });
			if (laden.regionId) {
				await Region.increment('treasury', {
					by: geplant.fee,
					where: { id: laden.regionId },
					transaction: t
				});
			}
		}

		// **Gleiche Ware, gleicher Preis, gleicher Ort: aufstocken statt danebenhängen.**
		// Sonst steht am Ende ein Dutzend Schilder mit demselben Text — für Käufer eine
		// Liste, die man durchblättern muss, und für den Verkäufer keine Übersicht mehr.
		// Bei einem anderen Preis entsteht ein eigenes Angebot: Das ist eine andere
		// Aussage und keine Nachlieferung.
		const bestehendes = await ShopOffer.findOne({
			where: { BuildingId: buildingId, SellerCharacterId: sellerId, itemId, pricePerUnit },
			transaction: t,
			lock: t.LOCK.UPDATE
		});

		if (bestehendes) {
			await bestehendes.update(
				{ quantity: bestehendes.dataValues.quantity + quantity },
				{ transaction: t }
			);
		} else {
			await ShopOffer.create(
				{
					id: randomUUID(),
					BuildingId: buildingId,
					SellerCharacterId: sellerId,
					itemId,
					quantity,
					pricePerUnit
				},
				{ transaction: t }
			);
		}
		return { ok: true } as const;
	});
}

/** Ein Angebot zurückziehen — die Ware geht dahin zurück, wo sie herkam. */
export async function withdrawOffer(sellerId: string, offerId: string): Promise<TradeResult> {
	return sequelize.transaction(async (t: Transaction) => {
		const angebot = await ShopOffer.findByPk(offerId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!angebot || angebot.dataValues.SellerCharacterId !== sellerId) {
			return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;
		}

		const laden = await alsLaden(angebot.dataValues.BuildingId);
		if (laden && shopKindFor(laden, sellerId) === 'OWN') {
			await changeBuildingStock(
				angebot.dataValues.BuildingId,
				angebot.dataValues.itemId,
				angebot.dataValues.quantity,
				t
			);
		} else {
			await needService.changeStock(
				sellerId,
				angebot.dataValues.itemId,
				angebot.dataValues.quantity,
				t
			);
		}

		await angebot.destroy({ transaction: t });
		return { ok: true } as const;
	});
}

// --- Kaufen --------------------------------------------------------------------------

export async function buyFromOffer(
	buyerId: string,
	offerId: string,
	wanted: number
): Promise<TradeResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const angebot = await ShopOffer.findByPk(offerId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!angebot) return { ok: false, reason: 'NOT_FOR_SALE' } as const;

		const kaeufer = await characterService.loadForAction(buyerId, tick, t);
		if (!kaeufer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const laden = await alsLaden(angebot.dataValues.BuildingId);
		const steuersatz: number = laden?.regionId
			? await lawService.rate(laden.regionId, 'SALES_TAX', t)
			: 0;

		const ergebnis = buy(
			{ id: buyerId, money: kaeufer.dataValues.money },
			{
				sellerId: angebot.dataValues.SellerCharacterId,
				quantity: angebot.dataValues.quantity,
				pricePerUnit: angebot.dataValues.pricePerUnit
			},
			wanted,
			steuersatz
		);
		if (!ergebnis.ok) return ergebnis;

		await kaeufer.update({ money: ergebnis.buyerMoney }, { transaction: t });
		await Character.increment('money', {
			by: ergebnis.total,
			where: { id: angebot.dataValues.SellerCharacterId },
			transaction: t
		});
		// Der Verkäufer bekommt, was am Schild steht; die Steuer zahlt der Käufer obendrauf.
		if (ergebnis.tax > 0 && laden?.regionId) {
			await Region.increment('treasury', {
				by: ergebnis.tax,
				where: { id: laden.regionId },
				transaction: t
			});
		}
		await needService.changeStock(buyerId, angebot.dataValues.itemId, wanted, t);

		// Ein leeres Angebot verschwindet — wie Beziehungen und Vorräte, die auf null
		// fallen.
		if (ergebnis.remaining === 0) {
			await angebot.destroy({ transaction: t });
		} else {
			await angebot.update({ quantity: ergebnis.remaining }, { transaction: t });
		}
		return { ok: true } as const;
	});
}

// --- Anzeigen ------------------------------------------------------------------------

export interface OfferOnList {
	id: string;
	itemId: string;
	itemName: string;
	quantity: number;
	pricePerUnit: number;
	sellerId: string;
	sellerName: string;
	buildingId: string;
	buildingName: string;
	mine: boolean;
}

/** Alle Angebote eines Gebäudes. */
export async function getOffersAt(buildingId: string, viewerId?: string): Promise<OfferOnList[]> {
	return zuListe(await ShopOffer.findAll({ where: { BuildingId: buildingId } }), viewerId);
}

/**
 * Alles, was in dieser Stadt zu haben ist — über alle Läden und den Markt hinweg.
 *
 * Der Preisvergleich ist der halbe Handel: Wer nicht sieht, was der Nachbar nimmt, kann
 * seinen eigenen Preis nicht setzen.
 */
export async function getOffersInRegion(
	regionId: string,
	viewerId?: string
): Promise<OfferOnList[]> {
	const gebaeude = await Building.findAll({
		include: [{ model: Plot, as: 'plot', where: { RegionId: regionId }, required: true }]
	});
	const ids: string[] = gebaeude.map((g) => g.dataValues.id);
	if (ids.length === 0) return [];

	const angebote = await ShopOffer.findAll({
		where: { BuildingId: { [Op.in]: ids } },
		order: [['pricePerUnit', 'ASC']]
	});
	return zuListe(angebote, viewerId);
}

async function zuListe(
	angebote: Awaited<ReturnType<typeof ShopOffer.findAll>>,
	viewerId?: string
): Promise<OfferOnList[]> {
	// Am Markt steht jeder mit seinem Haus (5.10): Wer bei wem kauft, ist eine Frage
	// zwischen Familien.
	const namen = await nameService.displayNames(
		angebote.map((a) => a.dataValues.SellerCharacterId).filter((id): id is string => Boolean(id))
	);

	const liste: OfferOnList[] = [];
	for (const angebot of angebote) {
		const vorlage = getItemTemplate(angebot.dataValues.itemId);
		const verkaeufer = await Character.findByPk(angebot.dataValues.SellerCharacterId);
		const gebaeude = await Building.findByPk(angebot.dataValues.BuildingId);
		if (!vorlage || !gebaeude) continue;

		liste.push({
			id: angebot.dataValues.id,
			itemId: vorlage.itemId,
			itemName: vorlage.name,
			quantity: angebot.dataValues.quantity,
			pricePerUnit: angebot.dataValues.pricePerUnit,
			sellerId: angebot.dataValues.SellerCharacterId,
			sellerName: verkaeufer ? (namen.get(verkaeufer.dataValues.id) ?? 'jemand') : 'jemand',
			buildingId: gebaeude.dataValues.id,
			buildingName: gebaeude.dataValues.name,
			mine: angebot.dataValues.SellerCharacterId === viewerId
		});
	}
	return liste;
}

/**
 * Das billigste Angebot für eine Ware in dieser Stadt.
 *
 * Genau die Regel, nach der NPCs einkaufen: das billigste erreichbare Angebot, das ihr
 * Budget hergibt. Kein Verhandeln, kein Suchen — ein Blick über die Preisschilder.
 */
export async function cheapestOffer(
	regionId: string,
	itemId: string,
	exceptSellerId?: string
): Promise<OfferOnList | undefined> {
	const alle = await getOffersInRegion(regionId);
	return alle
		.filter((angebot) => angebot.itemId === itemId && angebot.sellerId !== exceptSellerId)
		.sort((a, b) => a.pricePerUnit - b.pricePerUnit)[0];
}
