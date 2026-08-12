import { randomUUID } from 'node:crypto';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { RegionLink } from '$lib/db/model/regionLink';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { TICKS_PER_YEAR, yearsToTicks } from '$lib/game/time';

/**
 * Der Weltaufbau.
 *
 * Ohne ihn gibt es keinen Ort, an dem ein Charakter stehen könnte — `RegionId` ist
 * Pflicht. Läuft beim Serverstart und ist **wiederholbar**: Steht die Weltzeit schon,
 * passiert nichts. Ein zweiter Aufruf darf keine zweite Stadt anlegen.
 *
 * Die Welt beginnt nicht bei Tick null, sondern mit hundert Spieljahren im Rücken. Sonst
 * müssten die Geburtstage der Bevölkerung negativ sein — und eine Stadt, die es angeblich
 * erst seit gestern gibt, in der aber Fünfzigjährige wohnen, wäre auch erzählerisch
 * schief.
 */
export const WORLD_STARTS_AT_TICK = yearsToTicks(100);

const STADT = 'Grünau';

/** Die Startstadt und ihr Umland. Weitere Orte sind später je eine Zeile mehr. */
const UMLAND = [
	{ name: 'Eichwald', type: 'FOREST', resource: 'WOOD', distance: 2, flaechen: 2 },
	{ name: 'Steinbruch am Hang', type: 'QUARRY', resource: 'STONE', distance: 3, flaechen: 1 },
	{ name: 'Mühlenfeld', type: 'FIELD', resource: 'GRAIN', distance: 2, flaechen: 3 }
] as const;

/** Die Gassen der Startstadt. Je Eintrag entstehen vier Grundstücke. */
const GASSEN = ['Am Markt', 'Gerbergasse', 'Töpferweg'] as const;

/**
 * Was der Stadt von Anfang an gehört.
 *
 * Ohne diese beiden Häuser wäre die Welt eine Sackgasse: Wer neu anfängt, hat zehn
 * Münzen und findet nichts, womit er mehr verdienen könnte — kein Betrieb, keine Arbeit,
 * kein Grundstück in Reichweite. Das Konzept nennt genau diesen Weg für Neulinge: als
 * Angestellter anfangen und Geld verdienen. Die städtische Schmiede ist der Anfang davon
 * (siehe Punkt 14 in `OFFENE_PUNKTE.md`, der die Starthilfe endgültig regelt).
 */
const STADTGEBAEUDE = [
	{ optionId: 0, name: 'Rathaus', adresse: 'Am Markt 1' },
	{ optionId: 2, name: 'Städtische Schmiede', adresse: 'Am Markt 2' }
] as const;

/** Fremde NPCs, die die Stadt von Anfang an bevölkern — Kundschaft, Arbeitskraft, Wähler. */
const BEVOELKERUNG = [
	{ firstName: 'Alheid', gender: 'FEMALE', age: 52 },
	{ firstName: 'Bertram', gender: 'MALE', age: 47 },
	{ firstName: 'Cunne', gender: 'FEMALE', age: 34 },
	{ firstName: 'Dietrich', gender: 'MALE', age: 29 },
	{ firstName: 'Elsbeth', gender: 'FEMALE', age: 26 },
	{ firstName: 'Frowin', gender: 'MALE', age: 41 },
	{ firstName: 'Gertrud', gender: 'FEMALE', age: 19 },
	{ firstName: 'Hinrik', gender: 'MALE', age: 23 }
] as const;

export async function seedWorld(): Promise<boolean> {
	if (await World.findByPk(WORLD_ID)) {
		return false;
	}

	const jetzt = WORLD_STARTS_AT_TICK;
	await World.create({ id: WORLD_ID, currentTick: jetzt, lastTickAt: new Date() });

	const stadtId = randomUUID();
	await Region.create({ id: stadtId, name: STADT, type: 'CITY', treasury: 0 });

	for (const gasse of GASSEN) {
		for (let hausnummer = 1; hausnummer <= 4; hausnummer++) {
			await Plot.create({
				id: randomUUID(),
				address: `${gasse} ${hausnummer}`,
				type: 'BUILDING_LAND',
				RegionId: stadtId
			});
		}
	}

	for (const bauwerk of STADTGEBAEUDE) {
		const grundstück = await Plot.findOne({ where: { address: bauwerk.adresse } });
		if (!grundstück) continue;
		// Das Grundstück gehört der Stadt, nicht niemandem: Es ist vergeben, nur eben an
		// die Allgemeinheit.
		await grundstück.update({ ownerType: 'CITY' });
		await Building.create({
			id: randomUUID(),
			name: bauwerk.name,
			optionId: bauwerk.optionId,
			lastConditionTick: jetzt,
			PlotId: grundstück.dataValues.id,
			ownerType: 'CITY'
		});
	}

	for (const ort of UMLAND) {
		const ortId = randomUUID();
		await Region.create({ id: ortId, name: ort.name, type: ort.type });

		// In beide Richtungen, damit ein Weg ohne ODER über zwei Spalten zu finden ist.
		await RegionLink.create({
			fromRegionId: stadtId,
			toRegionId: ortId,
			distanceInTicks: ort.distance
		});
		await RegionLink.create({
			fromRegionId: ortId,
			toRegionId: stadtId,
			distanceInTicks: ort.distance
		});

		for (let nummer = 1; nummer <= ort.flaechen; nummer++) {
			await Plot.create({
				id: randomUUID(),
				address: `${ort.name} ${nummer}`,
				type: 'RESOURCE',
				resourceType: ort.resource,
				RegionId: ortId,
				// Abbauflächen sind Gemeingut und werden verpachtet, nicht verkauft.
				ownerType: 'CITY'
			});
		}
	}

	for (const person of BEVOELKERUNG) {
		await Character.create({
			id: randomUUID(),
			firstName: person.firstName,
			role: 'NPC',
			gender: person.gender,
			birthTick: jetzt - person.age * TICKS_PER_YEAR,
			lastTickProcessed: jetzt,
			RegionId: stadtId
			// Ohne Dynastie: Fremd-NPCs gehören zu keinem Haus.
		});
	}

	return true;
}

/** Die Stadt, in der neue Spieler beginnen. */
export async function findStartRegionId(): Promise<string> {
	const stadt = await Region.findOne({ where: { type: 'CITY' } });
	if (!stadt) {
		throw new Error('Keine Stadt in der Welt — der Weltaufbau ist nicht gelaufen.');
	}
	return stadt.dataValues.id;
}
