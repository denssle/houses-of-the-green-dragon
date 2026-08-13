import { type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import {
	SKILL_NAMES,
	type SkillType,
	teach,
	teachableUpTo,
	TEACHING_PRACTICE
} from '$lib/game/skill.logic';
import { AGE_OF_MAJORITY, ageInYears } from '$lib/game/time';
import * as characterService from '$lib/server/service/characterService';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as lawService from '$lib/server/service/lawService';
import * as skillService from '$lib/server/service/skillService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Die Schule.
 *
 * **Sie erfindet keine Mechanik, sie stellt einen Lehrmeister.** Ein Schultag ist eine
 * Lehrstunde nach den Regeln aus 4.5a: Der Lehrer muss zwei Stufen über dem Kind stehen,
 * beide zahlen mit Aktionspunkten, das Kind lernt. Der Unterschied zur privaten Lehre
 * liegt woanders — **wer bezahlt wen**.
 *
 * Bei der privaten Lehre geht das Lehrgeld an den Meister. Hier bekommt der Lehrer seinen
 * Sold aus der Stadtkasse (er ist angestellt wie die Wache), und die Eltern zahlen
 * **Schulgeld an die Stadt**. Wie hoch es ist, sagt ein Gesetz: Steht es auf null, zahlt
 * die Stadt die Bildung ihrer Kinder ganz allein.
 *
 * **Der Schultag kostet das Kind Aktionspunkte wie Arbeit.** Damit steht Lernen gegen
 * Verdienen, und die Entscheidung wird zu einer. Wer sein Kind lernen lässt, verzichtet
 * auf dessen Hände.
 */

export type SchoolResult =
	| { ok: true; skill: SkillType; fee: number; teacher: string }
	| { ok: false; reason: ActionFailureReason };

/** Wer an dieser Schule unterrichtet — und was. */
export interface Teacher {
	characterId: string;
	name: string;
	skill: SkillType;
	skillName: string;
	level: number;
	/** Bis zu welcher Stufe er ein Kind bringen kann. */
	upTo: number;
}

/**
 * Was eine Schule anbietet.
 *
 * Nichts, wenn niemand dort angestellt ist: Eine Schule ohne Lehrer ist ein leeres Haus.
 * Und ein Lehrer kann nur weitergeben, was er selbst beherrscht — was ein Kind hier lernen
 * kann, hängt also daran, wen die Stadt gewinnt.
 */
export async function getTeachers(buildingId: string): Promise<Teacher[]> {
	const angestellte = await Employment.findAll({ where: { BuildingId: buildingId } });

	const lehrer: Teacher[] = [];
	for (const stelle of angestellte) {
		const person = await Character.findByPk(stelle.dataValues.EmployeeCharacterId);
		if (!person || person.dataValues.deathTick !== null) continue;

		const koennen = await skillService.getSkills(person.dataValues.id);
		for (const fertigkeit of koennen) {
			if (teachableUpTo(fertigkeit.level) <= 0) continue;
			lehrer.push({
				characterId: person.dataValues.id,
				name: person.dataValues.firstName,
				skill: fertigkeit.type,
				skillName: SKILL_NAMES[fertigkeit.type],
				level: fertigkeit.level,
				upTo: teachableUpTo(fertigkeit.level)
			});
		}
	}
	return lehrer;
}

/**
 * Ein Schultag.
 *
 * Bezahlt wird vom **Zahlenden** — in aller Regel ein Elternteil, das für sein Kind
 * aufkommt. Ein Kind hat selten eigenes Geld, und die Ausgabe soll dort anfallen, wo die
 * Entscheidung getroffen wird.
 */
export async function attend(
	childId: string,
	buildingId: string,
	skill: SkillType,
	payerId: string
): Promise<SchoolResult> {
	const tick: number = await worldService.currentTick();

	const gebaeude = await Building.findByPk(buildingId);
	if (!gebaeude || gebaeude.dataValues.optionId !== SCHOOL_OPTION_ID) {
		return { ok: false, reason: 'NOT_A_WORKPLACE' };
	}

	const grundstueck = gebaeude.dataValues.PlotId
		? await Plot.findByPk(gebaeude.dataValues.PlotId)
		: null;
	const regionId: string | undefined = grundstueck?.dataValues.RegionId;
	if (!regionId) return { ok: false, reason: 'NOT_A_WORKPLACE' };

	const lehrer = (await getTeachers(buildingId)).find((eintrag) => eintrag.skill === skill);
	if (!lehrer) return { ok: false, reason: 'NOTHING_TO_LEARN' };

	const schulgeld: number = await lawService.rate(regionId, 'SCHOOL_FEE');

	return sequelize.transaction(async (t: Transaction) => {
		const kind = await characterService.loadForAction(childId, tick, t);
		if (!kind) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		// **Die Schule ist für Kinder.** Wer volljährig ist, lernt beim Meister — dieselbe
		// Mechanik, aber er zahlt ihn selbst und niemand zahlt für ihn.
		if (ageInYears(kind.dataValues.birthTick, tick) >= AGE_OF_MAJORITY) {
			return { ok: false, reason: 'TOO_YOUNG' } as const;
		}
		if (kind.dataValues.RegionId !== regionId) {
			return { ok: false, reason: 'WRONG_REGION' } as const;
		}

		const zahler =
			payerId === childId
				? kind
				: await Character.findByPk(payerId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!zahler) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;
		if (zahler.dataValues.money < schulgeld) {
			return { ok: false, reason: 'NOT_ENOUGH_MONEY' } as const;
		}

		const lehrkraft = await Character.findByPk(lehrer.characterId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!lehrkraft) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		// Dieselbe Rechnung wie bei der privaten Lehre — nur ohne Lehrgeld an den Meister:
		// Der ist bereits von der Stadt bezahlt. Das Schulgeld wird deshalb hier auf null
		// gesetzt und getrennt eingezogen.
		const ergebnis = teach(
			{ actionPoints: lehrkraft.dataValues.actionPoints, level: lehrer.level },
			{
				actionPoints: kind.dataValues.actionPoints,
				money: Number.MAX_SAFE_INTEGER,
				level: await skillService.getLevel(childId, skill, t)
			}
		);
		if (!ergebnis.ok) return ergebnis;

		await lehrkraft.update({ actionPoints: ergebnis.teacherActionPoints }, { transaction: t });
		await kind.update({ actionPoints: ergebnis.studentActionPoints }, { transaction: t });

		if (schulgeld > 0) {
			await zahler.update({ money: zahler.dataValues.money - schulgeld }, { transaction: t });
			await Region.increment('treasury', {
				by: schulgeld,
				where: { id: regionId },
				transaction: t
			});
		}

		await skillService.addPractice(childId, skill, TEACHING_PRACTICE, t);
		await chronicleService.record(
			'SCHOOL_ATTENDED',
			regionId,
			tick,
			{ subjectId: childId, objectId: lehrer.characterId, buildingId, detail: skill },
			t
		);

		return { ok: true, skill, fee: schulgeld, teacher: lehrer.name } as const;
	});
}

/**
 * Die Kennung der Schulvorlage.
 *
 * Die Übungsmenge je Stunde ist dieselbe wie bei der privaten Lehre: Die Schule ist ein
 * Lehrmeister, den sich jeder leisten kann — nicht ein besserer.
 */
export const SCHOOL_OPTION_ID = 8;
