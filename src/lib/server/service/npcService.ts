import { Op } from 'sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { decideNpcAction, type NpcAction, type NpcState } from '$lib/game/npc.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';
import { residentsAt } from '$lib/game/building.logic';
import { AGE_OF_MAJORITY, ageInYears } from '$lib/game/time';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import * as buildingService from '$lib/server/service/buildingService';
import * as characterService from '$lib/server/service/characterService';
import * as familyService from '$lib/server/service/familyService';
import * as needService from '$lib/server/service/needService';
import * as relationshipService from '$lib/server/service/relationshipService';

/**
 * NPCs handeln.
 *
 * **Sie kommen so oft zum Zug wie Spielercharaktere** — dasselbe Aktionsbudget, dieselben
 * Kosten, dieselben Regeln. Deshalb braucht es hier keine eigene Taktung: Wer nichts mehr
 * hat, tut nichts mehr, und ein Punkt je Tick ist die natürliche Bremse. Ein zweiter Satz
 * Regeln für die Simulation würde von dem der Spieler abdriften, und dann wüsste niemand
 * mehr, ob eine Beobachtung an der Welt liegt oder an zwei verschiedenen Rechnungen.
 *
 * Der Durchlauf ist die teuerste Schleife im Spiel — eine Entscheidung je NPC und
 * Herzschlag. Bei einer Stadt ist das nichts; bei zehn Städten mit tausend Einwohnern
 * gehört er gestaffelt oder auf einen eigenen Prozess. Der Punkt, an dem es weh tut,
 * liegt bei einigen tausend Einwohnern, und bis dahin ist die Einfachheit mehr wert.
 */

/** Was ein Durchlauf bewirkt hat — fürs Log und die Tests. */
export interface NpcTick {
	acted: number;
	byAction: Partial<Record<NpcAction, number>>;
}

export async function actForNpcs(tick: number): Promise<NpcTick> {
	const npcs = await Character.findAll({
		where: { deathTick: null, role: 'NPC' }
	});

	const gezaehlt: Partial<Record<NpcAction, number>> = {};
	let gehandelt = 0;

	for (const npc of npcs) {
		const handlung: NpcAction = await ausfuehren(npc.dataValues.id, tick);
		gezaehlt[handlung] = (gezaehlt[handlung] ?? 0) + 1;
		if (handlung !== 'IDLE') gehandelt++;
	}

	return { acted: gehandelt, byAction: gezaehlt };
}

/** Einen NPC entscheiden und handeln lassen. */
async function ausfuehren(npcId: string, tick: number): Promise<NpcAction> {
	const lage = await lageAufnehmen(npcId, tick);
	if (!lage) return 'IDLE';

	const handlung: NpcAction = decideNpcAction(lage.state);

	switch (handlung) {
		case 'EAT':
			await needService.eatItem(npcId, 'BREAD');
			return 'EAT';

		case 'BUY_FOOD':
			// So viel, wie die Rücklage hergibt, aber mindestens eins — ein NPC, der jede
			// Stunde einzeln zum Kornspeicher läuft, füllt das Log und sonst nichts.
			await needService.buyFromGranary(npcId, 'BREAD', Math.max(1, Math.min(5, lage.leisten)));
			return 'BUY_FOOD';

		case 'WORK':
			if (lage.workplaceId) {
				await buildingActionService.doBuildingAction('WORK', npcId, lage.workplaceId);
			}
			return 'WORK';

		case 'MOVE_IN':
			if (lage.homeId) {
				await Character.update({ HomeBuildingId: lage.homeId }, { where: { id: npcId } });
			}
			return 'MOVE_IN';

		case 'COURT':
			if (lage.matchId) {
				await familyService.courtSomeone(npcId, lage.matchId);
				// Und wenn die Zuneigung reicht, wird auch geheiratet. Der Antrag prüft das
				// selbst — ein Fehlschlag ist hier kein Fehler, sondern ein „noch nicht".
				await familyService.propose(npcId, lage.matchId);
			}
			return 'COURT';

		case 'IDLE':
			return 'IDLE';
	}
}

/** Alles, was die Entscheidung braucht — und die Ziele, die sie voraussetzt. */
async function lageAufnehmen(
	npcId: string,
	tick: number
): Promise<
	| {
			state: NpcState;
			workplaceId?: string;
			homeId?: string;
			matchId?: string;
			leisten: number;
	  }
	| undefined
> {
	// **Erst nachwachsen lassen, dann entscheiden.** Der gespeicherte Punktestand ist der
	// von der letzten Handlung; ein NPC, der seit Stunden nichts getan hat, stünde darin
	// bei null und käme nie wieder zum Zug. `getCharacter` schreibt den Zuwachs fort,
	// genau wie beim Aufruf einer Spielerseite — und das ist der Punkt: dieselbe Tür.
	const geladen = await characterService.getCharacter(npcId);
	const npc = geladen ? await Character.findByPk(npcId) : null;
	if (!npc) return undefined;

	const werte = npc.dataValues;
	const brot = getItemTemplate('BREAD')!;

	const vorrat = await needService.getStock(npcId);
	const essbar: number = vorrat
		.filter((posten) => posten.nourishment)
		.reduce((summe, posten) => summe + posten.quantity, 0);

	const arbeitsplatz = await freierArbeitsplatz(werte.RegionId);
	const unterkunft = werte.HomeBuildingId ? undefined : await freierWohnplatz(werte.RegionId);
	const partner = werte.spouseId ? undefined : await naechsterPartner(npc.dataValues, tick);

	return {
		leisten: Math.floor(werte.money / brot.basePrice),
		workplaceId: arbeitsplatz,
		homeId: unterkunft,
		matchId: partner,
		state: {
			personality: {
				courage: werte.courage,
				diligence: werte.diligence,
				greed: werte.greed,
				sociability: werte.sociability,
				ambition: werte.ambition,
				agreeableness: werte.agreeableness
			},
			actionPoints: werte.actionPoints,
			money: werte.money,
			satiety: needService.satietyOf(werte, tick),
			food: essbar,
			hasHome: werte.HomeBuildingId !== null,
			homeAvailable: unterkunft !== undefined,
			isMarried: werte.spouseId !== null,
			isAdult: ageInYears(werte.birthTick, tick) >= AGE_OF_MAJORITY,
			workAvailable: arbeitsplatz !== undefined,
			matchAvailable: partner !== undefined,
			foodPrice: brot.basePrice
		}
	};
}

/**
 * Wo man in dieser Stadt arbeiten kann.
 *
 * Genommen wird der erstbeste Betrieb — eine Wahl nach Lohn und Können wäre besser und
 * gehört zu 4.6d, wo es Anstellungsverhältnisse gibt. Bis dahin arbeitet man tageweise
 * dort, wo man gerade steht, und das gilt für NPCs wie für Spieler.
 */
async function freierArbeitsplatz(regionId: string): Promise<string | undefined> {
	for (const gebäude of await buildingService.getBuildingsInRegion(regionId)) {
		const vorlage = buildingService.getBuildingOption(gebäude.optionId);
		if (vorlage?.actions.includes('WORK')) return gebäude.id;
	}
	return undefined;
}

/** Ein Wohngebäude mit freiem Platz — die eigene Kate oder die städtische Unterkunft. */
async function freierWohnplatz(regionId: string): Promise<string | undefined> {
	const gebäude = await Building.findAll({
		include: [{ model: Plot, as: 'plot', where: { RegionId: regionId }, required: true }]
	});

	for (const eintrag of gebäude) {
		const vorlage = buildingService.getBuildingOption(eintrag.dataValues.optionId);
		if (!vorlage || residentsAt(vorlage, eintrag.dataValues.level) === 0) continue;
		// Nur was der Allgemeinheit gehört: In ein fremdes Privathaus zieht niemand
		// ungefragt ein. Miete und Untermiete kommen mit 4.6d.
		if (eintrag.dataValues.ownerType !== 'CITY') continue;

		const platz: number | null = await familyService.freierWohnraum(eintrag.dataValues.id);
		if (platz !== null && platz > 0) return eintrag.dataValues.id;
	}
	return undefined;
}

/**
 * Wen ein NPC umwirbt.
 *
 * Der, der ihn am meisten mag — und nicht der, den er am meisten mag: Wer heiratet, muss
 * gewollt sein. Dieselbe Richtung wie bei der Eheprüfung in 4.4.
 */
async function naechsterPartner(
	werte: { id: string; gender: string; RegionId: string; birthTick: number },
	tick: number
): Promise<string | undefined> {
	const kandidaten = await Character.findAll({
		where: {
			deathTick: null,
			RegionId: werte.RegionId,
			spouseId: null,
			gender: { [Op.ne]: werte.gender },
			id: { [Op.ne]: werte.id },
			birthTick: { [Op.lte]: tick - AGE_OF_MAJORITY * 50 }
		}
	});

	let bester: string | undefined;
	let höchste = -Infinity;
	for (const kandidat of kandidaten) {
		const stand = await relationshipService.getAffection(kandidat.dataValues.id, werte.id, tick);
		// Verwandte scheiden aus, bevor überhaupt geworben wird — sonst verbrauchte ein
		// NPC seine Punkte an einer Ehe, die die Prüfung ohnehin abweist.
		if (stand.kinship !== 'NONE') continue;

		if (stand.affection > höchste) {
			höchste = stand.affection;
			bester = kandidat.dataValues.id;
		}
	}
	return bester;
}
