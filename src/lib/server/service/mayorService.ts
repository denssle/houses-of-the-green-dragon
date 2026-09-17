import { Character } from '$lib/db/model/character';
import { Lease } from '$lib/db/model/lease';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import {
	type CityState,
	decideMayorAction,
	type MayorAction,
	NPC_MAYOR_LAWS,
	nextTaxChange,
	type NpcMayorLaw
} from '$lib/game/governance.logic';
import { LAW_RULES } from '$lib/game/law.logic';
import { DEVELOPMENT_COST_PER_PLOT } from '$lib/game/auction.logic';

/**
 * Wie viele Grundstücke der Amtsinhaber auf einmal erschließen lässt.
 *
 * **Die Zahl steht hier einmal, weil sie zweimal gebraucht wird**: in der Lage, aus der
 * `decideMayorAction()` entscheidet, und in der Amtshandlung, die zahlt. Bis 5.90 stand
 * in der Lage der Preis für *ein* Grundstück, erschlossen wurden aber zwei — der
 * Bürgermeister beschloss die Erschließung also zum halben Preis und unterschritt danach
 * die Rücklage, die Löhne und Instandhaltung sichern soll. Bei einer Kasse von 180 blieben
 * 60 statt der vorgesehenen 120.
 */
const GRUNDSTUECKE_JE_ERSCHLIESSUNG = 2;
import { levelOf } from '$lib/model/buildingTemplate';
import * as auctionService from '$lib/server/service/auctionService';
import * as buildingService from '$lib/server/service/buildingService';
import * as electionService from '$lib/server/service/electionService';
import * as employmentService from '$lib/server/service/employmentService';
import * as lawService from '$lib/server/service/lawService';
import { MAYOR_MAINTAINS_BELOW } from '$lib/server/service/buildingService';
import { TAGELOHN } from '$lib/game/economy';

/**
 * Der Bürgermeister im Amt — sofern ein NPC es innehat.
 *
 * **Ohne das ist ein NPC im Amt eine Kulisse.** Er richtete zwar seit 4.7c öffentliche
 * Bauten her, aber erließ kein Gesetz, wies kein Bauland aus und bezahlte keine Wache:
 * Unter ihm wuchs die Stadt nur, soweit sie ohnehin wuchs. Ein Amt, das nichts tut, ist
 * kein Amt — und für Spieler wäre es kein Ziel, es ihm abzunehmen.
 *
 * Ein **Spieler** im Amt bekommt diese Hilfe nicht. Er soll selbst entscheiden; sonst
 * wäre jede Amtshandlung eine Schaltfläche, die erledigt, was ohnehin geschieht.
 */

export interface GovernanceReport {
	action: MayorAction;
	detail?: string;
	value?: number;
}

/** Welche öffentlichen Bauten heute schon etwas bewirken — und was sie kosten. */
async function fehlenderBau(
	regionId: string
): Promise<{ optionId: number; price: number; name: string } | undefined> {
	const vorhanden = await buildingService.getBuildingsInRegion(regionId);

	// **Nur Bauten mit Wirkung.** Ein Rathaus mehr ändert nichts; die Schule bildet aus
	// (4.7e), die Unterkunft schafft Wohnraum. Erst wenn es einen Grund gibt, gibt es einen
	// Bau — dieselbe Regel wie bei den Waren.
	//
	// **Das Wachhaus stand hier an erster Stelle und ist mit 5.40 herausgefallen**, weil es
	// seit dem Ende der Raubzüge nichts mehr bewirkt. Es bleibt baubar — ein Bürgermeister
	// darf eine Wache aufstellen —, aber ein NPC soll nicht länger auf ein Haus sparen, das
	// keine Aufgabe hat. Mit den überarbeiteten Räubern kommt es zurück.
	const gewuenscht: number[] = [8, 3];

	for (const optionId of gewuenscht) {
		const vorlage = buildingService.getBuildingOption(optionId);
		if (!vorlage) continue;
		if (vorhanden.some((haus) => haus.optionId === optionId)) continue;

		return { optionId, price: levelOf(vorlage, 1).price, name: vorlage.initialName };
	}
	return undefined;
}

/**
 * Das erste Haus der Stadt, in dem eine Stelle offensteht, für die kein Sold aushängt.
 *
 * **Jedes Haus, nicht nur das Wachhaus.** Bis 5.14 suchte der Bürgermeister allein nach
 * dem Wachhaus — mit der Folge, dass die städtische Schmiede aus `seed.ts` per
 * Konstruktion nie einen Schmied bekam: Ohne Aushang findet keine Bewerbung statt, und
 * einen Aushang setzte niemand. In der Welt auf dem Server stand sie so 97 Spieljahre
 * leer.
 *
 * Wonach die Stellen zählen, entscheidet `positionsAt` und damit die Vorlage: Ein
 * Rathaus hat keinen Lohn und kein Rezept, also auch keine Stelle. Es fällt von selbst
 * heraus, ohne dass hier eine Liste von Gebäudearten gepflegt werden müsste.
 *
 * Die Reihenfolge ist die der Häuser, wie sie stehen. Eine Rangfolge — erst die Wache,
 * dann das Handwerk — wäre eine zweite Meinung darüber, was der Stadt wichtiger ist;
 * dafür gibt es bisher keinen Grund, und ein Tick später ist ohnehin das nächste dran.
 */
async function offeneStelle(
	haeuser: {
		id: string;
		optionId: number;
		level: number;
		offeredWage: number | null;
		name: string;
	}[]
): Promise<{ id: string; name: string } | undefined> {
	for (const haus of haeuser) {
		if (await employmentService.hasUnofferedPosition(haus)) return haus;
	}
	return undefined;
}

/**
 * Ein Herzschlag Amtsführung.
 *
 * Wird vom Takt gerufen, gleich nach der Instandhaltung. Höchstens **eine** Handlung je
 * Tick: Ein Bürgermeister, der in derselben Stunde die Steuern erhöht, ein Wachhaus baut
 * und Land erschließt, wäre kein Amtsinhaber, sondern ein Automat.
 */
export async function governAsNpcMayor(
	regionId: string,
	tick: number
): Promise<GovernanceReport | undefined> {
	const inhaber = await electionService.getHolder(regionId);
	if (!inhaber) return undefined;

	const amtsperson = await Character.findByPk(inhaber.characterId);
	if (!amtsperson || amtsperson.dataValues.role !== 'NPC') return undefined;

	const stadt = await Region.findByPk(regionId);
	const kasse: number = stadt?.dataValues.treasury ?? 0;

	const oeffentliche = await buildingService.getPublicBuildings(regionId);
	const baufaellig = oeffentliche
		.filter((haus) => haus.condition < MAYOR_MAINTAINS_BELOW)
		.sort((a, b) => a.condition - b.condition)[0];
	const unbesetzt = await offeneStelle(oeffentliche);
	const fehlt = await fehlenderBau(regionId);
	const freiesLand = await buildingService.getFreeCityPlots(regionId);

	const lage: CityState = {
		personality: {
			courage: amtsperson.dataValues.courage,
			diligence: amtsperson.dataValues.diligence,
			greed: amtsperson.dataValues.greed,
			sociability: amtsperson.dataValues.sociability,
			ambition: amtsperson.dataValues.ambition,
			agreeableness: amtsperson.dataValues.agreeableness
		},
		treasury: kasse,
		unstaffedWorkplace: unbesetzt !== undefined,
		repairNeeded: baufaellig !== undefined,
		// **Instandsetzen kostet die Kasse nichts mehr** (5.78): Der Amtsinhaber legt seine
		// eigenen Aktionspunkte hinein. Die Null steht hier, damit `chooseMayorAction` das
		// Herrichten auch bei leerer Kasse wählt — vorher war es die erste Amtshandlung,
		// die ausfiel, wenn kein Geld da war, und ausgerechnet dann ist sie am nötigsten.
		repairCost: 0,
		missingBuildingPrice: fehlt?.price ?? null,
		landExhausted: freiesLand.length === 0,
		developmentCost: DEVELOPMENT_COST_PER_PLOT * GRUNDSTUECKE_JE_ERSCHLIESSUNG,
		rates: await saetze(regionId),
		taxBase: await bemessungsgrundlage(regionId),
		rateAgeInTicks: await satzalter(regionId, tick)
	};

	const entschluss: MayorAction = decideMayorAction(lage);

	switch (entschluss) {
		case 'PAY_WAGE':
			if (unbesetzt) {
				await employmentService.offerJob(inhaber.characterId, unbesetzt.id, TAGELOHN);
				return { action: entschluss, detail: unbesetzt.name, value: TAGELOHN };
			}
			return undefined;

		case 'REPAIR': {
			if (!baufaellig) return undefined;
			const ergebnis = await buildingService.renovatePublicBuilding(
				inhaber.characterId,
				baufaellig.id
			);
			return ergebnis.ok
				? { action: entschluss, detail: baufaellig.name, value: ergebnis.spent }
				: undefined;
		}

		case 'BUILD_PUBLIC': {
			if (!fehlt) return undefined;
			// Auf städtischem oder herrenlosem Grund — dieselbe Regel wie beim Spieler im
			// Amt (4.7c).
			const platz = freiesLand[0];
			if (!platz) return undefined;

			const ergebnis = await buildingService.buildPublicBuilding(
				inhaber.characterId,
				fehlt.optionId,
				platz.id
			);
			return ergebnis.ok
				? { action: entschluss, detail: fehlt.name, value: fehlt.price }
				: undefined;
		}

		case 'DEVELOP_LAND': {
			const ergebnis = await auctionService.developLand(
				inhaber.characterId,
				regionId,
				GRUNDSTUECKE_JE_ERSCHLIESSUNG
			);
			return ergebnis.ok ? { action: entschluss, value: ergebnis.plots } : undefined;
		}

		case 'SET_TAX': {
			const aenderung = nextTaxChange(lage);
			if (!aenderung) return undefined;

			const ergebnis = await lawService.enact(
				inhaber.characterId,
				regionId,
				aenderung.kind,
				aenderung.value,
				tick
			);
			// **Welche Steuer**, nicht nur welche Zahl: „Steuer auf 3" sagt im Log nichts,
			// solange es zwei gibt, an denen gedreht werden kann.
			return ergebnis.ok
				? { action: entschluss, detail: LAW_RULES[aenderung.kind].name, value: aenderung.value }
				: undefined;
		}

		case 'NOTHING':
			return undefined;
	}
}

/** Was gerade gilt — nur die Steuern, an denen ein Amtsinhaber drehen darf. */
async function saetze(regionId: string): Promise<Record<NpcMayorLaw, number>> {
	const alle = await lawService.rates(regionId);
	return Object.fromEntries(NPC_MAYOR_LAWS.map((kind) => [kind, alle[kind]])) as Record<
		NpcMayorLaw,
		number
	>;
}

/**
 * Seit wann der geltende Satz gilt — je Steuer, in Ticks.
 *
 * Damit eine Erhöhung wirken darf, ehe die nächste kommt (`TAX_EFFECT_DELAY`).
 */
async function satzalter(regionId: string, tick: number): Promise<Record<NpcMayorLaw, number>> {
	const alter = await Promise.all(
		NPC_MAYOR_LAWS.map(async (kind) => [kind, await lawService.rateAge(regionId, kind, tick)])
	);
	return Object.fromEntries(alter) as Record<NpcMayorLaw, number>;
}

/**
 * Wen eine Steuer überhaupt erreichte.
 *
 * Die Grundsteuer zählt Grundstücke in Bürgerhand — dieselbe Menge, die
 * `collectPropertyTax` einzieht. Der Zehnt zählt laufende Pachten; er greift auf die
 * Ernte, und wo niemand pachtet, bringt er nichts.
 *
 * **Pachten werden weltweit gezählt**, nicht je Stadt: Die Abbauflächen im Umland hängen
 * heute an keiner Stadt (`getAreas` nimmt sie ebenso alle), und solange es eine gibt, ist
 * das dieselbe Zahl. Mit der zweiten Stadt (Punkt 31) gehört beides zusammen angefasst.
 */
async function bemessungsgrundlage(regionId: string): Promise<Record<NpcMayorLaw, number>> {
	return {
		PROPERTY_TAX: await Plot.count({ where: { RegionId: regionId, ownerType: 'CHARACTER' } }),
		TITHE: await Lease.count()
	};
}
