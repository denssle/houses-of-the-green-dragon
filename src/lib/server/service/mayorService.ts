import { Character } from '$lib/db/model/character';
import { Region } from '$lib/db/model/region';
import {
	type CityState,
	decideMayorAction,
	type MayorAction,
	NPC_MAYOR_LAW,
	nextTithe
} from '$lib/game/governance.logic';
import { CONDITION_MAX, RENOVATION_COST_PER_POINT } from '$lib/game/building.logic';
import { DEVELOPMENT_COST_PER_PLOT } from '$lib/game/auction.logic';
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
		repairCost:
			Math.ceil(CONDITION_MAX - (baufaellig?.condition ?? CONDITION_MAX)) *
			RENOVATION_COST_PER_POINT,
		missingBuildingPrice: fehlt?.price ?? null,
		landExhausted: freiesLand.length === 0,
		developmentCost: DEVELOPMENT_COST_PER_PLOT,
		tithe: await lawService.rate(regionId, 'TITHE')
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
			const ergebnis = await auctionService.developLand(inhaber.characterId, regionId, 2);
			return ergebnis.ok ? { action: entschluss, value: ergebnis.plots } : undefined;
		}

		case 'SET_TAX': {
			const neu: number | undefined = nextTithe(lage);
			if (neu === undefined) return undefined;

			const ergebnis = await lawService.enact(
				inhaber.characterId,
				regionId,
				NPC_MAYOR_LAW,
				neu,
				tick
			);
			return ergebnis.ok ? { action: entschluss, value: neu } : undefined;
		}

		case 'NOTHING':
			return undefined;
	}
}
