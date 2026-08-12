import { Op, type Transaction } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Building as BuildingModel } from '$lib/db/model/building';
import { Plot as PlotModel } from '$lib/db/model/plot';
import { Region as RegionModel } from '$lib/db/model/region';
import type { Plot } from '$lib/model/plot';
import { convertToPlot } from '$lib/db/attributes/plot.attributes';
import { buyPlot as buyPlotLogic, type ActionFailureReason } from '$lib/game/buildingAction.logic';
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

/** Nie vergebenes Bauland in der Region — das, was sich kaufen lässt. */
export async function getFreeBuildingLand(regionId: string): Promise<PlotOnList[]> {
	const gefunden = await PlotModel.findAll({
		where: { RegionId: regionId, type: 'BUILDING_LAND', ownerType: 'NONE' },
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
