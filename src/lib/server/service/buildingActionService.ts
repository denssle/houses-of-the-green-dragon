import { type Transaction } from 'sequelize';
import type { BuildingAction } from '$lib/model/buildingAction';
import { sequelize } from '$lib/db/sequelize';
import { work, type ActionFailureReason } from '$lib/game/buildingAction.logic';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Die Gebäudehandlungen: Regeln in `buildingAction.logic.ts`, Persistenz hier.
 *
 * Jede Handlung, die Ressourcen verbraucht, läuft in einer Transaktion mit Sperre auf
 * die Charakterzeile — zwei gleichzeitige „arbeiten“ dürfen denselben Aktionspunkt nicht
 * zweimal ausgeben.
 */

export type ActionResult =
	| { ok: true; earned: number }
	| { ok: false; reason: ActionFailureReason };

export async function doBuildingAction(
	action: BuildingAction,
	characterId: string,
	buildingId: string
): Promise<ActionResult> {
	switch (action) {
		case 'WORK':
			return arbeiten(characterId, buildingId);
	}
}

async function arbeiten(characterId: string, buildingId: string): Promise<ActionResult> {
	const gebäude = await buildingService.getBuilding(buildingId);
	const option = gebäude ? buildingService.getBuildingOption(gebäude.optionId) : undefined;
	const regionId = await buildingService.getBuildingRegionId(buildingId);
	if (!gebäude || !option || !regionId) {
		return { ok: false, reason: 'NOT_A_WORKPLACE' };
	}

	const tick = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		// Erst nachwachsen lassen, dann abrechnen: Sonst ginge eine Schicht gegen den
		// Stand von gestern, und wer lange nicht da war, könnte gar nicht arbeiten.
		const arbeiter = await characterService.loadForAction(characterId, tick, t);
		if (!arbeiter) return { ok: false, reason: 'NOT_A_WORKPLACE' } as const;

		const ergebnis = work(
			{
				actionPoints: arbeiter.dataValues.actionPoints,
				money: arbeiter.dataValues.money,
				regionId: arbeiter.dataValues.RegionId
			},
			{ regionId, template: option }
		);
		if (!ergebnis.ok) return ergebnis;

		await arbeiter.update(
			{ actionPoints: ergebnis.actionPoints, money: ergebnis.money },
			{ transaction: t }
		);
		return { ok: true, earned: ergebnis.earned } as const;
	});
}
