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
import { chamberCapacity, fitsInChamber } from '$lib/game/inventory.logic';
import * as buildingService from '$lib/server/service/buildingService';
import { getItemTemplate, type ItemTemplate } from '$lib/model/itemTemplate';
import { canAfford } from '$lib/game/economy';
import { tonicRestores } from '$lib/game/attire.logic';
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
 * Wie viel die Kammer dieses Menschen fasst.
 *
 * Was er am Leib trägt, plus das, was sein Dach hergibt — die Zahl, die auf der
 * Kammerseite hinter dem Schrägstrich steht.
 */
export async function chamberCapacityOf(characterId: string, t?: Transaction): Promise<number> {
	const person = await Character.findByPk(characterId, { transaction: t });
	if (!person) return chamberCapacity(0);

	const tick: number = await worldService.currentTick();
	return chamberCapacity(
		await buildingService.storageAtHome(person.dataValues.HomeBuildingId, tick, t)
	);
}

/** Wie viele Stücke insgesamt in der Kammer liegen — jede Sorte zählt gleich. */
export async function chamberUsed(characterId: string, t?: Transaction): Promise<number> {
	const alle = await Inventory.findAll({ where: { CharacterId: characterId }, transaction: t });
	return alle.reduce((summe, zeile) => summe + zeile.dataValues.quantity, 0);
}

/**
 * Legt etwas ins Lager oder nimmt es heraus.
 *
 * Zeilen, die auf null fallen, verschwinden — dieselbe Sparsamkeit wie bei der Zuneigung.
 * Gibt `false` zurück, wenn nicht genug da ist; die Prüfung gehört hierher, weil nur hier
 * gesperrt wird.
 *
 * **Seit 5.33 auch nach oben begrenzt.** Was hereinkommt, muss in die Kammer passen —
 * und weil jeder Weg in den persönlichen Vorrat durch diese eine Zeile führt (Kauf,
 * Ernte ohne Hof, Auslagern, zurückgezogenes Angebot), steht die Prüfung hier und nicht
 * viermal daneben. Wer schon darüber liegt, verliert nichts; er nimmt nur nichts mehr
 * auf.
 */
export async function changeStock(
	characterId: string,
	itemId: string,
	delta: number,
	t: Transaction
): Promise<boolean> {
	if (delta > 0) {
		const platz: number = await chamberCapacityOf(characterId, t);
		if (!fitsInChamber(await chamberUsed(characterId, t), platz, delta)) return false;
	}

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

		// **Erst hineinlegen, dann zahlen.** Passt es nicht in die Kammer, findet der Kauf
		// nicht statt — sonst wäre das Geld weg und die Ware nirgends.
		if (!(await changeStock(characterId, itemId, quantity, t))) {
			return { ok: false, reason: 'CHAMBER_FULL' } as const;
		}
		await käufer.update({ money: käufer.dataValues.money - kosten }, { transaction: t });
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

// --- Kleidung und Tränke (4.11) ------------------------------------------------------

/**
 * Ein Gewand anziehen.
 *
 * Das alte wird dabei nicht ausgezogen, sondern **ersetzt** — wer ein neues anlegt, hat
 * das alte abgelegt, und ein Kleiderschrank wäre ein System für sich. Der Zeitpunkt ist
 * alles, was gespeichert wird: Ob es noch heil ist, rechnet `attire.logic.ts` daraus aus.
 */
export async function wearGarment(characterId: string): Promise<NeedResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const person = await Character.findByPk(characterId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!person) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		if (!(await changeStock(characterId, 'GARMENT', -1, t))) {
			return { ok: false, reason: 'NOT_IN_STOCK' } as const;
		}
		await person.update({ wornSinceTick: tick }, { transaction: t });
		return { ok: true } as const;
	});
}

/**
 * Einen Stärkungstrank trinken.
 *
 * Er füllt nur auf, was fehlt: Über die Obergrenze hinaus wirkt er nicht, sonst hortete
 * man Punkte für einen Tag, an dem alles auf einmal geschieht — und die Drosselung über
 * das Aktionsbudget wäre ausgehebelt.
 */
export async function drinkTonic(
	characterId: string
): Promise<{ ok: true; restored: number } | { ok: false; reason: ActionFailureReason }> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const person = await characterService.loadForAction(characterId, tick, t);
		if (!person) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		// **Die persönliche Obergrenze**, nicht die allgemeine: Seit ein Dach den Vorrat
		// hebt, sind die beiden nicht mehr dasselbe. Stünde hier weiter `MAX_ACTION_POINTS`,
		// verpuffte der Trank ausgerechnet bei dem, der sich das Großhaus geleistet hat —
		// und der Trank wäre bei ihm nicht schwächer, sondern wirkungslos.
		const grenze: number = await characterService.actionPointCeiling(
			{
				satiety: person.dataValues.satiety,
				lastNeedTick: person.dataValues.lastNeedTick,
				homeBuildingId: person.dataValues.HomeBuildingId
			},
			tick,
			t
		);
		const zurueck: number = tonicRestores(person.dataValues.actionPoints, grenze);
		if (zurueck <= 0) return { ok: false, reason: 'NOTHING_TO_DO' } as const;

		if (!(await changeStock(characterId, 'TONIC', -1, t))) {
			return { ok: false, reason: 'NOT_IN_STOCK' } as const;
		}
		await person.update(
			{ actionPoints: person.dataValues.actionPoints + zurueck },
			{ transaction: t }
		);
		return { ok: true, restored: zurueck } as const;
	});
}
