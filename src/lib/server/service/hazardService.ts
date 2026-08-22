import { Building } from '$lib/db/model/building';
import { fireChance, fireDamage, pickTarget, type Target } from '$lib/game/hazard.logic';
import { currentCondition } from '$lib/game/building.logic';
import * as buildingService from '$lib/server/service/buildingService';
import * as chronicleService from '$lib/server/service/chronicleService';

/**
 * Unglücke: der Brand.
 *
 * **Ein Unglück nimmt nur, was es vorfindet.** Der Brand senkt einen Gebäudezustand —
 * das ist nichts Neues, und genau deshalb ist es sofort spürbar: Wessen Werkstatt brennt,
 * produziert weniger, bis er sie herrichtet.
 *
 * **Getroffen wird, wo etwas auf dem Spiel steht.** Die Auswahl ist nach Zustand
 * gewichtet: Was ohnehin verfallen ist, hat weniger zu verlieren.
 *
 * **Der Raubzug ist mit 5.40 herausgenommen.** Er nahm ein Viertel der Stadtkasse,
 * zweimal im Spieljahr, und deckelte sie damit unter dem Preis des Wachhauses, das ihn
 * hätte eindämmen sollen — eine Stadt konnte sich die Wache nicht leisten, weil ihr das
 * Fehlen der Wache das Geld nahm. Räuber und Wache gehören zusammen neu gebaut; bis
 * dahin brennt es nur.
 */

export interface HazardReport {
	kind: 'FIRE';
	what: string;
	value: number;
}

/**
 * Ein Herzschlag Unglück.
 *
 * Höchstens **ein** Ereignis je Tick. Zwei Unglücke in derselben Stunde wären für den
 * Betroffenen nicht mehr auseinanderzuhalten, und die Chronik läse sich wie ein
 * Kriegsbericht. Seit 5.40 ist ohnehin nur noch eines übrig.
 */
export async function strike(
	regionId: string,
	tick: number,
	roll: () => number = Math.random
): Promise<HazardReport | undefined> {
	if (roll() < fireChance()) {
		return fire(regionId, tick, roll);
	}
	return undefined;
}

// --- Brand ---------------------------------------------------------------------------

/**
 * Ein Brand.
 *
 * Getroffen wird ein Gebäude, gewichtet nach seinem Zustand: Was ohnehin schon verfallen
 * ist, hat weniger zu verlieren — und die Feuersbrunst im nagelneuen Haus tut mehr weh,
 * was sie zum Ereignis macht. Der Zustand fällt, das Gebäude bleibt: Ein Brand, der ein
 * Lebenswerk in einem Tick auslöscht, wäre keine Wendung, sondern eine Strafe.
 */
async function fire(
	regionId: string,
	tick: number,
	roll: () => number
): Promise<HazardReport | undefined> {
	const gebaeude = await buildingService.getBuildingsInRegion(regionId);
	const ziele: Target<string>[] = gebaeude.map((haus) => ({ ref: haus.id, worth: haus.condition }));

	const getroffenId = pickTarget(ziele, roll());
	if (!getroffenId) return undefined;

	const zeile = await Building.findByPk(getroffenId);
	if (!zeile) return undefined;

	// Der Zustand wird hier festgeschrieben: Bis eben war er eine Rechnung aus dem
	// Stichtag, ab jetzt ist er ein Wert plus Verfall ab diesem Tick.
	const jetzt: number = currentCondition(
		zeile.dataValues.condition,
		zeile.dataValues.lastConditionTick,
		tick
	);
	const schaden: number = fireDamage(jetzt);
	if (schaden <= 0) return undefined;

	await zeile.update({ condition: jetzt - schaden, lastConditionTick: tick });
	await chronicleService.record('FIRE', regionId, tick, {
		buildingId: getroffenId,
		subjectId: zeile.dataValues.OwnerCharacterId,
		value: schaden
	});
	return { kind: 'FIRE', what: zeile.dataValues.name, value: schaden };
}
