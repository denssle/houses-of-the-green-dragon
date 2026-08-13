import { Auction } from '$lib/db/model/auction';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { Op, type Transaction } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Building as BuildingModel } from '$lib/db/model/building';
import { Character as CharacterModel } from '$lib/db/model/character';
import { Plot as PlotModel } from '$lib/db/model/plot';
import { Region as RegionModel } from '$lib/db/model/region';
import type { Plot } from '$lib/model/plot';
import { convertToPlot } from '$lib/db/attributes/plot.attributes';
import { buyPlot as buyPlotLogic } from '$lib/game/buildingAction.logic';
import { purchase } from '$lib/game/building.logic';
import { PLOT_PRICE } from '$lib/game/economy';
import * as characterService from '$lib/server/service/characterService';
import * as worldService from '$lib/server/service/worldService';

/** Was von einem Grundstück auf einer Liste steht. */
export interface PlotOnList extends Plot {
	/** Ob dort schon etwas steht — ein bebautes Grundstück nimmt kein zweites Haus auf. */
	hasBuilding: boolean;
}

async function withBuildings(plots: Plot[]): Promise<PlotOnList[]> {
	if (plots.length === 0) return [];
	const bebaut = await BuildingModel.findAll({
		where: { PlotId: { [Op.in]: plots.map((plot) => plot.id) } },
		attributes: ['PlotId']
	});
	const belegt = new Set(bebaut.map((eintrag) => eintrag.dataValues.PlotId));
	return plots.map((plot) => ({ ...plot, hasBuilding: belegt.has(plot.id) }));
}

/**
 * Nie vergebenes Bauland in der Region — das, was sich zum Festpreis kaufen lässt.
 *
 * **Ohne die Grundstücke, auf die gerade geboten wird.** Neu erschlossenes Land gehört
 * zunächst niemandem und stünde deshalb hier mit; wer wollte, könnte es für den alten
 * Festpreis mitnehmen, statt zu bieten — und die Versteigerung wäre eine Zierde. Beim
 * Durchspielen stand genau das auf der Seite: dasselbe Grundstück zweimal, einmal für 40
 * Münzen, einmal unter dem Hammer.
 */
export async function getFreeBuildingLand(regionId: string): Promise<PlotOnList[]> {
	const versteigert = await Auction.findAll({
		where: { RegionId: regionId, closed: false },
		attributes: ['PlotId']
	});
	const unterDemHammer: string[] = versteigert.map((zeile) => zeile.dataValues.PlotId);

	const gefunden = await PlotModel.findAll({
		where: {
			RegionId: regionId,
			type: 'BUILDING_LAND',
			ownerType: 'NONE',
			...(unterDemHammer.length > 0 ? { id: { [Op.notIn]: unterDemHammer } } : {})
		},
		order: [['address', 'ASC']]
	});
	return withBuildings(gefunden.map((eintrag) => convertToPlot(eintrag.dataValues)));
}

/** Was einem Charakter gehört. */
export async function getPlotsOfCharacter(characterId: string): Promise<PlotOnList[]> {
	const gefunden = await PlotModel.findAll({
		where: { OwnerCharacterId: characterId, ownerType: 'CHARACTER' },
		order: [['address', 'ASC']]
	});
	return withBuildings(gefunden.map((eintrag) => convertToPlot(eintrag.dataValues)));
}

export async function getPlot(plotId: string): Promise<Plot | undefined> {
	const gefunden = await PlotModel.findByPk(plotId);
	return gefunden ? convertToPlot(gefunden.dataValues) : undefined;
}

export type BuyResult = { ok: true; plot: Plot } | { ok: false; reason: ActionFailureReason };

/**
 * Kauft nie vergebenes Stadtland.
 *
 * Alles in **einer** Transaktion mit Sperre auf die Charakterzeile: Zwei gleichzeitige
 * Käufe dürfen dieselbe Münze nicht zweimal ausgeben. Die Sperre auf das Grundstück
 * verhindert das Gegenstück — dass zwei Käufer dasselbe Grundstück bekommen. Unter
 * SQLite laufen Schreibvorgänge ohnehin nacheinander, die Sperren wirken in Produktion.
 */
export async function buyPlot(plotId: string, characterId: string): Promise<BuyResult> {
	const tick = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const käufer = await characterService.loadForAction(characterId, tick, t);
		if (!käufer) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		const grundstück = await PlotModel.findByPk(plotId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!grundstück) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		// Nicht nur aus der Liste nehmen, sondern den Weg selbst versperren: Die Liste ist
		// die Anzeige, und wer die Kennung kennt, käme sonst über das Formular doch zum
		// Festpreis an ein Grundstück, um das gerade geboten wird.
		const laeuft: number = await Auction.count({
			where: { PlotId: plotId, closed: false },
			transaction: t
		});
		if (laeuft > 0) return { ok: false, reason: 'NOT_FOR_SALE' } as const;

		const ergebnis = buyPlotLogic(
			{ money: käufer.dataValues.money, regionId: käufer.dataValues.RegionId },
			{
				ownerCharacterId: grundstück.dataValues.OwnerCharacterId,
				ownerType: grundstück.dataValues.ownerType,
				regionId: grundstück.dataValues.RegionId
			},
			PLOT_PRICE
		);
		if (!ergebnis.ok) return ergebnis;

		await käufer.update({ money: ergebnis.money }, { transaction: t });
		await grundstück.update(
			{ ownerType: 'CHARACTER', OwnerCharacterId: characterId },
			{ transaction: t }
		);
		// Der Boden gehörte der Stadt, also bekommt sie das Geld. Ab 4.7 ist diese Kasse
		// der Hebel, an dem die Politik hängt.
		await RegionModel.increment('treasury', {
			by: ergebnis.spent,
			where: { id: grundstück.dataValues.RegionId },
			transaction: t
		});

		return { ok: true, plot: convertToPlot(grundstück.dataValues) } as const;
	});
}

// --- Handel unter Charakteren ---------------------------------------------------------

export type PlotTradeResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/**
 * Ein Preisschild an ein eigenes Grundstück hängen — oder es mit `null` abnehmen.
 *
 * Verkaufen heißt, einen Preis zu setzen: kein Auktionswesen, passend zum
 * Festpreisprinzip und zum asynchronen Spiel. Ein bebautes Grundstück wird über das
 * Gebäude verkauft, nicht hier — sonst stünde jemandes Haus auf fremdem Boden.
 */
export async function setPlotPrice(
	characterId: string,
	plotId: string,
	price: number | null
): Promise<PlotTradeResult> {
	const grundstück = await PlotModel.findByPk(plotId);
	if (!grundstück || grundstück.dataValues.OwnerCharacterId !== characterId) {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}
	const bebaut = await BuildingModel.count({ where: { PlotId: plotId } });
	if (bebaut > 0) {
		return { ok: false, reason: 'PLOT_ALREADY_BUILT' };
	}

	await grundstück.update({ forSalePrice: price });
	return { ok: true };
}

/** Ein Grundstück kaufen, das jemand zum Verkauf gestellt hat. */
export async function buyFromOwner(characterId: string, plotId: string): Promise<PlotTradeResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const grundstück = await PlotModel.findByPk(plotId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!grundstück) return { ok: false, reason: 'NOT_FOR_SALE' } as const;

		const käufer = await characterService.loadForAction(characterId, tick, t);
		if (!käufer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const ergebnis = purchase(
			{ id: characterId, money: käufer.dataValues.money },
			{
				ownerId: grundstück.dataValues.OwnerCharacterId,
				forSalePrice: grundstück.dataValues.forSalePrice
			}
		);
		if (!ergebnis.ok) return ergebnis;

		const verkäuferId: string | null = grundstück.dataValues.OwnerCharacterId;
		await käufer.update({ money: ergebnis.buyerMoney }, { transaction: t });
		if (verkäuferId) {
			await CharacterModel.increment('money', {
				by: ergebnis.price,
				where: { id: verkäuferId },
				transaction: t
			});
		}
		await grundstück.update(
			{ OwnerCharacterId: characterId, ownerType: 'CHARACTER', forSalePrice: null },
			{ transaction: t }
		);
		return { ok: true } as const;
	});
}

/** Was in dieser Stadt an Boden zum Verkauf steht. */
export async function getPlotsForSale(regionId: string): Promise<PlotOnList[]> {
	const alle = await PlotModel.findAll({
		where: {
			RegionId: regionId,
			ownerType: 'CHARACTER',
			forSalePrice: { [Op.ne]: null }
		}
	});
	return withBuildings(alle.map((eintrag) => convertToPlot(eintrag.dataValues)));
}
