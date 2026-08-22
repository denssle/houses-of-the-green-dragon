import { randomUUID } from 'node:crypto';
import type { Model, Transaction } from 'sequelize';
import type { Character } from '$lib/model/character';
import type { Gender } from '$lib/db/attributes/enums';
import { Character as CharacterModel } from '$lib/db/model/character';
import { Dynasty as DynastyModel } from '$lib/db/model/dynasty';
import type {
	CharacterAttributes,
	CharacterCreationAttributes
} from '$lib/db/attributes/character.attributes';
import { convertToCharacter } from '$lib/db/attributes/character.attributes';
import { findStartRegionId } from '$lib/db/seed';
import * as buildingService from '$lib/server/service/buildingService';
import * as worldService from '$lib/server/service/worldService';
import { regrownActionPoints } from '$lib/game/tick.logic';
import { actionPointFactor, currentSatiety, SATIETY_MAX } from '$lib/game/need.logic';
import { randomPersonality } from '$lib/game/personality.logic';
import { AGE_OF_MAJORITY, MAX_ACTION_POINTS, yearsToTicks } from '$lib/game/time';

/** Was ein Haus seinem ersten Spross mitgibt. */
const STARTKAPITAL = 10;

export async function create(
	firstName: string,
	dynastyId: string,
	gender: Gender
): Promise<Character> {
	const jetzt = await worldService.currentTick();
	const angelegt = await CharacterModel.create({
		id: randomUUID(),
		firstName,
		role: 'PLAYER',
		gender,
		// Der erste Charakter einer Dynastie beginnt erwachsen — sonst müsste man vor dem
		// ersten Zug ein halbes Kinderleben abwarten. Die folgenden Generationen werden
		// geboren und wachsen auf.
		birthTick: jetzt - yearsToTicks(AGE_OF_MAJORITY),
		lastTickProcessed: jetzt,
		actionPoints: MAX_ACTION_POINTS,
		money: STARTKAPITAL,
		// Satt in die Welt: Der Stichtag ist jetzt, nicht null — sonst haette der Erste
		// seit Weltbeginn gehungert.
		satiety: SATIETY_MAX,
		lastNeedTick: jetzt,
		RegionId: await findStartRegionId(),
		DynastyId: dynastyId,
		// Der Stammvater eines Hauses hat keine Eltern, von denen er etwas erben könnte —
		// also gewürfelt. Ab der zweiten Generation vererbt `familyService` die Anlagen.
		...randomPersonality(Math.random)
	});

	// **Ein Dach von Anfang an, wenn die Stadt eines übrig hat** (5.6). Genau dafür steht
	// die städtische Unterkunft: Wer sie nicht bekommt, ist obdachlos — und Obdachlosigkeit
	// heißt keine Erholung und keine Kinder, also das Ende der Dynastie, bevor sie beginnt.
	//
	// Das ist keine Starthilfe, die etwas schenkt, sondern die Umsetzung dessen, wofür das
	// Haus gebaut wurde. Ist es voll, beginnt man eben im Freien und muss sich sputen.
	await buildingService.moveIntoFreeShelter(angelegt.dataValues.id);

	return convertToCharacter((await CharacterModel.findByPk(angelegt.dataValues.id))!.dataValues);
}

/**
 * Schreibt nachgewachsene Aktionspunkte fort.
 *
 * Faul ausgewertet statt per Durchlauf über alle Charaktere: Die Zahl ergibt sich aus der
 * Differenz zwischen Weltzeit und letztem Stand. Geschrieben wird nur, wenn sich etwas
 * ändert — sonst käme auf jeden Seitenaufruf ein Schreibzugriff.
 *
 * Muss an **jeder** Stelle greifen, die einen Charakter lädt: Auf der Anzeige, damit dort
 * nicht ein veralteter Vorrat steht, und innerhalb der Handlungs-Transaktionen, weil sonst
 * gegen den alten Stand abgerechnet würde. Die Rechnung ist idempotent — zweimal
 * ausgeführt kommt dasselbe heraus.
 */
/**
 * Wie viel Kraft dieser Mensch überhaupt ansammeln kann.
 *
 * Zwei Einflüsse, und **beide wirken auf die Obergrenze statt auf den Zufluss**: Hunger
 * senkt sie, ein gutes Dach hebt sie. Der Grund ist derselbe wie bei `actionPointFactor`
 * — die Rechnung bleibt über beliebige Tick-Abstände exakt. Ein Zufluss, der vom Wohnort
 * abhinge, verlangte zu wissen, wo jemand in der Zwischenzeit gewohnt hat, und dieses
 * Wissen gibt es nicht: Der Nachschub wird faul ausgewertet, aus einer Differenz.
 *
 * Der Hunger greift dabei **auf das Ganze** und nicht nur auf den Grundwert. Wer nichts
 * isst, hält auch in einem Großhaus nicht durch; das Haus ersetzt keine Mahlzeit.
 *
 * Muss überall dort gefragt werden, wo eine Obergrenze gebraucht wird — auch beim
 * Stärkungstrank, der bis dahin gegen `MAX_ACTION_POINTS` deckelte und einem Bewohner
 * eines Großhauses deshalb nichts mehr gegeben hätte, sobald er über achtundvierzig stand.
 */
export async function actionPointCeiling(
	character: { satiety: number; lastNeedTick: number; homeBuildingId: string | null },
	tick: number,
	transaction?: Transaction
): Promise<number> {
	const vomDach: number = await buildingService.restAtHome(
		character.homeBuildingId,
		tick,
		transaction
	);
	return Math.floor(
		(MAX_ACTION_POINTS + vomDach) *
			actionPointFactor(currentSatiety(character.satiety, character.lastNeedTick, tick))
	);
}

/**
 * Dieselbe Auskunft für jemanden, von dem man nur die Kennung hat.
 *
 * Sättigung und Wohnort stehen nicht im `Character`, den die Anzeige bekommt — sie sind
 * Innereien und sollen es bleiben. Diese Zeile holt sie einmal und gibt nur die Zahl
 * heraus, die dort hingehört.
 */
export async function actionPointCeilingOf(characterId: string, tick: number): Promise<number> {
	const instanz = await CharacterModel.findByPk(characterId);
	if (!instanz) return MAX_ACTION_POINTS;

	return actionPointCeiling(
		{
			satiety: instanz.dataValues.satiety,
			lastNeedTick: instanz.dataValues.lastNeedTick,
			homeBuildingId: instanz.dataValues.HomeBuildingId
		},
		tick
	);
}

async function nachwachsenLassen(
	instanz: Model<CharacterAttributes, CharacterCreationAttributes>,
	tick: number,
	transaction?: Transaction
): Promise<void> {
	const grenze: number = await actionPointCeiling(
		{
			satiety: instanz.dataValues.satiety,
			lastNeedTick: instanz.dataValues.lastNeedTick,
			homeBuildingId: instanz.dataValues.HomeBuildingId
		},
		tick,
		transaction
	);
	const gewachsen: number = Math.max(
		instanz.dataValues.actionPoints,
		regrownActionPoints(
			instanz.dataValues.actionPoints,
			instanz.dataValues.lastTickProcessed,
			tick,
			grenze
		)
	);
	if (
		gewachsen === instanz.dataValues.actionPoints &&
		instanz.dataValues.lastTickProcessed === tick
	) {
		return;
	}
	await instanz.update({ actionPoints: gewachsen, lastTickProcessed: tick }, { transaction });
}

/**
 * Lädt einen Charakter zum Handeln — gesperrt und auf dem Stand der Weltzeit.
 *
 * Der gemeinsame Einstieg für alles, was Ressourcen verbraucht: Erst die Sperre, dann das
 * Nachwachsen, dann die eigentliche Handlung. In dieser Reihenfolge, weil zwei parallele
 * Requests sonst denselben Punkt zweimal ausgeben könnten.
 */
export async function loadForAction(
	characterId: string,
	tick: number,
	transaction: Transaction
): Promise<Model<CharacterAttributes, CharacterCreationAttributes> | null> {
	const instanz = await CharacterModel.findByPk(characterId, {
		transaction,
		lock: transaction.LOCK.UPDATE
	});
	if (!instanz) return null;
	await nachwachsenLassen(instanz, tick, transaction);
	return instanz;
}

/**
 * Der gespielte Charakter des Benutzers.
 *
 * Führt über das Haus, nicht über den Benutzer: Charaktere hängen an der Dynastie, und
 * die Dynastie am Benutzer. Genau diese Kette macht den Generationenwechsel möglich —
 * der Benutzer bleibt, der Charakter wird ersetzt.
 */
export async function getCharacterForUser(userId: string): Promise<Character | undefined> {
	const haus = await DynastyModel.findOne({ where: { UserId: userId, isExtinct: false } });
	if (!haus) return undefined;

	const gefunden = await CharacterModel.findOne({
		where: { DynastyId: haus.dataValues.id, role: 'PLAYER', deathTick: null }
	});
	if (!gefunden) return undefined;

	const jetzt: number = await worldService.currentTick();
	await nachwachsenLassen(gefunden, jetzt);

	// **Hier und nur hier** wird festgehalten, dass ein Mensch hereingeschaut hat. Dieser
	// Weg führt über die Sitzung; die Selbstverwaltung (5.5) kommt nie hier vorbei und
	// kann sich deshalb nicht selbst für anwesend erklären.
	//
	// Geschrieben wird höchstens einmal je Tick: Ein Blick auf fünf Seiten in derselben
	// Stunde ist derselbe Blick, und fünf Schreibzugriffe wären vier zu viel.
	if (gefunden.dataValues.lastSeenTick !== jetzt) {
		await gefunden.update({ lastSeenTick: jetzt });
	}

	return convertToCharacter(gefunden.dataValues);
}

export async function getCharacter(
	characterId: string,
	tick?: number
): Promise<Character | undefined> {
	const gefunden = await CharacterModel.findByPk(characterId);
	if (!gefunden) return undefined;

	// **Die Weltzeit darf mitgegeben werden** (Punkt 67): Die NPC-Schleife kennt sie und
	// spart damit eine Abfrage je Einwohner und Tick. Wer sie nicht kennt — jede Seite —,
	// schlägt sie wie bisher nach.
	await nachwachsenLassen(gefunden, tick ?? (await worldService.currentTick()));
	return convertToCharacter(gefunden.dataValues);
}

export async function update(character: Character): Promise<void> {
	await CharacterModel.update(
		{
			title: character.title,
			actionPoints: character.actionPoints,
			money: character.money,
			deathTick: character.deathTick,
			HomeBuildingId: character.homeBuildingId
		},
		{ where: { id: character.id } }
	);
}
