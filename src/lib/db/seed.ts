import { randomUUID } from 'node:crypto';
import { randomPersonality } from '$lib/game/personality.logic';
import { SATIETY_MAX } from '$lib/game/need.logic';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
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
	{ name: 'Mühlenfeld', type: 'FIELD', resource: 'GRAIN', distance: 2, flaechen: 3 },
	// Mit der Baukette (4.10): Ohne Grube kein Erz, ohne Erz kein Eisen — und ohne Eisen
	// hält kein Haus zusammen.
	{ name: 'Erzgrube', type: 'MINE', resource: 'ORE', distance: 4, flaechen: 1 },
	// Mit Schneider und Alchemist (4.11).
	{ name: 'Schafweide', type: 'FIELD', resource: 'WOOL', distance: 2, flaechen: 2 },
	{ name: 'Kräuterwiese', type: 'FIELD', resource: 'HERBS', distance: 3, flaechen: 1 }
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
/**
 * In welchem Zustand die Stadt bei Weltbeginn steht.
 *
 * Gut in Schuss, aber nicht neu: Dreißig Punkte Arbeit an vier Bauten sind etwa
 * vierundzwanzig Schichten — genug, dass ein Ankömmling sich sein erstes Grundstück
 * erarbeiten kann (das kostet dreizehn), und wenig genug, dass die Stadtkasse es trägt.
 */
const STADT_BEI_WELTBEGINN = 70;

/**
 * Was in der Stadtkasse liegt, wenn die Welt beginnt.
 *
 * **Eine Stadt, die schon steht, hat Rücklagen** — und sie braucht sie: Seit 5.26 zahlt sie
 * ihre Instandsetzung an Menschen statt an niemanden, und mit leerer Kasse gäbe es keine
 * Lohnarbeit. Der Rundlauf hat das gezeigt: Der Knopf war da, die Handlung scheiterte an
 * `EMPLOYER_BROKE`, und ein neuer Spieler stand ohne Verdienst da.
 *
 * Zweihundert Münzen — genug für die vierundzwanzig Schichten, die ihre Bauten brauchen,
 * und wenig genug, dass ein Bürgermeister damit haushalten muss. Danach lebt sie von ihren
 * Einnahmen: Zehnt, Standgeld, Pacht, Einzugsgeld.
 */
const STADTKASSE_BEI_WELTBEGINN = 200;

const STADTGEBAEUDE = [
	{ optionId: 0, name: 'Rathaus', adresse: 'Am Markt 1' },
	{ optionId: 2, name: 'Städtische Schmiede', adresse: 'Am Markt 2' },
	{ optionId: 3, name: 'Städtische Unterkunft', adresse: 'Am Markt 3' },
	{ optionId: 6, name: 'Marktplatz', adresse: 'Am Markt 4' }
] as const;

/**
 * Die NPCs, die die Stadt von Anfang an bevölkern — Kundschaft, Arbeitskraft, Wähler.
 *
 * **Jeder gründet sein eigenes Haus** (5.10). Der Nachname ist der Hausname, und damit
 * gehört ausnahmslos jeder Charakter zu einem Haus — was das Konzept ohnehin behauptete,
 * mit den Fremd-NPCs als Ausnahme. Die Ausnahme ist gefallen.
 *
 * Eigene Häuser und keine geteilten: Bei einer Heirat behält jeder das seine (kein
 * Geschlecht heiratet hinein), und Familien entstehen dort, wo Kinder zur Welt kommen.
 * Zwei Fremde, die zufällig denselben Nachnamen trügen, wären dagegen eine Verwandtschaft,
 * die es nicht gibt.
 *
 * Die Namen nach dem, was man tut — so entstanden Familiennamen in einer Stadt dieser Zeit.
 */
const BEVOELKERUNG = [
	{ firstName: 'Alheid', lastName: 'Steinmetz', gender: 'FEMALE', age: 52, unternehmend: true },
	{ firstName: 'Bertram', lastName: 'Schmied', gender: 'MALE', age: 47, unternehmend: false },
	{ firstName: 'Cunne', lastName: 'Müller', gender: 'FEMALE', age: 34, unternehmend: true },
	{ firstName: 'Dietrich', lastName: 'Weber', gender: 'MALE', age: 29, unternehmend: false },
	{ firstName: 'Elsbeth', lastName: 'Becker', gender: 'FEMALE', age: 26, unternehmend: false },
	{ firstName: 'Frowin', lastName: 'Fischer', gender: 'MALE', age: 41, unternehmend: true },
	{ firstName: 'Gertrud', lastName: 'Schuster', gender: 'FEMALE', age: 19, unternehmend: false },
	{ firstName: 'Hinrik', lastName: 'Wagner', gender: 'MALE', age: 23, unternehmend: false }
] as const;

/**
 * **Drei der acht bringen Unternehmergeist mit** — festgelegt, nicht gewürfelt.
 *
 * Ob eine Stadt je einen Betrieb bekommt, hing bis Punkt 55 daran, ob `randomPersonality`
 * unter acht Menschen zufällig einen hervorbrachte, dessen Ehrgeiz und Fleiß über der
 * Schwelle liegen. Zwei Messläufe an derselben Welt: einmal zwei Unternehmungslustige und
 * drei gekaufte Grundstücke, einmal keiner und vierhundert Ticks Stillstand. Eine
 * Wirtschaft, die am Würfel hängt, ist keine.
 *
 * Das ist keine Bevorzugung der NPCs, sondern Weltaufbau — dieselbe Sorte Entscheidung
 * wie die acht Namen und ihre Berufe. Die übrigen Achsen bleiben gewürfelt: Wie gesellig,
 * mutig oder gierig einer ist, darf der Zufall sagen, denn davon hängt nicht ab, ob die
 * Stadt lebt.
 */
const GRUENDER_EHRGEIZ = 45;
const GRUENDER_FLEISS = 45;

/**
 * Was die Gründer mitbringen (Punkt 55).
 *
 * Bis hierher: nichts. Die Spalte hat den Standardwert null, und niemand hatte je etwas
 * anderes gesetzt — die Stadt begann mit acht mittellosen Menschen und einer
 * Tagelöhnerei, die drei Münzen bringt. Das genügt zum Leben und für nichts sonst.
 *
 * **Eine Spanne und keine feste Zahl.** Gleiche Taschen wären der langweiligere Anfang:
 * Handel entsteht aus Unterschieden, und wer mehr hat, kauft zuerst — die Reihenfolge, in
 * der die Stadt wächst, soll aus der Welt kommen und nicht aus einer Liste.
 *
 * **Knapp gehalten, und das aus Erfahrung.** Ein erster Versuch mit bis zu 240 Münzen
 * legte die Stadt still: Wer mehr besitzt, als seine Rücklage verlangt, hört auf zu
 * arbeiten — vierhundert Ticks lang kein einziger Arbeitseinsatz, die acht lebten von
 * ihrem Vermögen. Die Spanne reicht deshalb für ein Grundstück und etwas Anlauf; alles
 * Weitere muss erarbeitet werden.
 *
 * Dass es überhaupt nötig ist, ist die kleinere Hälfte der Antwort auf Punkt 55 — die
 * größere steht in `npc.logic.ts` beim Sparwillen. Geld allein zündet nur einmal.
 */
const STARTKAPITAL_MIN = 20;
const STARTKAPITAL_MAX = 90;

export async function seedWorld(): Promise<boolean> {
	if (await World.findByPk(WORLD_ID)) {
		return false;
	}

	const jetzt = WORLD_STARTS_AT_TICK;
	await World.create({ id: WORLD_ID, currentTick: jetzt, lastTickAt: new Date() });

	const stadtId = randomUUID();
	await Region.create({
		id: stadtId,
		name: STADT,
		type: 'CITY',
		treasury: STADTKASSE_BEI_WELTBEGINN
	});

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
			// **Die Stadt ist nicht neu gebaut** (5.27). Sie steht schon, wenn die Welt
			// beginnt — mit Bauten, an denen die Jahre zu sehen sind. Das ist nicht bloß
			// stimmiger, sondern die Voraussetzung dafür, dass jemand überhaupt Lohnarbeit
			// findet: Seit die Tagelöhnerei in der Instandsetzung besteht (5.26), gäbe es in
			// einer Stadt aus lauter neuen Häusern nichts zu verdienen. Der Rundlauf hat
			// genau das gezeigt — ein neuer Spieler stand vor vier Bauten in voller Güte.
			condition: STADT_BEI_WELTBEGINN,
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
		// Ein Haus ohne Benutzer: eine Familie, die niemand spielt. Es gilt dieselbe
		// Mechanik wie für Spielerhäuser — Erbfolge, Erlöschen, Fehden.
		const hausId = randomUUID();
		await Dynasty.create({
			id: hausId,
			name: person.lastName,
			UserId: null,
			foundedAtTick: jetzt
		});

		await Character.create({
			id: randomUUID(),
			firstName: person.firstName,
			role: 'NPC',
			gender: person.gender,
			birthTick: jetzt - person.age * TICKS_PER_YEAR,
			lastTickProcessed: jetzt,
			satiety: SATIETY_MAX,
			lastNeedTick: jetzt,
			RegionId: stadtId,
			DynastyId: hausId,
			// Was einer mitbringt — gewürfelt, damit die Stadt ungleich anfängt.
			money:
				STARTKAPITAL_MIN + Math.floor(Math.random() * (STARTKAPITAL_MAX - STARTKAPITAL_MIN + 1)),
			// Die Anlagen gewürfelt — sie sind die erste Generation und haben niemanden,
			// von dem sie etwas erben könnten. Ehrgeiz und Fleiß der drei Gründer stehen
			// allerdings fest: Ob die Stadt je einen Betrieb bekommt, darf nicht am Würfel
			// hängen.
			...randomPersonality(Math.random),
			...(person.unternehmend ? { ambition: GRUENDER_EHRGEIZ, diligence: GRUENDER_FLEISS } : {})
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
