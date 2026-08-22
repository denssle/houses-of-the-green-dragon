import { type Transaction } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { World } from '$lib/db/model/world';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { minutesToNextTick, planWorldAdvance, type WorldAdvance } from '$lib/game/tick.logic';
import { HOURS_PER_TICK } from '$lib/game/time';

/**
 * Die Weltzeit — und wer sie weiterstellt.
 *
 * Ein Tick ist eine Stunde Echtzeit. Der Takt läuft im Server (`ticker.ts`), nicht in
 * einer Anfrage: Die Welt läuft weiter, auch wenn niemand angemeldet ist.
 */

export async function currentTick(): Promise<number> {
	const welt = await World.findByPk(WORLD_ID);
	if (!welt) {
		throw new Error('Keine Weltzeit — der Weltaufbau ist nicht gelaufen.');
	}
	return welt.dataValues.currentTick;
}

/**
 * Stellt die Weltuhr auf die Echtzeit vor.
 *
 * **Verpasste Ticks werden übersprungen, nicht nachgerechnet** (Punkt 3 in
 * `OFFENE_PUNKTE.md`). War der Server aus, springt die Uhr — aber niemand bekommt etwas
 * dafür: `lastTickProcessed` wird für alle Charaktere mitgezogen, damit kein
 * Aktionsbudget für eine Zeit nachwächst, in der niemand handeln konnte. Dasselbe gilt
 * für `lastConditionTick` der Gebäude: Ein Ausfall darf keine Häuser verfallen lassen.
 *
 * Damit braucht es weder eine Schleife über die fehlenden Ticks noch eine Deckelung —
 * das Nachholen ist ein Bulk-Update, gleich teuer für eine Stunde wie für eine Woche.
 * Nicht mitgezogen wird der Geburtstag: Wer altert, altert mit der Uhr. Ein Charakter,
 * dessen Alter beim Ausfall stehenbliebe, würde die Generationenfolge von der
 * Serververfügbarkeit abhängig machen.
 *
 * Gibt zurück, was geschehen ist — oder `null`, wenn noch kein voller Tick vergangen war.
 */
/** Was `advanceWorld()` getan hat, samt dem Stand, auf dem die Uhr nun steht. */
/**
 * In wie vielen Minuten der nächste Tick fällt — und damit der nächste Aktionspunkt.
 *
 * **Die Auskunft, die nirgends stand** (Punkt 57): Eine Stunde Wirklichkeit ist eine
 * Stunde in Grünau, und diese Zahl entscheidet, ob man in zehn Minuten wiederkommt oder
 * morgen. Gerechnet aus `lastTickAt`, dem Ankerpunkt der Weltuhr — es braucht dafür
 * nichts Neues.
 */
export async function minutesToNextPoint(now: Date = new Date()): Promise<number> {
	const welt = await World.findByPk(WORLD_ID);
	if (!welt) return HOURS_PER_TICK * 60;

	return minutesToNextTick(new Date(welt.dataValues.lastTickAt), now);
}

export interface WorldAdvanced extends WorldAdvance {
	currentTick: number;
}

export async function advanceWorld(now: Date = new Date()): Promise<WorldAdvanced | null> {
	return sequelize.transaction(async (t: Transaction) => {
		const welt = await World.findByPk(WORLD_ID, { transaction: t, lock: t.LOCK.UPDATE });
		if (!welt) {
			throw new Error('Keine Weltzeit — der Weltaufbau ist nicht gelaufen.');
		}

		const plan = planWorldAdvance(welt.dataValues.lastTickAt, now);
		if (!plan) return null;

		const neuerTick: number = welt.dataValues.currentTick + plan.ticks;
		await welt.update({ currentTick: neuerTick, lastTickAt: plan.lastTickAt }, { transaction: t });

		if (plan.missed > 0) {
			// Verschoben wird **um** die Ausfallzeit, nicht **auf** die neue Weltzeit: Wer
			// zwei Tage nicht hereingeschaut hat, hat sein Aktionsbudget rechtmäßig
			// angesammelt, solange der Server lief. Ein Ausfall darf ihm das nicht nehmen.
			await Character.increment('lastTickProcessed', {
				by: plan.missed,
				where: {},
				transaction: t
			});
			await Building.increment('lastConditionTick', {
				by: plan.missed,
				where: {},
				transaction: t
			});
		}

		return { ...plan, currentTick: neuerTick };
	});
}
