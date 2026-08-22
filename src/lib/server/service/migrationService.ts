import { randomUUID } from 'node:crypto';
import { type Transaction } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { Region } from '$lib/db/model/region';
import { Skill } from '$lib/db/model/skill';
import { NEUGEBORENE } from '$lib/db/names';
import { HERKUNFT } from '$lib/db/names';
import { SATIETY_MAX } from '$lib/game/need.logic';
import { randomPersonality } from '$lib/game/personality.logic';
import { SKILL_TYPES, type SkillType } from '$lib/game/skill.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';
import {
	arrivalGifts,
	skillToBring,
	settlementFee,
	someoneArrives,
	ZUZUG_EHRGEIZ,
	ZUZUG_FLEISS
} from '$lib/game/migration.logic';
import * as buildingService from '$lib/server/service/buildingService';
import * as chronicleService from '$lib/server/service/chronicleService';

/**
 * Zuzug: neue Seelen von außerhalb (Punkt 71).
 *
 * **Die Welt bekommt eine Tür.** Bis hierher war Grünau geschlossen — acht Gründer und
 * ihre Nachfahren, sonst niemand. Wer ankommt, bringt dreierlei mit, und jedes davon löst
 * etwas, das sich von innen nicht lösen ließ:
 *
 * - **Ein Handwerk** (Punkt 70). Fertigkeiten wachsen durch Tun, getan wird, wo ein
 *   Gebäude steht — also konnten alle schmieden und niemand backen. Wissen wandert mit den
 *   Handwerkern, und genau so kommt es jetzt in die Stadt.
 * - **Geld** (Punkt 66). Nicht aus dem Nichts, sondern aus einem Leben, das anderswo
 *   stattgefunden hat. Das ist der Unterschied zur Tagelöhnerei, die Münzen erschuf.
 * - **Sich selbst.** Eine Stadt, die schrumpft, hatte keine Erholung; jetzt hat sie eine.
 *
 * **Gebremst wird durch Wohnraum**, nicht durch eine Obergrenze: Ist die städtische
 * Unterkunft voll, kommt niemand mehr. Wer ankommt und nichts findet, zieht weiter — das
 * ist die stimmigere Regel und zugleich die, die eine Stadt nicht überlaufen lässt.
 */

/** Ein Zuwanderer und wie er heißt — für die Chronik und die Tests. */
export interface Arrival {
	characterId: string;
	name: string;
	house: string;
	skill: SkillType;
	money: number;
}

/**
 * Ein Herzschlag Zuwanderung.
 *
 * Wird vom Welt-Takt gerufen. Gibt zurück, wer gekommen ist — oder nichts, was der
 * Normalfall ist.
 *
 * **`ticks` ist die Zeit, die die Weltuhr in diesem Schlag vorgerückt ist** (5.47). Nach
 * einem Neustart sind das mehrere Stunden auf einmal, und sie zählen mit: Sonst kostete
 * jeder Deploy der Stadt Ankünfte, weil hier nur einmal je Herzschlag gewürfelt wird.
 */
export async function admitNewcomers(
	regionId: string,
	tick: number,
	roll: () => number = Math.random,
	ticks = 1
): Promise<Arrival | undefined> {
	const platz = await freierWohnraum(regionId);
	if (!someoneArrives(roll(), platz, ticks)) return undefined;

	const geschlecht: 'FEMALE' | 'MALE' = roll() < 0.5 ? 'FEMALE' : 'MALE';
	const vorname: string =
		NEUGEBORENE[geschlecht][Math.floor(roll() * NEUGEBORENE[geschlecht].length)];
	const hausname: string = HERKUNFT[Math.floor(roll() * HERKUNFT.length)];

	const koennen: SkillType = skillToBring(SKILL_TYPES, await handwerkeInDerStadt(regionId), roll());
	const mitgebracht = arrivalGifts({ money: roll(), skill: roll(), age: roll() });

	const einzugsgeld: number = settlementFee(mitgebracht.money);

	const characterId = randomUUID();
	await sequelize.transaction(async (t: Transaction) => {
		// **Ein eigenes Haus** (5.10): Wer ankommt, gründet eine Linie. Ohne das hinge er
		// als Namenloser in der Welt, und jede Regel über Häuser ginge an ihm vorbei.
		const hausId = randomUUID();
		await Dynasty.create(
			{ id: hausId, name: hausname, UserId: null, foundedAtTick: tick },
			{ transaction: t }
		);

		await Character.create(
			{
				id: characterId,
				firstName: vorname,
				role: 'NPC',
				gender: geschlecht,
				birthTick: tick - mitgebracht.ageInYears * TICKS_PER_YEAR,
				lastTickProcessed: tick,
				// Wer ankommt, hat unterwegs gegessen.
				satiety: SATIETY_MAX,
				lastNeedTick: tick,
				actionPoints: 0,
				// **Abzüglich Einzugsgeld** (5.26): Wer sich niederlässt, zahlt der Stadt dafür.
				// Historisch der Normalfall — und hier die Einnahme, die eine junge Stadt am
				// dringendsten braucht, weil sie keine laufende Wirtschaft voraussetzt.
				money: mitgebracht.money - einzugsgeld,
				RegionId: regionId,
				DynastyId: hausId,
				// **Der Tag der Ankunft** — daran hängt das Wahlrecht (`CITIZENSHIP_AFTER_YEARS`).
				// Ohne diese Frist gewänne eine Wahl, wer Leute ansiedelt.
				arrivedTick: tick,
				...randomPersonality(roll),
				// **Wer die Reise auf sich nimmt, hat etwas vor.** Ehrgeiz und Fleiß stehen
				// deshalb fest und werden nicht gewürfelt — dieselbe Entscheidung wie bei den
				// drei Gründern in `seed.ts`, und aus demselben Grund: Ob eine Stadt je einen
				// Betrieb bekommt, darf nicht am Würfel hängen.
				//
				// Der Messlauf hat gezeigt, warum das nötig ist: Sechs Zugezogene mit
				// Handwerk und Geld standen in der Stadt, der reichste mit 277 Münzen — und
				// keiner baute, weil `isEnterprising` sie nicht durchließ. Wer auswandert,
				// um sein Handwerk woanders auszuüben, ist per se kein Zauderer.
				ambition: ZUZUG_EHRGEIZ,
				diligence: ZUZUG_FLEISS
			},
			{ transaction: t }
		);

		// **Das Handwerk, das er mitbringt** — der eigentliche Grund, warum ein Zuzug für
		// die Stadt etwas ändert (Punkt 70). `progress` bleibt bei null: Er kann es, er
		// steht nur nicht kurz vor der nächsten Stufe.
		await Skill.create(
			{
				CharacterId: characterId,
				type: koennen,
				level: mitgebracht.skillLevel,
				progress: 0
			},
			{ transaction: t }
		);

		// Das Einzugsgeld in die Stadtkasse — Geld wechselt den Besitzer, es entsteht nicht.
		if (einzugsgeld > 0) {
			await Region.increment('treasury', {
				by: einzugsgeld,
				where: { id: regionId },
				transaction: t
			});
		}

		// **Der Zuzug gehört in die Chronik.** Ein Fremder, der ankommt, ist ein Ereignis —
		// nach fünf Generationen heißt sonst jeder Müller oder Schmied, und niemand sähe,
		// woher das Handwerk kam, das die Stadt plötzlich hat.
		await chronicleService.record(
			'ARRIVED',
			regionId,
			tick,
			{ subjectId: characterId, dynastyId: hausId, detail: koennen },
			t
		);
	});

	return {
		characterId,
		name: vorname,
		house: hausname,
		skill: koennen,
		money: mitgebracht.money
	};
}

/** Ist in der Stadt noch ein Bett frei? */
async function freierWohnraum(regionId: string): Promise<boolean> {
	for (const haus of await buildingService.getBuildingsInRegion(regionId)) {
		const platz: number | null = await buildingService.freierWohnraum(haus.id);
		if (haus.ownerType === 'CITY' && platz !== null && platz > 0) return true;
	}
	return false;
}

/**
 * Welche Handwerke in dieser Stadt schon ausgeübt werden.
 *
 * Gefragt wird nach den **Gebäuden**, nicht nach den Fertigkeiten der Einwohner: Dass
 * jemand backen kann, nützt der Stadt nichts, solange kein Backhaus steht — und umgekehrt
 * ist ein Handwerk versorgt, sobald es einen Ort dafür gibt.
 */
async function handwerkeInDerStadt(regionId: string): Promise<SkillType[]> {
	const vorhanden: SkillType[] = [];
	for (const haus of await buildingService.getBuildingsInRegion(regionId)) {
		const koennen = buildingService.getBuildingOption(haus.optionId)?.skill;
		if (koennen && !vorhanden.includes(koennen)) vorhanden.push(koennen);
	}
	return vorhanden;
}
