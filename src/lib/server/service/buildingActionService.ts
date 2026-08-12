import { type Transaction } from 'sequelize';
import type { BuildingAction } from '$lib/model/buildingAction';
import { sequelize } from '$lib/db/sequelize';
import { Character as CharacterModel } from '$lib/db/model/character';
import { work, type ActionFailureReason } from '$lib/game/buildingAction.logic';
import * as buildingService from '$lib/server/service/buildingService';

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

	return sequelize.transaction(async (t: Transaction) => {
		const arbeiter = await CharacterModel.findByPk(characterId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
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
