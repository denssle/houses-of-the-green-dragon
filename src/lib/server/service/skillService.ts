import { type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Character } from '$lib/db/model/character';
import { Skill } from '$lib/db/model/skill';
import {
	practice,
	practiceForNextLevel,
	SKILL_NAMES,
	type SkillState,
	type SkillType,
	teach,
	teachableUpTo,
	teachingFee,
	TEACHING_PRACTICE
} from '$lib/game/skill.logic';
import * as characterService from '$lib/server/service/characterService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Können gegen die Datenbank.
 *
 * Die Tabelle ist **spärlich**: Wer eine Fertigkeit nie ausgeübt hat, hat keine Zeile,
 * und das gilt als Stufe null. Geschrieben wird bei jeder Übung — anders als Zuneigung
 * und Verfall lässt sich Können nicht aus der Zeit ableiten.
 */

export type SkillResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/** Die Stufe einer Fertigkeit — null, wenn es dazu keine Zeile gibt. */
export async function getLevel(
	characterId: string,
	type: SkillType,
	transaction?: Transaction
): Promise<number> {
	const gefunden = await Skill.findOne({
		where: { CharacterId: characterId, type },
		transaction
	});
	return gefunden?.dataValues.level ?? 0;
}

/**
 * Übung eintragen.
 *
 * Wird aus den Handlungen heraus gerufen, die etwas trainieren — eine Schicht in der
 * Schmiede schult das Schmieden, eine Renovierung das Bauen. Läuft in der Transaktion
 * der Handlung mit: Wer eine Schicht arbeitet, ohne dafür besser zu werden, hätte einen
 * Aktionspunkt umsonst ausgegeben.
 */
export async function addPractice(
	characterId: string,
	type: SkillType,
	amount: number,
	transaction?: Transaction
): Promise<void> {
	const zeile = await Skill.findOne({
		where: { CharacterId: characterId, type },
		transaction
	});

	const vorher: SkillState = zeile
		? { level: zeile.dataValues.level, progress: zeile.dataValues.progress }
		: // Die erste Übung legt die Zeile an. Stufe 1 heißt: Er hat es einmal getan.
			{ level: 1, progress: 0 };

	const nachher: SkillState = practice(vorher, amount);

	await Skill.upsert(
		{ CharacterId: characterId, type, level: nachher.level, progress: nachher.progress },
		{ transaction }
	);
}

/** Ein Können, wie es auf der Charakterseite steht. */
export interface SkillOnList {
	type: SkillType;
	name: string;
	level: number;
	/** Wie weit die nächste Stufe ist, in Prozent — als Balken statt als Zahl. */
	towardsNext: number;
}

export async function getSkills(characterId: string): Promise<SkillOnList[]> {
	const alle = await Skill.findAll({ where: { CharacterId: characterId } });

	return alle.map((eintrag) => {
		const noetig: number | undefined = practiceForNextLevel(eintrag.dataValues.level);
		return {
			type: eintrag.dataValues.type,
			name: SKILL_NAMES[eintrag.dataValues.type],
			level: eintrag.dataValues.level,
			towardsNext: noetig ? Math.round((eintrag.dataValues.progress / noetig) * 100) : 100
		};
	});
}

/**
 * Eine Lehrstunde nehmen.
 *
 * Zwei Charaktere, zwei Aktionsbudgets, ein Geldfluss und eine Fertigkeit — alles in
 * einer Transaktion. Ein halb vollzogener Unterricht, bei dem das Lehrgeld fließt, aber
 * nichts gelernt wird, wäre nicht reparierbar.
 *
 * Gerufen wird sie vom **Schüler**: Er sucht sich den Meister, nicht umgekehrt. Ein
 * Meister, der Schüler zwingen könnte, wäre etwas anderes.
 */
export async function learnFrom(
	studentId: string,
	teacherId: string,
	type: SkillType
): Promise<SkillResult> {
	if (studentId === teacherId) return { ok: false, reason: 'SAME_PERSON' };

	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const meister = await Character.findByPk(teacherId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!meister || meister.dataValues.deathTick !== null) {
			return { ok: false, reason: 'NO_SUCH_PERSON' } as const;
		}

		const schueler = await characterService.loadForAction(studentId, tick, t);
		if (!schueler) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		// Lernen heißt beisammen sein — dieselbe Prüfung wie beim Werben und Arbeiten.
		if (schueler.dataValues.RegionId !== meister.dataValues.RegionId) {
			return { ok: false, reason: 'WRONG_REGION' } as const;
		}

		const ergebnis = teach(
			{ actionPoints: meister.dataValues.actionPoints, level: await getLevel(teacherId, type, t) },
			{
				actionPoints: schueler.dataValues.actionPoints,
				money: schueler.dataValues.money,
				level: await getLevel(studentId, type, t)
			}
		);
		if (!ergebnis.ok) return ergebnis;

		await meister.update(
			{
				actionPoints: ergebnis.teacherActionPoints,
				money: meister.dataValues.money + ergebnis.fee
			},
			{ transaction: t }
		);
		await schueler.update(
			{
				actionPoints: ergebnis.studentActionPoints,
				money: schueler.dataValues.money - ergebnis.fee
			},
			{ transaction: t }
		);
		await addPractice(studentId, type, TEACHING_PRACTICE, t);

		return { ok: true } as const;
	});
}

/** Was ein Meister zu bieten hat — für die Anzeige beim Gegenüber. */
export interface Lesson {
	type: SkillType;
	name: string;
	teacherLevel: number;
	/** Bis hierher kann er einen bringen. */
	upTo: number;
	fee: number;
}

/**
 * Wobei dieser Meister dem Schüler noch helfen kann.
 *
 * Gezeigt wird nur, was tatsächlich etwas brächte — ein Knopf, der immer scheitert, ist
 * schlimmer als keiner.
 */
export async function getLessons(teacherId: string, studentId: string): Promise<Lesson[]> {
	const angebote = await Skill.findAll({ where: { CharacterId: teacherId } });

	const möglich: Lesson[] = [];
	for (const angebot of angebote) {
		const bis: number = teachableUpTo(angebot.dataValues.level);
		if ((await getLevel(studentId, angebot.dataValues.type)) >= bis) continue;

		möglich.push({
			type: angebot.dataValues.type,
			name: SKILL_NAMES[angebot.dataValues.type],
			teacherLevel: angebot.dataValues.level,
			upTo: bis,
			fee: teachingFee(angebot.dataValues.level)
		});
	}
	return möglich;
}
