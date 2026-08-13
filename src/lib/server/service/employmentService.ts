import { type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { canTakeJob, positionsAt, workShift } from '$lib/game/employment.logic';
import { yieldOf } from '$lib/game/production.logic';
import { AGE_OF_MAJORITY, ageInYears, seasonOf } from '$lib/game/time';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as skillService from '$lib/server/service/skillService';
import * as tradeService from '$lib/server/service/tradeService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Anstellung: für fremde Rechnung arbeiten.
 *
 * Bis 4.6d war ein Betrieb ein Werkzeug — wer mahlte, mahlte sein eigenes Getreide. Hier
 * wird er ein Arbeitgeber: Der Angestellte setzt seine Aktionspunkte ein, der Ertrag
 * geht ins Betriebslager, der Lohn aus der Kasse des Eigentümers an ihn.
 *
 * Damit hat zum ersten Mal Geld einen **Ursprung mit Deckung**. Die städtische Schmiede
 * zahlt aus dem Nichts; ein privater Betrieb kann nur zahlen, was er hat. Genau deshalb
 * kann die Schmiede ab jetzt zurückgebaut werden — sobald genug Betriebe stehen.
 */

export type EmploymentResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/** Den Aushang setzen — oder mit `null` abnehmen. */
export async function offerJob(
	ownerId: string,
	buildingId: string,
	wage: number | null
): Promise<EmploymentResult> {
	const gebaeude = await Building.findByPk(buildingId);
	if (!gebaeude || gebaeude.dataValues.OwnerCharacterId !== ownerId) {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}
	if (wage !== null && (!Number.isInteger(wage) || wage < 1)) {
		return { ok: false, reason: 'NOTHING_TO_DO' };
	}

	await gebaeude.update({ offeredWage: wage });
	return { ok: true };
}

/** Eine Stelle antreten. */
export async function takeJob(characterId: string, buildingId: string): Promise<EmploymentResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const gebaeude = await Building.findByPk(buildingId, { transaction: t, lock: t.LOCK.UPDATE });
		const vorlage = gebaeude
			? buildingService.getBuildingOption(gebaeude.dataValues.optionId)
			: undefined;
		if (!gebaeude || !vorlage) return { ok: false, reason: 'NO_JOB_OFFERED' } as const;

		const bewerber = await Character.findByPk(characterId, { transaction: t });
		if (!bewerber) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const belegt: number = await Employment.count({
			where: { BuildingId: buildingId },
			transaction: t
		});
		const schonAngestellt = await Employment.findOne({
			where: { EmployeeCharacterId: characterId },
			transaction: t
		});

		const geprueft = canTakeJob(
			{
				id: characterId,
				isAdult: ageInYears(bewerber.dataValues.birthTick, tick) >= AGE_OF_MAJORITY,
				hasJob: schonAngestellt !== null
			},
			{
				ownerId: gebaeude.dataValues.OwnerCharacterId,
				wage: gebaeude.dataValues.offeredWage,
				positions: positionsAt(vorlage, gebaeude.dataValues.level),
				taken: belegt
			}
		);
		if (!geprueft.ok) return geprueft;

		await Employment.create(
			{
				EmployeeCharacterId: characterId,
				BuildingId: buildingId,
				// Der vereinbarte Lohn wird festgehalten: Senkt der Eigentümer morgen den
				// Aushang, gilt das für den Nächsten, nicht rückwirkend.
				wagePerActionPoint: gebaeude.dataValues.offeredWage!,
				sinceTick: tick
			},
			{ transaction: t }
		);
		return { ok: true } as const;
	});
}

/** Kündigen — von beiden Seiten dieselbe Handlung. */
export async function endEmployment(employeeId: string): Promise<EmploymentResult> {
	await Employment.destroy({ where: { EmployeeCharacterId: employeeId } });
	return { ok: true };
}

export type ShiftResult =
	| { ok: true; wage: number; produced: number; itemId?: string }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Schicht beim Arbeitgeber.
 *
 * Was dabei entsteht, gehört dem Betrieb; was der Angestellte bekommt, ist Lohn. Fehlt
 * das Rezept — etwa in einer Schmiede, die noch keins hat —, bleibt es beim Lohn allein:
 * Der Angestellte hat gearbeitet, auch wenn nichts Greifbares dabei herauskam.
 */
export async function workForEmployer(employeeId: string): Promise<ShiftResult> {
	const tick: number = await worldService.currentTick();

	const stelle = await Employment.findOne({ where: { EmployeeCharacterId: employeeId } });
	if (!stelle) return { ok: false, reason: 'NO_JOB_OFFERED' };

	const gebaeude = await buildingService.getBuilding(stelle.dataValues.BuildingId);
	const vorlage = gebaeude ? buildingService.getBuildingOption(gebaeude.optionId) : undefined;
	if (!gebaeude || !vorlage || !gebaeude.ownerCharacterId) {
		// Der Betrieb ist verschwunden — zur Ruine geworden oder verkauft. Die Stelle
		// endet mit ihm.
		await endEmployment(employeeId);
		return { ok: false, reason: 'NO_JOB_OFFERED' };
	}

	const rezept = vorlage.recipe;
	const kosten: number = rezept?.actionPointCost ?? 1;

	return sequelize.transaction(async (t: Transaction) => {
		const angestellter = await characterService.loadForAction(employeeId, tick, t);
		const arbeitgeber = await Character.findByPk(gebaeude.ownerCharacterId!, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!angestellter || !arbeitgeber) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const koennen: number = rezept ? await skillService.getLevel(employeeId, rezept.skill, t) : 0;
		const menge: number = rezept ? yieldOf(rezept, koennen, gebaeude.condition) : 0;

		const ergebnis = workShift(
			{
				actionPoints: angestellter.dataValues.actionPoints,
				money: angestellter.dataValues.money
			},
			{ money: arbeitgeber.dataValues.money },
			stelle.dataValues.wagePerActionPoint,
			kosten,
			menge
		);
		if (!ergebnis.ok) return ergebnis;

		// Der Ertrag braucht Zutaten aus dem Betriebslager — sonst mahlt niemand.
		if (rezept) {
			for (const zutat of rezept.input) {
				const gereicht: boolean = await tradeService.changeBuildingStock(
					gebaeude.id,
					zutat.itemId,
					-zutat.quantity,
					t
				);
				if (!gereicht) return { ok: false, reason: 'NOT_IN_STOCK' } as const;
			}
			await tradeService.changeBuildingStock(gebaeude.id, rezept.outputItemId, menge, t);
			await skillService.addPractice(employeeId, rezept.skill, kosten, t);
		}

		await angestellter.update(
			{
				actionPoints: angestellter.dataValues.actionPoints - kosten,
				money: ergebnis.employeeMoney
			},
			{ transaction: t }
		);
		await arbeitgeber.update({ money: ergebnis.employerMoney }, { transaction: t });

		return {
			ok: true,
			wage: ergebnis.wage,
			produced: menge,
			itemId: rezept?.outputItemId
		} as const;
	});
}

// --- Anzeigen ------------------------------------------------------------------------

export interface JobOnList {
	buildingId: string;
	buildingName: string;
	wage: number;
	free: number;
	employerName: string;
}

/** Was in dieser Stadt an Stellen offensteht. */
export async function getOpenJobs(regionId: string, seekerId?: string): Promise<JobOnList[]> {
	const gebaeude = await buildingService.getBuildingsInRegion(regionId);

	const stellen: JobOnList[] = [];
	for (const eintrag of gebaeude) {
		if (eintrag.offeredWage === null || eintrag.ownerCharacterId === null) continue;
		if (eintrag.ownerCharacterId === seekerId) continue;

		const vorlage = buildingService.getBuildingOption(eintrag.optionId);
		if (!vorlage) continue;

		const belegt: number = await Employment.count({ where: { BuildingId: eintrag.id } });
		const frei: number = positionsAt(vorlage, eintrag.level) - belegt;
		if (frei <= 0) continue;

		const chef = await Character.findByPk(eintrag.ownerCharacterId);
		stellen.push({
			buildingId: eintrag.id,
			buildingName: eintrag.name,
			wage: eintrag.offeredWage,
			free: frei,
			employerName: chef?.dataValues.firstName ?? 'jemand'
		});
	}
	return stellen.sort((a, b) => b.wage - a.wage);
}

/** Die eigene Stelle — für die Charakterseite. */
export async function getJobOf(
	characterId: string
): Promise<{ buildingId: string; buildingName: string; wage: number } | undefined> {
	const stelle = await Employment.findOne({ where: { EmployeeCharacterId: characterId } });
	if (!stelle) return undefined;

	const gebaeude = await Building.findByPk(stelle.dataValues.BuildingId);
	return {
		buildingId: stelle.dataValues.BuildingId,
		buildingName: gebaeude?.dataValues.name ?? 'einem Betrieb',
		wage: stelle.dataValues.wagePerActionPoint
	};
}

/** Wer hier arbeitet — für die Gebäudeseite. */
export async function getStaff(
	buildingId: string
): Promise<{ id: string; name: string; wage: number }[]> {
	const stellen = await Employment.findAll({ where: { BuildingId: buildingId } });

	const leute: { id: string; name: string; wage: number }[] = [];
	for (const stelle of stellen) {
		const person = await Character.findByPk(stelle.dataValues.EmployeeCharacterId);
		if (!person) continue;
		leute.push({
			id: person.dataValues.id,
			name: person.dataValues.firstName,
			wage: stelle.dataValues.wagePerActionPoint
		});
	}
	return leute;
}

/** Die Jahreszeit gehört zur Schicht, sobald ein Rezept sie verlangt. */
export function currentSeason(tick: number) {
	return seasonOf(tick);
}
