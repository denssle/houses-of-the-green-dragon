import { type Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { Lease } from '$lib/db/model/lease';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { produce, type Recipe, titheOn } from '$lib/game/production.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';
import { seasonOf } from '$lib/game/time';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as needService from '$lib/server/service/needService';
import * as regionService from '$lib/server/service/regionService';
import * as lawService from '$lib/server/service/lawService';
import * as tradeService from '$lib/server/service/tradeService';
import * as skillService from '$lib/server/service/skillService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Die Produktionskette: pachten, ernten, mahlen, backen.
 *
 * **Auf eigene Rechnung.** Wer mahlt, mahlt sein eigenes Getreide und behält das Mehl;
 * der Vorrat des Handwerkers ist der Zwischenspeicher. Ein Betrieb, der Angestellte für
 * Lohn arbeiten lässt und den Ertrag behält, braucht Anstellungsverhältnisse — die
 * kommen mit 4.6d. Bis dahin ist die Mühle ein Werkzeug, kein Arbeitgeber.
 *
 * Damit hat Brot zum ersten Mal eine Herkunft. Der städtische Kornspeicher bleibt
 * vorerst, weil sonst niemand über die erste Ernte käme — aber er ist ab jetzt der
 * Notnagel und nicht mehr die einzige Quelle.
 */

export type ProductionResult =
	| { ok: true; produced: number; itemId: string; tithe?: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Das Rezept einer Abbaufläche.
 *
 * Steht hier und nicht in der Fläche: Was ein Acker hergibt, ist Weltinhalt wie eine
 * Gebäudevorlage — er soll sich ändern lassen, ohne dass Bestandsflächen die alten Werte
 * einfrieren.
 */
const ABBAU: Record<string, Recipe> = {
	GRAIN: {
		input: [],
		outputItemId: 'GRAIN',
		baseOutput: 6,
		actionPointCost: 1,
		skill: 'FARMING',
		// Getreide gibt es zur Ernte, nicht im Januar. Die erste Wirkung der Jahreszeiten,
		// die etwas erzeugt statt nur etwas zu verteuern.
		seasons: ['SUMMER', 'AUTUMN']
	},
	// Holz, Stein und Erz — seit 4.10 haben sie eine Verwendung: Sie werden über die
	// Werkstätten zu Baumaterial, und das wird beim Bauen und Renovieren verbraucht.
	//
	// **Ohne Jahreszeiten-Einschränkung, anders als beim Getreide.** Ein Baum lässt sich
	// im Februar fällen und ein Stein im Juli brechen; nur der Acker richtet sich nach
	// dem Jahr. Der Winteraufschlag aufs Bauen (4.5b) reicht als jahreszeitliche Wirkung.
	WOOD: {
		input: [],
		outputItemId: 'WOOD',
		baseOutput: 4,
		actionPointCost: 1,
		skill: 'FORESTRY'
	},
	STONE: {
		input: [],
		outputItemId: 'STONE',
		baseOutput: 3,
		actionPointCost: 1,
		skill: 'MINING'
	},
	ORE: {
		input: [],
		outputItemId: 'ORE',
		baseOutput: 2,
		actionPointCost: 1,
		skill: 'MINING'
	},
	// Wolle und Kräuter (4.11). Die Schafe geben das ganze Jahr, die Kräuter nicht: Was
	// im Januar am Waldrand wächst, taugt für kein Duftwasser.
	WOOL: {
		input: [],
		outputItemId: 'WOOL',
		baseOutput: 3,
		actionPointCost: 1,
		skill: 'FARMING'
	},
	HERBS: {
		input: [],
		outputItemId: 'HERBS',
		baseOutput: 4,
		actionPointCost: 1,
		skill: 'ALCHEMY',
		seasons: ['SPRING', 'SUMMER', 'AUTUMN']
	}
};

export function harvestRecipe(resourceType: string | null): Recipe | undefined {
	const rezept: Recipe | undefined = resourceType ? ABBAU[resourceType] : undefined;
	// Eine Ernte, deren Ertrag nicht im Warenkatalog steht, landete zwar im Vorrat, wäre
	// dort aber unsichtbar: `getStock` lässt unbekannte Waren fallen. Genau so sind
	// einmal dreißig Stämme Holz entstanden, die niemand je zu sehen bekam.
	if (rezept && !getItemTemplate(rezept.outputItemId)) return undefined;
	return rezept;
}

// --- Pacht ---------------------------------------------------------------------------

/** Was es kostet, eine Fläche zu pachten. Der laufende Anteil ist der Zehnt. */
export const LEASE_FEE = 20;

export type LeaseResult = { ok: true } | { ok: false; reason: ActionFailureReason };

/**
 * Eine Abbaufläche pachten.
 *
 * Der Eintritt kostet einmalig, der Betrieb laufend — über den **Zehnt** auf jede Ernte
 * statt über eine Uhr. Damit braucht es keinen Durchlauf über alle Pachtverhältnisse je
 * Tick, und wer nichts erntet, zahlt nichts. Die zeitabhängige Pacht kommt zurück,
 * sobald es Ämter gibt, die sie eintreiben (4.7).
 */
export async function leasePlot(characterId: string, plotId: string): Promise<LeaseResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const flaeche = await Plot.findByPk(plotId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!flaeche || flaeche.dataValues.type !== 'RESOURCE') {
			return { ok: false, reason: 'NOT_LEASED' } as const;
		}

		const vergeben = await Lease.findOne({ where: { PlotId: plotId }, transaction: t });
		if (vergeben) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		const paechter = await characterService.loadForAction(characterId, tick, t);
		if (!paechter) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;
		if (paechter.dataValues.money < LEASE_FEE) {
			return { ok: false, reason: 'NOT_ENOUGH_MONEY' } as const;
		}

		await paechter.update({ money: paechter.dataValues.money - LEASE_FEE }, { transaction: t });
		// **An die Stadt, nicht an den Acker** (5.24, Punkt 65): Die Umlandregionen haben
		// eine Kasse, aber weder Amt noch Ausgaben — was dort einging, war aus dem Spiel.
		await Region.increment('treasury', {
			by: LEASE_FEE,
			where: { id: await regionService.cityOf(flaeche.dataValues.RegionId) },
			transaction: t
		});
		await Lease.create(
			{ PlotId: plotId, CharacterId: characterId, sinceTick: tick },
			{ transaction: t }
		);
		await errichteHof(flaeche.dataValues.id, flaeche.dataValues.address, characterId, tick, t);
		return { ok: true } as const;
	});
}

/**
 * Der Hof, der mit der Pacht entsteht.
 *
 * **Damit eine Fläche Leute beschäftigen kann, braucht sie ein Haus.** Die Anstellung
 * hängt im ganzen Spiel an einem Gebäude — Aushang, Stellenzahl, Schicht, Lohnkasse und
 * Lager. Ein zweiter Weg nur für Pachtflächen wäre dieselbe Buchhaltung ein zweites Mal,
 * und jede spätere Regel über Arbeitgeber müsste sich an zwei Stellen erinnern.
 *
 * Der Hof kostet nichts: Bezahlt wird die Pacht, und der Schuppen daneben ist keine
 * eigene Entscheidung. Er gehört dem Pächter — deshalb zahlt der auch den Lohn, und
 * deshalb fällt der Hof mit der Pacht (siehe `releaseLeases`).
 */
async function errichteHof(
	plotId: string,
	adresse: string,
	paechterId: string,
	tick: number,
	t: Transaction
): Promise<void> {
	await Building.create(
		{
			id: randomUUID(),
			name: `Hof am ${adresse}`,
			optionId: buildingService.HOF_OPTION_ID,
			lastConditionTick: tick,
			PlotId: plotId,
			ownerType: 'CHARACTER',
			OwnerCharacterId: paechterId
		},
		{ transaction: t }
	);
}

/**
 * Beim Tod fällt jede Pacht an die Stadt zurück (Punkt 8).
 *
 * Genau das unterscheidet Pacht von Eigentum — sonst wäre sie gekauftes Land mit
 * Extraschritten, und die erste Generation sicherte sich die guten Flächen auf Dauer.
 * Wird aus `lifecycleService` gerufen, damit der Erbfall an einer Stelle bleibt.
 */
export async function releaseLeases(characterId: string, t?: Transaction): Promise<void> {
	// **Der Hof fällt mit der Pacht.** Er stand auf fremdem Grund und war nie gekauft;
	// bliebe er stehen, hätte der nächste Pächter das Haus des Verstorbenen auf seiner
	// Fläche — samt dessen Knechten und dessen Lager. Die Anstellungen enden mit dem
	// Gebäude, dafür sorgt `workForEmployer` bereits von sich aus.
	const pachten = await Lease.findAll({ where: { CharacterId: characterId }, transaction: t });
	for (const pacht of pachten) {
		await Building.destroy({
			where: { PlotId: pacht.dataValues.PlotId, optionId: buildingService.HOF_OPTION_ID },
			transaction: t
		});
	}

	await Lease.destroy({ where: { CharacterId: characterId }, transaction: t });
}

/** Die Flächen einer Region samt Pächter — für die Anzeige. */
export interface LeasableArea {
	plotId: string;
	address: string;
	resourceType: string | null;
	leasedByMe: boolean;
	leased: boolean;
}

export async function getAreas(characterId: string): Promise<LeasableArea[]> {
	const flaechen = await Plot.findAll({ where: { type: 'RESOURCE' } });

	const liste: LeasableArea[] = [];
	for (const flaeche of flaechen) {
		const pacht = await Lease.findOne({ where: { PlotId: flaeche.dataValues.id } });
		liste.push({
			plotId: flaeche.dataValues.id,
			address: flaeche.dataValues.address,
			resourceType: flaeche.dataValues.resourceType,
			leasedByMe: pacht?.dataValues.CharacterId === characterId,
			leased: pacht !== null
		});
	}
	return liste;
}

// --- Ernten --------------------------------------------------------------------------

/**
 * Auf einer gepachteten Fläche ernten.
 *
 * Der Zehnt geht in Münzen an die Stadt, nicht in Ware — die Stadtkasse ist ein
 * Geldbetrag, und ein Kornspeicher voller Naturalien wäre ein zweites Lagerwesen.
 */
export async function harvest(characterId: string, plotId: string): Promise<ProductionResult> {
	const tick: number = await worldService.currentTick();

	const flaeche = await Plot.findByPk(plotId);
	const rezept: Recipe | undefined = harvestRecipe(flaeche?.dataValues.resourceType ?? null);
	if (!flaeche || !rezept) return { ok: false, reason: 'NOT_LEASED' };

	const pacht = await Lease.findOne({ where: { PlotId: plotId } });
	if (pacht?.dataValues.CharacterId !== characterId) {
		return { ok: false, reason: 'NOT_LEASED' };
	}

	return sequelize.transaction(async (t: Transaction) => {
		const baeuerin = await characterService.loadForAction(characterId, tick, t);
		if (!baeuerin) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const ergebnis = produce(
			{
				actionPoints: baeuerin.dataValues.actionPoints,
				skillLevel: await skillService.getLevel(characterId, rezept.skill, t)
			},
			rezept,
			{},
			// Ein Acker hat keinen Zustand wie ein Gebäude — er trägt immer voll.
			100,
			seasonOf(tick)
		);
		if (!ergebnis.ok) return ergebnis;

		// Der Zehnt ist seit 4.7b ein Gesetz: Der Satz kommt aus der Stadt, nicht aus dem
		// Code — und seit 5.24 wird er auch **dort** nachgeschlagen, wo er beschlossen
		// wurde. Vorher fragte diese Zeile die Umlandregion, in der nie jemand etwas
		// erlässt: Vier Erhöhungen des Bürgermeisters blieben deshalb wirkungslos.
		const stadtId: string = await regionService.cityOf(flaeche.dataValues.RegionId);
		const zehntsatz: number = await lawService.rate(stadtId, 'TITHE', t);
		const zehnt: number = titheOn(ergebnis.produced, zehntsatz);
		const behalten: number = ergebnis.produced - zehnt;

		await baeuerin.update({ actionPoints: ergebnis.actionPoints }, { transaction: t });

		// **Vorerst in die Kammer** — siehe Punkt 72. Die Ernte auf dem Hof zu lagern, wo sie
		// gewachsen ist, war gebaut und gemessen: Nach sechshundert Ticks lagen dort 512
		// Stämme, und die Zimmerei desselben Besitzers verarbeitete keinen einzigen, weil
		// `kannHerstellen` nur ins Lager des eigenen **Betriebs** sieht. Ware am Ort ihrer
		// Entstehung braucht einen Weg von dort weg; der gehört in denselben Schritt.
		await needService.changeStock(characterId, rezept.outputItemId, behalten, t);
		await skillService.addPractice(characterId, rezept.skill, rezept.actionPointCost, t);

		if (zehnt > 0) {
			const wert: number = zehnt * (getItemTemplate(rezept.outputItemId)?.basePrice ?? 0);
			if (wert > 0) {
				await Region.increment('treasury', {
					by: wert,
					where: { id: stadtId },
					transaction: t
				});
			}
		}

		return { ok: true, produced: behalten, itemId: rezept.outputItemId, tithe: zehnt } as const;
	});
}

// --- Verarbeiten ---------------------------------------------------------------------

/**
 * In einem Betrieb aus eigenem Vorrat etwas herstellen.
 *
 * Der Betrieb muss einem gehören oder der Stadt: In einer fremden Werkstatt arbeitet man
 * nicht ungefragt. Städtische Betriebe stehen allen offen — dieselbe Rolle wie die
 * städtische Schmiede für den Neuling.
 */
/**
 * Etwas herstellen.
 *
 * `itemId` wählt das Rezept, wo ein Betrieb mehrere hat — die Alchemistenküche macht
 * Duftwasser und Stärkungstrank aus denselben Kräutern. Ohne Angabe das erste.
 */
export async function craft(
	characterId: string,
	buildingId: string,
	itemId?: string
): Promise<ProductionResult> {
	const tick: number = await worldService.currentTick();

	const gebaeude = await buildingService.getBuilding(buildingId);
	const vorlage = gebaeude ? buildingService.getBuildingOption(gebaeude.optionId) : undefined;
	const rezept: Recipe | undefined = itemId
		? vorlage?.recipes?.find((eintrag) => eintrag.outputItemId === itemId)
		: vorlage?.recipes?.[0];
	if (!gebaeude || !rezept) return { ok: false, reason: 'NOTHING_TO_DO' };

	const fremd: boolean =
		gebaeude.ownerType === 'CHARACTER' && gebaeude.ownerCharacterId !== characterId;
	if (fremd) return { ok: false, reason: 'PLOT_NOT_OWNED' };

	return sequelize.transaction(async (t: Transaction) => {
		const handwerker = await characterService.loadForAction(characterId, tick, t);
		if (!handwerker) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		// **Kammer und Betriebslager zusammen.** Wer sein Holz einlagert und dann nicht
		// sägen kann, weil die Werkstatt „nichts mehr" hat, hält das für einen Fehler — und
		// hat recht: Es liegt ja da. Verbraucht wird zuerst das Lager, dann die Kammer;
		// eingelagertes Material ist erklärtermaßen für den Betrieb bestimmt.
		const lager: Record<string, number> = {};
		for (const posten of await tradeService.getBuildingStock(buildingId)) {
			lager[posten.itemId] = posten.quantity;
		}
		const kammer: Record<string, number> = {};
		for (const posten of await needService.getStock(characterId)) {
			kammer[posten.itemId] = posten.quantity;
		}
		const vorrat: Record<string, number> = { ...kammer };
		for (const [itemId, menge] of Object.entries(lager)) {
			vorrat[itemId] = (vorrat[itemId] ?? 0) + menge;
		}

		const ergebnis = produce(
			{
				actionPoints: handwerker.dataValues.actionPoints,
				skillLevel: await skillService.getLevel(characterId, rezept.skill, t)
			},
			rezept,
			vorrat,
			gebaeude.condition,
			seasonOf(tick)
		);
		if (!ergebnis.ok) return ergebnis;

		for (const zutat of rezept.input) {
			const ausDemLager: number = Math.min(lager[zutat.itemId] ?? 0, zutat.quantity);
			if (ausDemLager > 0) {
				await tradeService.changeBuildingStock(buildingId, zutat.itemId, -ausDemLager, t);
			}
			const ausDerKammer: number = zutat.quantity - ausDemLager;
			if (ausDerKammer > 0) {
				await needService.changeStock(characterId, zutat.itemId, -ausDerKammer, t);
			}
		}
		// **Vorerst weiter in die Kammer** — siehe Punkt 72. Der Versuch, Ware am Ort ihrer
		// Entstehung zu lagern, ist richtig und war gebaut; er reißt aber zwei Löcher,
		// solange es keinen Weg zwischen zwei eigenen Häusern gibt: Die Zimmerei fand ihr
		// Holz nicht mehr, das im Hof lag, und der Hausbau fand seine Bretter nicht mehr,
		// die im Betrieb lagen. Beides gemessen. Der Umbau gehört deshalb zusammen mit dem
		// Transport gemacht und nicht davor.
		await needService.changeStock(characterId, rezept.outputItemId, ergebnis.produced, t);
		await handwerker.update({ actionPoints: ergebnis.actionPoints }, { transaction: t });
		await skillService.addPractice(characterId, rezept.skill, rezept.actionPointCost, t);

		return { ok: true, produced: ergebnis.produced, itemId: rezept.outputItemId } as const;
	});
}
