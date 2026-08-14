import { Op } from 'sequelize';
import { Building } from '$lib/db/model/building';
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
import { GUARDHOUSE_OPTION_ID } from '$lib/server/service/hazardService';
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

	// **Nur Bauten mit Wirkung.** Ein Rathaus mehr ändert nichts; das Wachhaus senkt die
	// Gefahr (4.8), die Schule bildet aus (4.7e), die Unterkunft schafft Wohnraum.
	// Erst wenn es einen Grund gibt, gibt es einen Bau — dieselbe Regel wie bei den Waren.
	const gewuenscht: number[] = [GUARDHOUSE_OPTION_ID, 8, 3];

	for (const optionId of gewuenscht) {
		const vorlage = buildingService.getBuildingOption(optionId);
		if (!vorlage) continue;
		if (vorhanden.some((haus) => haus.optionId === optionId)) continue;

		return { optionId, price: levelOf(vorlage, 1).price, name: vorlage.initialName };
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
	const wachhaus = oeffentliche.find(
		(haus) => haus.optionId === GUARDHOUSE_OPTION_ID && haus.offeredWage === null
	);
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
		guardhouseUnpaid: wachhaus !== undefined,
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
		case 'PAY_GUARD':
			if (wachhaus) {
				await employmentService.offerJob(inhaber.characterId, wachhaus.id, TAGELOHN);
				return { action: entschluss, detail: wachhaus.name };
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

/** Nur für die Anzeige: Gibt es überhaupt ein Wachhaus ohne Wächter? */
export async function unbesetzteWache(regionId: string): Promise<boolean> {
	const wachhaeuser = (await buildingService.getBuildingsInRegion(regionId)).filter(
		(haus) => haus.optionId === GUARDHOUSE_OPTION_ID
	);
	if (wachhaeuser.length === 0) return false;

	const belegt: number = await Building.count({
		where: { id: { [Op.in]: wachhaeuser.map((haus) => haus.id) }, offeredWage: { [Op.ne]: null } }
	});
	return belegt < wachhaeuser.length;
}
