import * as chronicleService from '$lib/server/service/chronicleService';
import { randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { Character } from '$lib/db/model/character';
import { Law } from '$lib/db/model/law';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import {
	canEnact,
	collectable,
	currentValue,
	type Enactment,
	LAW_KINDS,
	type LawKind,
	propertyTaxFor
} from '$lib/game/law.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';
import * as electionService from '$lib/server/service/electionService';
import * as nameService from '$lib/server/service/nameService';

/**
 * Gesetze und ihre Erhebung.
 *
 * **Ein Gesetz ist ein Parameter, kein Effekt.** Jede Art zeigt auf eine Stellschraube,
 * die es ohnehin gibt; der Bürgermeister verschiebt sie. Gespeichert wird jeder Erlass
 * einzeln, es gilt der jüngste — dieselbe Bauart wie beim Amt aus 4.7a, und aus
 * demselben Grund: Der geltende Satz ist dann eine Rechnung und kein zweiter Zustand,
 * der abweichen könnte.
 */

export type EnactResult = { ok: true } | { ok: false; reason: ActionFailureReason };

async function erlasse(regionId: string, t?: Transaction): Promise<Enactment[]> {
	const zeilen = await Law.findAll({ where: { RegionId: regionId }, transaction: t });
	return zeilen.map((zeile) => ({
		kind: zeile.dataValues.kind,
		value: zeile.dataValues.value,
		enactedTick: zeile.dataValues.enactedTick
	}));
}

/**
 * Der Satz, der in dieser Stadt gerade gilt.
 *
 * Wird bei jeder Ernte und jedem Kauf gebraucht und liest deshalb jedes Mal nach. Das
 * ist die teurere Variante — und die einzige, bei der ein Erlass sofort wirkt. Ein
 * zwischengespeicherter Satz wäre schneller und würde beim ersten Gesetz zeigen, dass er
 * veraltet ist; falls es je knapp wird, gehört der Zwischenspeicher an die Stadt und
 * nicht an dieses Modul.
 */
export async function rate(regionId: string, kind: LawKind, t?: Transaction): Promise<number> {
	return currentValue(await erlasse(regionId, t), kind);
}

/** Alle geltenden Sätze auf einmal — für die Gesetzestafel. */
export async function rates(regionId: string): Promise<Record<LawKind, number>> {
	const alle: Enactment[] = await erlasse(regionId);
	return Object.fromEntries(LAW_KINDS.map((art) => [art, currentValue(alle, art)])) as Record<
		LawKind,
		number
	>;
}

/**
 * Etwas erlassen.
 *
 * Nur der Amtsinhaber, und es gilt ab sofort. Kein Vorlauf, keine Bestätigung: Das Amt
 * soll sich anfühlen wie Macht, und wer sie missbraucht, wird nicht daran gehindert —
 * sondern abgewählt.
 */
export async function enact(
	characterId: string,
	regionId: string,
	kind: LawKind,
	value: number,
	tick: number
): Promise<EnactResult> {
	const inhaber = await electionService.getHolder(regionId);
	const gilt: number = await rate(regionId, kind);

	const geprueft = canEnact({ isHolder: inhaber?.characterId === characterId }, kind, value, gilt);
	if (!geprueft.ok) return geprueft;

	await Law.create({
		id: randomUUID(),
		RegionId: regionId,
		kind,
		value,
		enactedTick: tick,
		EnactedByCharacterId: characterId
	});
	await chronicleService.record('LAW_ENACTED', regionId, tick, {
		subjectId: characterId,
		value,
		detail: kind
	});
	return { ok: true };
}

/** Ein Erlass, wie ihn die Chronik zeigt. */
export interface ChronicleEntry {
	kind: LawKind;
	value: number;
	enactedTick: number;
	enactedBy: string | null;
}

export async function chronicle(regionId: string, limit = 10): Promise<ChronicleEntry[]> {
	const zeilen = await Law.findAll({
		where: { RegionId: regionId },
		order: [['enactedTick', 'DESC']],
		limit
	});

	// Wer ein Gesetz erlassen hat, wird mit Haus genannt (5.10): Die Stadtgeschichte merkt
	// sich Familien, nicht Vornamen.
	const namen = await nameService.displayNames(
		zeilen.map((z) => z.dataValues.EnactedByCharacterId).filter((id): id is string => Boolean(id))
	);

	const eintraege: ChronicleEntry[] = [];
	for (const zeile of zeilen) {
		const urheberId: string | null = zeile.dataValues.EnactedByCharacterId ?? null;
		eintraege.push({
			kind: zeile.dataValues.kind,
			value: zeile.dataValues.value,
			enactedTick: zeile.dataValues.enactedTick,
			enactedBy: urheberId ? (namen.get(urheberId) ?? null) : null
		});
	}
	return eintraege;
}

// --- Die Grundsteuer -----------------------------------------------------------------

export interface TaxRun {
	collected: number;
	payers: number;
	/** Was nicht eingetrieben werden konnte, weil die Kasse leer war. */
	shortfall: number;
}

/**
 * Die Grundsteuer einziehen — einmal je Spieljahr.
 *
 * Sie ist die einzige Abgabe, die an der **Zeit** hängt statt an einer Handlung, und
 * deshalb die einzige, die einen Durchlauf braucht. Das ist vertretbar: Es gibt in einer
 * Stadt Dutzende Grundstücke, nicht Tausende, und der Durchlauf kommt alle fünfzig Ticks.
 *
 * Bei einem Serverausfall fällt die Erhebung aus, statt nachgeholt zu werden — dieselbe
 * Regel wie beim Nachwachsen und beim Sterben: Übersprungene Zeit hat nicht
 * stattgefunden. Ein Spieler, der nach einer Woche Ausfall drei Jahressteuern auf einmal
 * zahlen müsste, wäre für einen Serverfehler bestraft worden.
 */
export async function collectPropertyTax(
	regionId: string,
	tick: number
): Promise<TaxRun | undefined> {
	const stadt = await Region.findByPk(regionId);
	if (!stadt) return undefined;

	const zuletzt: number | null = stadt.dataValues.lastTaxTick;
	if (zuletzt === null) {
		// Beim allerersten Mal wird nicht erhoben, sondern nur der Zeitpunkt gesetzt:
		// Sonst zöge eine frisch aufgesetzte Welt sofort ein volles Jahr ein.
		await stadt.update({ lastTaxTick: tick });
		return undefined;
	}
	if (tick - zuletzt < TICKS_PER_YEAR) return undefined;

	const satz: number = await rate(regionId, 'PROPERTY_TAX');
	await stadt.update({ lastTaxTick: tick });
	if (satz <= 0) return undefined;

	const grundstuecke = await Plot.findAll({
		where: { RegionId: regionId, ownerType: 'CHARACTER', OwnerCharacterId: { [Op.ne]: null } }
	});

	const proBesitzer = new Map<string, number>();
	for (const flaeche of grundstuecke) {
		const besitzerId: string | null = flaeche.dataValues.OwnerCharacterId;
		if (!besitzerId) continue;
		proBesitzer.set(besitzerId, (proBesitzer.get(besitzerId) ?? 0) + 1);
	}

	let eingenommen = 0;
	let ausgefallen = 0;
	let zahlende = 0;

	for (const [besitzerId, anzahl] of proBesitzer) {
		const besitzer = await Character.findByPk(besitzerId);
		// Tote zahlen nicht; ihr Besitz ist zu diesem Zeitpunkt längst vererbt.
		if (!besitzer || besitzer.dataValues.deathTick !== null) continue;

		const schuld: number = propertyTaxFor(anzahl, satz);
		const gezahlt: number = collectable(schuld, besitzer.dataValues.money);
		if (gezahlt <= 0) {
			ausgefallen += schuld;
			continue;
		}

		await besitzer.update({ money: besitzer.dataValues.money - gezahlt });
		eingenommen += gezahlt;
		ausgefallen += schuld - gezahlt;
		zahlende++;
	}

	if (eingenommen > 0) {
		await Region.increment('treasury', { by: eingenommen, where: { id: regionId } });
	}

	return { collected: eingenommen, payers: zahlende, shortfall: ausgefallen };
}
