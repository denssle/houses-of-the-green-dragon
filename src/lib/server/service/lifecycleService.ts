import { Op, type Transaction } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { chooseHeir, type Child, splitEstate } from '$lib/game/inheritance.logic';
import { diesThisTick, MORTALITY_ONSET_AGE } from '$lib/game/mortality.logic';
import { ageInYears, yearsToTicks } from '$lib/game/time';

/**
 * Sterben und Erben.
 *
 * Das Gegenstück zum Takt aus 4.1: Der Tod muss auch dann eintreten, wenn niemand
 * hinsieht — sonst stürben nur die Charaktere aktiver Spieler, und die Stadt füllte sich
 * mit unsterblichen NPCs. Deshalb ein Durchlauf je Tick statt fauler Auswertung beim
 * Lesen, anders als beim Aktionsbudget: Ein Todesfall betrifft nicht nur den Toten,
 * sondern seine Kinder, seinen Besitz und die Stadtkasse.
 *
 * Teuer ist der Durchlauf trotzdem nicht: Vor `MORTALITY_ONSET_AGE` ist das Risiko null,
 * also fragt die Abfrage nur die Alten ab. Und weil verpasste Ticks übersprungen werden
 * (4.1), gibt es je Herzschlag genau **einen** Wurf je Charakter — ein Serverausfall
 * lässt niemanden nachträglich sterben.
 */

/** Was bei einem Todesfall geschehen ist — für das Log und die Tests. */
export interface Death {
	characterId: string;
	name: string;
	age: number;
	heirId: string | null;
	/** Gesetzt, wenn mit ihm ein Haus erloschen ist. */
	extinctDynastyId: string | null;
}

/**
 * Ein Herzschlag lang sterben lassen.
 *
 * Der Zufall kommt als Parameter herein, damit Tests einen Todesfall erzwingen können,
 * ohne auf einen glücklichen Wurf zu warten.
 */
export async function reapTheDead(
	tick: number,
	roll: () => number = Math.random
): Promise<Death[]> {
	const alt = await Character.findAll({
		where: {
			deathTick: null,
			// Wer jünger ist, hat ein Risiko von null — die Zeile spart den Wurf für die
			// gesamte junge Bevölkerung, und das ist die Mehrheit.
			birthTick: { [Op.lte]: tick - yearsToTicks(MORTALITY_ONSET_AGE) }
		},
		attributes: ['id', 'birthTick']
	});

	const gestorben: Death[] = [];
	for (const kandidat of alt) {
		const alter: number = ageInYears(kandidat.dataValues.birthTick, tick);
		if (!diesThisTick(alter, roll())) continue;

		// Jeder Todesfall in eigener Transaktion: Ein Fehler beim Nachlass des einen darf
		// die übrigen nicht mitreißen.
		const fall = await die(kandidat.dataValues.id, tick);
		if (fall) gestorben.push(fall);
	}
	return gestorben;
}

/**
 * Lässt einen Charakter sterben und wickelt den Nachlass ab.
 *
 * Alles in einer Transaktion: Ein halb vollzogener Erbfall — Tote ohne Erben, Häuser
 * ohne Eigentümer — wäre nicht reparierbar, weil niemand mehr wüsste, wem was gehörte.
 *
 * Gibt `null` zurück, wenn der Charakter schon tot war. Das ist kein Fehler, sondern der
 * Normalfall bei zwei Durchläufen, die sich überholen.
 */
export async function die(characterId: string, tick: number): Promise<Death | null> {
	return sequelize.transaction(async (t: Transaction) => {
		const tot = await Character.findByPk(characterId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!tot || tot.dataValues.deathTick !== null) return null;

		const kinder = await lebendeKinder(characterId, t);
		const erbeId: string | null = chooseHeir(tot.dataValues.heirId, kinder, tick);
		const geschwister: string[] = kinder.map((kind) => kind.id).filter((id) => id !== erbeId);

		const geteilt = splitEstate(tot.dataValues.money, erbeId !== null, geschwister.length);

		// Erst der Tote: Sein Vermögen ist ab hier verteilt, nicht mehr seines.
		await tot.update({ deathTick: tick, money: 0 }, { transaction: t });

		if (erbeId) {
			await Character.increment('money', {
				by: geteilt.heir,
				where: { id: erbeId },
				transaction: t
			});
			if (geteilt.perSibling > 0) {
				await Character.increment('money', {
					by: geteilt.perSibling,
					where: { id: { [Op.in]: geschwister } },
					transaction: t
				});
			}
			await besitzUebertragen(characterId, erbeId, t);
		} else {
			await anDieStadt(tot.dataValues.RegionId, geteilt.toCity, characterId, t);
		}

		const erloschen: string | null = await hausFortfuehren(
			tot.dataValues.DynastyId,
			tot.dataValues.role === 'PLAYER',
			erbeId,
			tick,
			t
		);

		return {
			characterId,
			name: tot.dataValues.firstName,
			age: ageInYears(tot.dataValues.birthTick, tick),
			heirId: erbeId,
			extinctDynastyId: erloschen
		};
	});
}

/**
 * Benennt einen Erben.
 *
 * Geprüft wird gegen die lebenden Kinder, nicht gegen die Datenbankbeziehung: Ein
 * Fremder, ein Toter oder ein Geschwisterkind soll hier nicht hineinrutschen. `null`
 * nimmt die Benennung zurück — dann greift wieder die gesetzliche Reihenfolge.
 */
export async function designateHeir(characterId: string, heirId: string | null): Promise<boolean> {
	if (heirId === null) {
		await Character.update({ heirId: null }, { where: { id: characterId } });
		return true;
	}

	const kinder = await lebendeKinder(characterId);
	if (!kinder.some((kind) => kind.id === heirId)) return false;

	await Character.update({ heirId }, { where: { id: characterId } });
	return true;
}

/** Ein Kind, wie es auf der Charakterseite steht. */
export interface ChildOnList {
	id: string;
	firstName: string;
	age: number;
	isHeir: boolean;
}

/** Die lebenden Kinder mit Namen und Alter, für die Erbenwahl. */
export async function getChildren(characterId: string, tick: number): Promise<ChildOnList[]> {
	const eltern = await Character.findByPk(characterId);
	if (!eltern) return [];

	const gefunden = await Character.findAll({
		where: {
			deathTick: null,
			[Op.or]: [{ motherId: characterId }, { fatherId: characterId }]
		},
		order: [['birthTick', 'ASC']]
	});

	return gefunden.map((kind) => ({
		id: kind.dataValues.id,
		firstName: kind.dataValues.firstName,
		age: ageInYears(kind.dataValues.birthTick, tick),
		isHeir: kind.dataValues.id === eltern.dataValues.heirId
	}));
}

/** Die lebenden Kinder eines Charakters — Mutter oder Vater, das ist hier gleich. */
export async function lebendeKinder(
	characterId: string,
	transaction?: Transaction
): Promise<Child[]> {
	const gefunden = await Character.findAll({
		where: {
			deathTick: null,
			[Op.or]: [{ motherId: characterId }, { fatherId: characterId }]
		},
		attributes: ['id', 'birthTick'],
		transaction
	});
	return gefunden.map((kind) => ({
		id: kind.dataValues.id,
		birthTick: kind.dataValues.birthTick
	}));
}

/**
 * Grundstücke und Gebäude gehen ungeteilt an den Erben.
 *
 * `ownerType` bleibt `CHARACTER` — es wechselt nur die Person. Wichtig für den Fall,
 * dass der Erbe später selbst stirbt: Der Besitz wandert weiter, statt sich zu häufen.
 */
async function besitzUebertragen(vonId: string, anId: string, t: Transaction): Promise<void> {
	await Plot.update(
		{ OwnerCharacterId: anId },
		{ where: { OwnerCharacterId: vonId }, transaction: t }
	);
	await Building.update(
		{ OwnerCharacterId: anId },
		{ where: { OwnerCharacterId: vonId }, transaction: t }
	);
}

/**
 * Wer ohne Erben stirbt, dessen Besitz fällt an die öffentliche Hand.
 *
 * Nicht ins Nichts und nicht an einen zufälligen Nachbarn: Die Stadt kann Boden und
 * Häuser neu vergeben, und knappes Bauland bekommt damit einen Rückweg. `ownerType`
 * wechselt auf `CITY` — nicht auf `NONE`: `NONE` heißt „nie vergeben" und würde ein
 * bebautes Grundstück wieder zum Erstverkauf freigeben.
 */
async function anDieStadt(
	regionId: string,
	geld: number,
	verstorbenId: string,
	t: Transaction
): Promise<void> {
	if (geld > 0) {
		await Region.increment('treasury', { by: geld, where: { id: regionId }, transaction: t });
	}
	await Plot.update(
		{ ownerType: 'CITY', OwnerCharacterId: null, forSalePrice: null },
		{ where: { OwnerCharacterId: verstorbenId }, transaction: t }
	);
	await Building.update(
		{ ownerType: 'CITY', OwnerCharacterId: null, forSalePrice: null },
		{ where: { OwnerCharacterId: verstorbenId }, transaction: t }
	);
}

/**
 * Das Haus geht weiter — oder es ist am Ende.
 *
 * Der Erbe wird zum gespielten Charakter; die Dynastie bleibt, der Benutzer bleibt, nur
 * die Figur ist eine andere. Ohne Erben erlischt das Haus, und der Benutzer beginnt mit
 * einem neuen bei null.
 *
 * Gibt die ID der erloschenen Dynastie zurück, sonst `null`.
 */
async function hausFortfuehren(
	dynastyId: string | null,
	warGespielt: boolean,
	erbeId: string | null,
	tick: number,
	t: Transaction
): Promise<string | null> {
	// Fremd-NPCs gehören zu keinem Haus: Sie sterben, ihr Besitz wandert, sonst nichts.
	if (!dynastyId || !warGespielt) return null;

	if (erbeId) {
		await Character.update({ role: 'PLAYER' }, { where: { id: erbeId }, transaction: t });
		return null;
	}

	await Dynasty.update(
		{ isExtinct: true, extinctAtTick: tick },
		{ where: { id: dynastyId }, transaction: t }
	);
	return dynastyId;
}
