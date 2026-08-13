import { type Model, type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { Region } from '$lib/db/model/region';
import type {
	CharacterAttributes,
	CharacterCreationAttributes
} from '$lib/db/attributes/character.attributes';
import { currentSatiety, eat, satietyLabel, wouldBeWasted } from '$lib/game/need.logic';
import { getItemTemplate, type ItemTemplate } from '$lib/model/itemTemplate';
import { canAfford } from '$lib/game/economy';
import * as characterService from '$lib/server/service/characterService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Hunger und Habe.
 *
 * Die Sättigung wird beim Lesen aus den verstrichenen Ticks gerechnet und **nur beim
 * Essen geschrieben** — dasselbe Muster wie beim Gebäudeverfall. Ein Durchlauf über alle
 * Einwohner je Stunde wäre die teuerste Schleife im Spiel und brächte nichts, was sich
 * nicht ausrechnen ließe.
 */

export type NeedResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/** Wie satt jemand jetzt ist. */
export function satietyOf(
	werte: Pick<CharacterAttributes, 'satiety' | 'lastNeedTick'>,
	tick: number
): number {
	return currentSatiety(werte.satiety, werte.lastNeedTick, tick);
}

/** Sättigung und das Wort dazu — für die Anzeige. */
export async function getHunger(
	characterId: string,
	tick: number
): Promise<{ satiety: number; label: string } | undefined> {
	const gefunden = await Character.findByPk(characterId);
	if (!gefunden) return undefined;

	const stand: number = satietyOf(gefunden.dataValues, tick);
	return { satiety: Math.round(stand), label: satietyLabel(stand) };
}

// --- Vorrat --------------------------------------------------------------------------

/** Ein Posten im Lager. */
export interface StockItem {
	itemId: string;
	name: string;
	quantity: number;
	nourishment?: number;
}

export async function getStock(characterId: string): Promise<StockItem[]> {
	const alle = await Inventory.findAll({ where: { CharacterId: characterId } });

	const lager: StockItem[] = [];
	for (const zeile of alle) {
		const vorlage: ItemTemplate | undefined = getItemTemplate(zeile.dataValues.itemId);
		// Eine Ware, die aus dem Katalog verschwunden ist, wird nicht angezeigt — die
		// Zeile bleibt aber stehen, falls sie zurückkommt.
		if (!vorlage) continue;

		lager.push({
			itemId: vorlage.itemId,
			name: vorlage.name,
			quantity: zeile.dataValues.quantity,
			nourishment: vorlage.nourishment
		});
	}
	return lager;
}

/**
 * Legt etwas ins Lager oder nimmt es heraus.
 *
 * Zeilen, die auf null fallen, verschwinden — dieselbe Sparsamkeit wie bei der Zuneigung.
 * Gibt `false` zurück, wenn nicht genug da ist; die Prüfung gehört hierher, weil nur hier
 * gesperrt wird.
 */
export async function changeStock(
	characterId: string,
	itemId: string,
	delta: number,
	t: Transaction
): Promise<boolean> {
	const zeile = await Inventory.findOne({
		where: { CharacterId: characterId, itemId },
		transaction: t,
		lock: t.LOCK.UPDATE
	});
	const vorher: number = zeile?.dataValues.quantity ?? 0;
	const nachher: number = vorher + delta;

	if (nachher < 0) return false;

	if (nachher === 0) {
		if (zeile) {
			await Inventory.destroy({ where: { CharacterId: characterId, itemId }, transaction: t });
		}
		return true;
	}

	await Inventory.upsert(
		{ CharacterId: characterId, itemId, quantity: nachher },
		{ transaction: t }
	);
	return true;
}

// --- Essen ---------------------------------------------------------------------------

/**
 * Etwas essen.
 *
 * Kostet keinen Aktionspunkt: Essen ist kein Vorhaben, sondern eine Notwendigkeit — wer
 * dafür bezahlen müsste, verhungerte ausgerechnet dann, wenn er schon geschwächt ist.
 * Bezahlt wird mit der Ware selbst.
 */
export async function eatItem(characterId: string, itemId: string): Promise<NeedResult> {
	const vorlage: ItemTemplate | undefined = getItemTemplate(itemId);
	const naehrwert: number | undefined = vorlage?.nourishment;
	if (naehrwert === undefined) return { ok: false, reason: 'NOT_EDIBLE' };

	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const esser = await Character.findByPk(characterId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!esser) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const stand: number = satietyOf(esser.dataValues, tick);
		if (wouldBeWasted(stand)) return { ok: false, reason: 'NOTHING_TO_DO' } as const;

		if (!(await changeStock(characterId, itemId, -1, t))) {
			return { ok: false, reason: 'NOT_IN_STOCK' } as const;
		}

		// Stichtag mitschreiben: Ohne ihn liefe der Hunger ab dem alten Datum weiter und
		// die Mahlzeit wäre im selben Moment wieder verbraucht.
		await esser.update(
			{ satiety: Math.round(eat(stand, naehrwert)), lastNeedTick: tick },
			{ transaction: t }
		);
		return { ok: true } as const;
	});
}

// --- Der städtische Kornspeicher -----------------------------------------------------

/**
 * Brot bei der Stadt kaufen.
 *
 * Eine Krücke, und eine bewusste: Solange es keine Bauern und keine Mühlen gibt, kommt
 * Nahrung nirgendwoher — und ohne Nahrung verhungert die halbe Stadt, bevor die
 * Produktion gebaut ist. Der Kornspeicher ist dieselbe Art Brücke wie die städtische
 * Schmiede aus 3.3: Er hält den Grundweg begehbar, bis es einen echten Markt gibt.
 *
 * Das Geld geht an die **Stadtkasse**, wie beim Erstverkauf von Bauland. Mit 4.6c
 * verkaufen Betriebe ihr eigenes Brot, und dann gehört diese Funktion überprüft —
 * vermerkt bei Punkt 14 der offenen Punkte.
 */
export async function buyFromGranary(
	characterId: string,
	itemId: string,
	quantity: number
): Promise<NeedResult> {
	const vorlage: ItemTemplate | undefined = getItemTemplate(itemId);
	if (!vorlage) return { ok: false, reason: 'NOT_FOR_SALE' };
	if (!Number.isInteger(quantity) || quantity < 1) {
		return { ok: false, reason: 'NOTHING_TO_DO' };
	}

	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const käufer = await characterService.loadForAction(characterId, tick, t);
		if (!käufer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const kosten: number = vorlage.basePrice * quantity;
		if (!canAfford(käufer.dataValues.money, kosten)) {
			return { ok: false, reason: 'NOT_ENOUGH_MONEY' } as const;
		}

		await käufer.update({ money: käufer.dataValues.money - kosten }, { transaction: t });
		await changeStock(characterId, itemId, quantity, t);
		await Region.increment('treasury', {
			by: kosten,
			where: { id: käufer.dataValues.RegionId },
			transaction: t
		});
		return { ok: true } as const;
	});
}

/** Was der Kornspeicher führt — heute genau eine Ware. */
export function granaryOffers(): ItemTemplate[] {
	return [getItemTemplate('BREAD')!];
}

/** Der Ausschnitt eines Charakters, den die Sättigung braucht. */
export type Fed = Model<CharacterAttributes, CharacterCreationAttributes>;
