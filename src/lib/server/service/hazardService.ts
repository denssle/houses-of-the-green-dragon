import { Op } from 'sequelize';
import { Building } from '$lib/db/model/building';
import { BuildingStock } from '$lib/db/model/shop';
import { Character } from '$lib/db/model/character';
import { Employment } from '$lib/db/model/employment';
import { Region } from '$lib/db/model/region';
import { getItemTemplate } from '$lib/model/itemTemplate';
import {
	fireChance,
	fireDamage,
	loot,
	pickTarget,
	raidChance,
	type Target
} from '$lib/game/hazard.logic';
import { currentCondition } from '$lib/game/building.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';
import * as buildingService from '$lib/server/service/buildingService';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as nameService from '$lib/server/service/nameService';

/**
 * Unglücke: Raub und Brand.
 *
 * **Ein Unglück nimmt nur, was es vorfindet.** Der Raub verschiebt Münzen und Waren, der
 * Brand senkt einen Gebäudezustand — nichts davon ist neu, und genau deshalb ist beides
 * sofort spürbar: Wer bestohlen wird, kann weniger kaufen; wessen Werkstatt brennt,
 * produziert weniger, bis der Eigentümer sie herrichtet.
 *
 * **Getroffen wird, wo etwas zu holen ist.** Die Auswahl ist nach Beutewert gewichtet.
 * Das ist stimmig und zugleich der Schutz gegen die Todesspirale: Wer nichts hat, lohnt
 * den Weg nicht — ein Räuber, der dem Verhungernden das letzte Brot nimmt, machte aus
 * einer Notlage eine Sackgasse.
 *
 * Die **Wache** aus 4.7c bekommt hier endlich ihre Aufgabe: Jeder angestellte Wächter
 * drittelt das Verbleibende, aber niemand kommt auf null.
 *
 * **Der persönliche Vorrat bleibt unangetastet.** Geraubt werden Münzen und Betriebslager,
 * nicht die Kammer: Das Brot in der Truhe ist das, was zwischen einem Charakter und dem
 * Verhungern steht (4.6a), und es zu nehmen wäre kein Verlust, sondern ein Todesurteil mit
 * Umweg. Wer Waren schützen will, hat den Hebel trotzdem — sie liegen im Betrieb.
 */

export interface HazardReport {
	kind: 'RAID' | 'FIRE';
	what: string;
	value: number;
}

/** Wie viele Wächter die Stadt bezahlt — die Zahl, an der die Sicherheit hängt. */
export async function countGuards(regionId: string): Promise<number> {
	const wachhaeuser = (await buildingService.getBuildingsInRegion(regionId)).filter(
		(haus) => haus.optionId === GUARDHOUSE_OPTION_ID
	);

	let wachen = 0;
	for (const haus of wachhaeuser) {
		wachen += await Employment.count({ where: { BuildingId: haus.id } });
	}
	return wachen;
}

export const GUARDHOUSE_OPTION_ID = 7;

/**
 * Ein Herzschlag Unglück.
 *
 * Höchstens **ein** Ereignis je Tick, und zwar in dieser Reihenfolge geprüft. Zwei
 * Unglücke in derselben Stunde wären für den Betroffenen nicht mehr auseinanderzuhalten,
 * und die Chronik läse sich wie ein Kriegsbericht.
 */
export async function strike(
	regionId: string,
	tick: number,
	roll: () => number = Math.random
): Promise<HazardReport | undefined> {
	const wachen: number = await countGuards(regionId);

	if (roll() < raidChance(wachen)) {
		return raid(regionId, tick, roll);
	}
	if (roll() < fireChance()) {
		return fire(regionId, tick, roll);
	}
	return undefined;
}

// --- Raub ----------------------------------------------------------------------------

type RaidTarget =
	| { art: 'TREASURY' }
	| { art: 'PERSON'; id: string }
	| { art: 'BUILDING'; id: string; itemId: string; menge: number };

/**
 * Ein Raubzug.
 *
 * Alle drei Arten von Zielen stehen in **einem** Topf: die Stadtkasse, die Habe der
 * Leute, die Lager der Betriebe. Was getroffen wird, entscheidet der Beutewert — damit
 * braucht es keine Regel darüber, wie oft welche Art an der Reihe ist, und ein reicher
 * Betrieb ist von selbst das lohnendere Ziel als eine leere Kammer.
 */
async function raid(
	regionId: string,
	tick: number,
	roll: () => number
): Promise<HazardReport | undefined> {
	const ziele: Target<RaidTarget>[] = [];

	const stadt = await Region.findByPk(regionId);
	const kasse: number = stadt?.dataValues.treasury ?? 0;
	if (kasse > 0) ziele.push({ ref: { art: 'TREASURY' }, worth: kasse });

	const leute = await Character.findAll({
		where: { RegionId: regionId, deathTick: null, money: { [Op.gt]: 0 } },
		attributes: ['id', 'money']
	});
	for (const person of leute) {
		ziele.push({
			ref: { art: 'PERSON', id: person.dataValues.id },
			worth: person.dataValues.money
		});
	}

	const gebaeude = await buildingService.getBuildingsInRegion(regionId);
	for (const haus of gebaeude) {
		const lager = await BuildingStock.findAll({ where: { BuildingId: haus.id } });
		for (const posten of lager) {
			const preis: number = getItemTemplate(posten.dataValues.itemId)?.basePrice ?? 0;
			const wert: number = preis * posten.dataValues.quantity;
			if (wert <= 0) continue;
			ziele.push({
				ref: {
					art: 'BUILDING',
					id: haus.id,
					itemId: posten.dataValues.itemId,
					menge: posten.dataValues.quantity
				},
				worth: wert
			});
		}
	}

	const getroffen = pickTarget(ziele, roll());
	if (!getroffen) return undefined;

	if (getroffen.art === 'TREASURY') {
		const beute: number = loot(kasse);
		if (beute <= 0) return undefined;
		await Region.increment('treasury', { by: -beute, where: { id: regionId } });
		await chronicleService.record('RAID', regionId, tick, { value: beute, detail: 'TREASURY' });
		return { kind: 'RAID', what: 'die Stadtkasse', value: beute };
	}

	if (getroffen.art === 'PERSON') {
		const opfer = await Character.findByPk(getroffen.id);
		if (!opfer) return undefined;
		const beute: number = loot(opfer.dataValues.money);
		if (beute <= 0) return undefined;

		await opfer.update({ money: opfer.dataValues.money - beute });
		await chronicleService.record('RAID', regionId, tick, {
			subjectId: getroffen.id,
			value: beute,
			detail: 'MONEY'
		});
		// Mit Hausnamen (5.10) — wie in der Chronik, in die dasselbe Ereignis wandert.
		const name: string =
			(await nameService.displayName(getroffen.id)) ?? opfer.dataValues.firstName;
		return { kind: 'RAID', what: name, value: beute };
	}

	const beute: number = loot(getroffen.menge);
	if (beute <= 0) return undefined;
	await BuildingStock.increment('quantity', {
		by: -beute,
		where: { BuildingId: getroffen.id, itemId: getroffen.itemId }
	});
	const haus = await Building.findByPk(getroffen.id);
	await chronicleService.record('RAID', regionId, tick, {
		buildingId: getroffen.id,
		subjectId: haus?.dataValues.OwnerCharacterId ?? null,
		value: beute,
		detail: getroffen.itemId
	});
	return { kind: 'RAID', what: haus?.dataValues.name ?? 'ein Betrieb', value: beute };
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

/** Nur für die Anzeige: was die Stadt gerade an Sicherheit hat. */
export async function getSafety(
	regionId: string
): Promise<{ guards: number; raidChancePerYear: number }> {
	const wachen: number = await countGuards(regionId);
	return {
		guards: wachen,
		// Zurückgerechnet auf das Spieljahr — Ticks sind eine Rechengröße, keine Auskunft.
		raidChancePerYear: Math.round(raidChance(wachen) * TICKS_PER_YEAR * 100) / 100
	};
}
