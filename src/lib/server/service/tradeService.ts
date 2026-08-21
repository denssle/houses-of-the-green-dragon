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
			// **Auslagern kann jetzt auch an der Kammer scheitern** (5.33) — deshalb beide
			// Fragen vorweg und die Buchungen danach. Eine Transaktion, die mit einer
			// Fehlermeldung zurückkehrt, wird trotzdem festgeschrieben: Wer zwischendrin
			// abbricht, hat die Ware zweimal oder gar nicht.
			const menge: number = -quantity;
			if (!(await buildingHasStock(buildingId, [{ itemId, quantity: menge }], t))) {
				return { ok: false, reason: 'NOT_IN_STOCK' } as const;
			}
			if (!(await needService.changeStock(characterId, itemId, menge, t))) {
				return { ok: false, reason: 'CHAMBER_FULL' } as const;
			}
			await changeBuildingStock(buildingId, itemId, quantity, t);
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

/**
 * Liegt im Betriebslager, was ein Rezept verlangt — alles davon?
 *
 * **Erst fragen, dann nehmen.** `changeBuildingStock` gibt zwar `false` zurück, wenn eine
 * Zutat fehlt, aber da sind die vorherigen schon aus dem Lager. Wer bei der dritten Zutat
 * abbricht, hat zwei verbraucht und nichts hergestellt — und in einer Transaktion, die
 * hinterher trotzdem festgeschrieben wird, bleibt genau das stehen. Deshalb diese Frage
 * vorweg: Sie rührt nichts an.
 */
export async function buildingHasStock(
	buildingId: string,
	needed: { itemId: string; quantity: number }[],
	t: Transaction
): Promise<boolean> {
	for (const posten of needed) {
		if (posten.quantity <= 0) continue;
		const zeile = await BuildingStock.findOne({
			where: { BuildingId: buildingId, itemId: posten.itemId },
			transaction: t
		});
		if ((zeile?.dataValues.quantity ?? 0) < posten.quantity) return false;
	}
	return true;
}

/**
 * Was einer besitzt — in der Kammer **und** in allen seinen Häusern (5.25, Punkt 72).
 *
 * **Seit Ware dort liegt, wo sie entsteht, liegt sie selten dort, wo sie gebraucht wird.**
 * Die Ernte fällt auf dem Hof an, verarbeitet wird in der Werkstatt, gebaut auf dem
 * Grundstück — drei Orte, ein Besitzer. Vorher suchte jede dieser Stellen nur an je einem
 * Ort, und im Messlauf lagen 512 Stämme im Hof, während die Zimmerei desselben Menschen
 * stillstand.
 *
 * **Das ist bewusst eine Vereinfachung**, und sie sei benannt: Ein Handwerker greift
 * hiermit auf Holz zu, das eine Wegstunde entfernt liegt. Solange Entfernungen im Spiel
 * nichts kosten, ist der Lagerort ohnehin eine Frage der Buchung — es gibt heute keine
 * Regel, die einen Weg bezahlt. Sobald es sie gibt (Punkt 31, die Karte als
 * Sechseckraster), gehört diese Stelle als erste überarbeitet: Dann wird aus dem
 * Fernzugriff ein Fuhrwerk.
 */
export async function getOwnedStock(characterId: string): Promise<Map<string, number>> {
	const vorrat = new Map<string, number>();

	for (const posten of await needService.getStock(characterId)) {
		vorrat.set(posten.itemId, (vorrat.get(posten.itemId) ?? 0) + posten.quantity);
	}
	for (const haus of await buildingService.getBuildingsOfCharacter(characterId)) {
		for (const posten of await getBuildingStock(haus.id)) {
			vorrat.set(posten.itemId, (vorrat.get(posten.itemId) ?? 0) + posten.quantity);
		}
	}
	return vorrat;
}

/**
 * Etwas aus dem eigenen Besitz verbrauchen — woher auch immer.
 *
 * **Die Kammer zuerst**, dann die Häuser: Was einer bei sich trägt, ist am schnellsten zur
 * Hand, und so bleibt in den Lagern liegen, was zum Verkauf gedacht ist. Gibt `false`
 * zurück, wenn es insgesamt nicht reicht — dann wurde nichts angerührt, denn der Aufrufer
 * steckt in einer Transaktion.
 */
export async function consumeOwned(
	characterId: string,
	itemId: string,
	quantity: number,
	t: Transaction
): Promise<boolean> {
	if (quantity <= 0) return true;
	if (((await getOwnedStock(characterId)).get(itemId) ?? 0) < quantity) return false;

	let offen: number = quantity;

	const kammer: number =
		(await needService.getStock(characterId)).find((posten) => posten.itemId === itemId)
			?.quantity ?? 0;
	const ausDerKammer: number = Math.min(kammer, offen);
	if (ausDerKammer > 0) {
		await needService.changeStock(characterId, itemId, -ausDerKammer, t);
		offen -= ausDerKammer;
	}

	for (const haus of await buildingService.getBuildingsOfCharacter(characterId)) {
		if (offen === 0) break;
		const imLager: number =
			(await getBuildingStock(haus.id)).find((posten) => posten.itemId === itemId)?.quantity ?? 0;
		const daraus: number = Math.min(imLager, offen);
		if (daraus > 0) {
			await changeBuildingStock(haus.id, itemId, -daraus, t);
			offen -= daraus;
		}
	}
	return offen === 0;
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

		// **Der Stand ist gemietet, nicht die Ware.** Wer nachlegt, zahlt nicht noch einmal
		// — das Gesetz nennt es „was ein Stand am Markt je Angebot kostet", und ein
		// aufgestocktes Schild ist dasselbe Angebot.
		//
		// Ohne diese Unterscheidung war das Standgeld eine Falle für genau den, dem die
		// Ware liegen blieb: Im Messlauf zu 5.18 erntete ein Pächter Tick für Tick Holz,
		// legte es nach und zahlte jedes Mal zwei Münzen. Nach vierzig Spieljahren lagen
		// 2857 Stämme am Markt, und ihr Besitzer war mit 22 Münzen der ärmste Mann der
		// Stadt. Wer nichts verkauft, soll nichts verdienen — arm werden soll er daran
		// nicht.
		const faellig: number = bestehendes ? 0 : standgeld;

		const geplant = offerLogic(
			{ money: verkaeufer.dataValues.money },
			art,
			vorrat,
			quantity,
			pricePerUnit,
			faellig
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
			// **Das Angebot bleibt hängen, wenn die Kammer nicht reicht** (5.33). Ware
			// verschwinden zu lassen wäre schlimmer als ein Preisschild, das noch einen Tag
			// länger hängt — und der Ausweg steht daneben: erst etwas einlagern oder essen.
			if (
				!(await needService.changeStock(
					sellerId,
					angebot.dataValues.itemId,
					angebot.dataValues.quantity,
					t
				))
			) {
				return { ok: false, reason: 'CHAMBER_FULL' } as const;
			}
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

		// **Die Ware zuerst.** Passt sie nicht in die Kammer des Käufers, findet der Kauf
		// nicht statt — und zwar bevor Geld geflossen ist. Eine Transaktion, die mit einer
		// Fehlermeldung zurückkehrt, wird trotzdem festgeschrieben; wer hier erst zahlt
		// und dann prüft, hat einen Käufer ohne Ware und ohne Münzen.
		if (!(await needService.changeStock(buyerId, angebot.dataValues.itemId, wanted, t))) {
			return { ok: false, reason: 'CHAMBER_FULL' } as const;
		}

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
