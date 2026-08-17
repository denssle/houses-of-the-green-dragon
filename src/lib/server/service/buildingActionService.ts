import type { ActionFailureReason } from '$lib/game/actionFailure';
import { type Transaction } from 'sequelize';
import type { BuildingAction } from '$lib/model/buildingAction';
import { sequelize } from '$lib/db/sequelize';
import { repairForHire, REPAIR_ACTION_POINT_COST } from '$lib/game/buildingAction.logic';
import { CONDITION_MAX } from '$lib/game/building.logic';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as employmentService from '$lib/server/service/employmentService';
import * as skillService from '$lib/server/service/skillService';
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
		case 'REPAIR_FOR_HIRE':
			return fuerLohnHerrichten(characterId, buildingId);
	}
}

/**
 * Für Lohn an einem fremden Haus arbeiten — und es dabei instand setzen (5.26).
 *
 * **Der Ersatz für die Tagelöhnerei.** Die bestand darin, in die städtische Schmiede zu
 * gehen und drei Münzen mitzunehmen; niemand bekam etwas dafür. Solange die Münzen aus
 * dem Nichts kamen, fiel das nicht auf — seit der Lohn eine Kasse hat (5.24), war es ein
 * Fass ohne Boden, und die Stadt lief binnen hundert Ticks leer.
 *
 * Jetzt hinterlässt die Arbeit etwas: **Wer hier schuftet, hebt den Zustand des Hauses.**
 * Damit ist der Lohn gedeckt — und für die Stadt ändert sich weniger, als es klingt: Sie
 * hat Instandhaltung immer schon bezahlt (`renovatePublicBuilding` nimmt es aus der
 * Kasse), nur zahlte sie an niemanden. Jetzt zahlt sie Menschen.
 *
 * **Wer zahlt, ist der Eigentümer** — bei einem öffentlichen Bau die Stadt. Am eigenen
 * Haus arbeitet man ohne Lohn: Das ist dann keine Lohnarbeit, sondern Eigenleistung, und
 * dafür gibt es `renovateBuilding`.
 *
 * Was fehlt und als Punkt 74 festgehalten ist: **der private Auftrag.** Ein Hausbesitzer
 * kann heute nicht ausschreiben, dass er sein Dach gerichtet haben will — sonst richtete
 * jeder ungefragt fremde Häuser her und schickte die Rechnung. Bis dahin ist diese
 * Handlung auf städtische Bauten beschränkt.
 */
async function fuerLohnHerrichten(characterId: string, buildingId: string): Promise<ActionResult> {
	const gebäude = await buildingService.getBuilding(buildingId);
	const regionId = await buildingService.getBuildingRegionId(buildingId);
	if (!gebäude || !regionId) return { ok: false, reason: 'NOT_A_WORKPLACE' };

	// Vorerst nur öffentliche Bauten: Der private Auftrag fehlt (Punkt 74).
	if (gebäude.ownerType !== 'CITY') return { ok: false, reason: 'NOT_A_WORKPLACE' };
	if (gebäude.condition >= CONDITION_MAX) return { ok: false, reason: 'NOTHING_TO_DO' };

	const tick = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		// Erst nachwachsen lassen, dann abrechnen: Sonst ginge eine Schicht gegen den
		// Stand von gestern, und wer lange nicht da war, könnte gar nicht arbeiten.
		const arbeiter = await characterService.loadForAction(characterId, tick, t);
		if (!arbeiter) return { ok: false, reason: 'NOT_A_WORKPLACE' } as const;

		const kasse = await employmentService.kasseVon(buildingId, gebäude.ownerCharacterId, t);
		if (!kasse) return { ok: false, reason: 'NOT_A_WORKPLACE' } as const;

		const ergebnis = repairForHire(
			{
				actionPoints: arbeiter.dataValues.actionPoints,
				money: arbeiter.dataValues.money,
				buildingSkill: await skillService.getLevel(characterId, 'CONSTRUCTION', t)
			},
			{ money: kasse.money },
			gebäude.condition
		);
		if (!ergebnis.ok) return ergebnis;

		await arbeiter.update(
			{ actionPoints: ergebnis.actionPoints, money: ergebnis.money },
			{ transaction: t }
		);
		await kasse.zahle(ergebnis.employerMoney, t);
		// `lastConditionTick` mitschreiben: Ohne ihn liefe der Verfall ab dem alten
		// Stichtag weiter und die Arbeit wäre im selben Moment wieder verbraucht.
		await buildingService.setCondition(buildingId, ergebnis.condition, tick, t);
		// Wer Häuser herrichtet, lernt das Bauen — wie beim Renovieren auf eigene Rechnung.
		await skillService.addPractice(characterId, 'CONSTRUCTION', REPAIR_ACTION_POINT_COST, t);

		return { ok: true, earned: ergebnis.earned } as const;
	});
}
