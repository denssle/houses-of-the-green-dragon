import { garmentIntact } from '$lib/game/attire.logic';
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
import * as tradeService from '$lib/server/service/tradeService';
import * as employmentService from '$lib/server/service/employmentService';
import { isWorthTaking } from '$lib/game/employment.logic';

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

/**
 * Was die staedtische Schmiede zahlt — die Messlatte, ab der sich eine feste Stelle
 * lohnt. Steht hier, weil es eine Eigenschaft der Kruecke ist und nicht der Anstellung:
 * Faellt die Schmiede weg, faellt auch diese Zahl.
 */
const TAGELOHN = 3;

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

		case 'BUY_FOOD': {
			// **Zuerst beim Nachbarn.** Das billigste Angebot in der Stadt geht dem
			// Kornspeicher vor — sonst bliebe die Krücke aus 4.6a für immer die einzige
			// Quelle, und ein Bäcker fände nie einen Kunden.
			//
			// Die Menge muss dabei **am Preis des Angebots** hängen und nicht am
			// Kornspeicherpreis: Sonst versucht ein NPC mit zwanzig Münzen fünf Laibe zu
			// sechs zu kaufen, scheitert am Geld und landet doch wieder beim Amt. Genau
			// so ist es beim ersten Durchlauf passiert.
			const angebot = lage.cheapestBread;
			if (angebot && angebot.quantity > 0 && angebot.pricePerUnit > 0) {
				const bezahlbar: number = Math.floor(lage.money / angebot.pricePerUnit);
				const wieviel: number = Math.min(5, angebot.quantity, bezahlbar);
				if (wieviel > 0) {
					const gekauft = await tradeService.buyFromOffer(npcId, angebot.id, wieviel);
					if (gekauft.ok) return 'BUY_FOOD';
				}
			}
			await needService.buyFromGranary(npcId, 'BREAD', Math.max(1, Math.min(5, lage.leisten)));
			return 'BUY_FOOD';
		}

		case 'TAKE_JOB':
			if (lage.jobId) await employmentService.takeJob(npcId, lage.jobId);
			return 'TAKE_JOB';

		case 'WORK':
			// Wer eine Stelle hat, arbeitet dort — der Ertrag geht in den Betrieb, der Lohn
			// an ihn. Nur wer keine hat, verdingt sich tageweise.
			if (lage.state.hasJob) {
				await employmentService.workForEmployer(npcId);
			} else if (lage.workplaceId) {
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

		case 'WEAR_GARMENT':
			await needService.wearGarment(npcId);
			return 'WEAR_GARMENT';

		case 'DRINK_TONIC':
			await needService.drinkTonic(npcId);
			return 'DRINK_TONIC';

		case 'BUY_GARMENT': {
			// Genau eines: Ein zweites Gewand im Schrank nützt niemandem, solange nur eines
			// getragen werden kann.
			const angebot = lage.cheapestGarment;
			if (angebot) await tradeService.buyFromOffer(npcId, angebot.id, 1);
			return 'BUY_GARMENT';
		}

		case 'BUY_TONIC': {
			const angebot = lage.cheapestTonic;
			if (angebot) await tradeService.buyFromOffer(npcId, angebot.id, 1);
			return 'BUY_TONIC';
		}

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
			jobId?: string;
			leisten: number;
			money: number;
			cheapestBread?: { id: string; quantity: number; pricePerUnit: number };
			cheapestGarment?: { id: string; quantity: number; pricePerUnit: number };
			cheapestTonic?: { id: string; quantity: number; pricePerUnit: number };
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

	// Was der Markt hergibt: Ohne Angebot kein Kauf — und ohne Kauf keine Nachfrage für
	// die Betriebe aus 4.10 und 4.11.
	const gewand = await tradeService.cheapestOffer(werte.RegionId, 'GARMENT', npcId);
	const trank = await tradeService.cheapestOffer(werte.RegionId, 'TONIC', npcId);

	const arbeitsplatz = await freierArbeitsplatz(werte.RegionId);
	const stelle = await employmentService.getJobOf(npcId);
	// Wer schon eine Stelle hat, sieht sich nicht um — ein NPC, der jede Stunde den
	// Arbeitgeber wechselt, wäre kein Handwerker, sondern ein Flattermann.
	const offen = stelle ? [] : await employmentService.getOpenJobs(werte.RegionId, npcId);
	const besser = offen.filter((angebot) => isWorthTaking(angebot.wage, TAGELOHN))[0];
	const unterkunft = werte.HomeBuildingId ? undefined : await freierWohnplatz(werte.RegionId);
	const partner = werte.spouseId ? undefined : await naechsterPartner(npc.dataValues, tick);

	return {
		leisten: Math.floor(werte.money / brot.basePrice),
		money: werte.money,
		cheapestBread: await tradeService.cheapestOffer(werte.RegionId, 'BREAD', npcId),
		workplaceId: arbeitsplatz,
		homeId: unterkunft,
		matchId: partner,
		jobId: besser?.buildingId,
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
			workAvailable: arbeitsplatz !== undefined || stelle !== undefined,
			hasJob: stelle !== undefined,
			betterJobAvailable: besser !== undefined,
			matchAvailable: partner !== undefined,
			foodPrice: brot.basePrice,
			// Was über das Nötigste hinausgeht (4.12). Ohne diese fünf Angaben kauft ein
			// NPC ausschließlich Nahrung, und jeder Beruf außer dem Bäcker bliebe ohne
			// Kundschaft.
			wearsGarment: garmentIntact(werte.wornSinceTick, tick),
			garmentInStock: menge(vorrat, 'GARMENT'),
			tonicInStock: menge(vorrat, 'TONIC'),
			garmentPrice: gewand?.pricePerUnit ?? null,
			tonicPrice: trank?.pricePerUnit ?? null
		},
		cheapestGarment: gewand,
		cheapestTonic: trank
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

/** Wie viel von einer Ware im Vorrat liegt. */
function menge(vorrat: { itemId: string; quantity: number }[], itemId: string): number {
	return vorrat.find((posten) => posten.itemId === itemId)?.quantity ?? 0;
}
