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
async function nachwachsenLassen(
	instanz: Model<CharacterAttributes, CharacterCreationAttributes>,
	tick: number,
	transaction?: Transaction
): Promise<void> {
	// Hunger senkt die **Obergrenze**, nicht den Zufluss: Die Rechnung bleibt damit ueber
	// beliebige Tick-Abstaende exakt, und niemandem wird genommen, was er sich satt
	// erarbeitet hat.
	const grenze: number = Math.floor(
		MAX_ACTION_POINTS *
			actionPointFactor(
				currentSatiety(instanz.dataValues.satiety, instanz.dataValues.lastNeedTick, tick)
			)
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

export async function getCharacter(characterId: string): Promise<Character | undefined> {
	const gefunden = await CharacterModel.findByPk(characterId);
	if (!gefunden) return undefined;

	await nachwachsenLassen(gefunden, await worldService.currentTick());
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
