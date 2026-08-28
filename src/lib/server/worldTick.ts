import * as auctionService from '$lib/server/service/auctionService';
import * as buildingService from '$lib/server/service/buildingService';
import * as electionService from '$lib/server/service/electionService';
import * as familyService from '$lib/server/service/familyService';
import * as hazardService from '$lib/server/service/hazardService';
import * as lawService from '$lib/server/service/lawService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as mayorService from '$lib/server/service/mayorService';
import * as migrationService from '$lib/server/service/migrationService';
import * as npcService from '$lib/server/service/npcService';
import type { Arrival } from '$lib/server/service/migrationService';
import type { AuctionTick } from '$lib/server/service/auctionService';
import type { Death } from '$lib/server/service/lifecycleService';
import type { ElectionTick } from '$lib/server/service/electionService';
import type { FamilyTick } from '$lib/server/service/familyService';
import type { GovernanceReport } from '$lib/server/service/mayorService';
import type { HazardReport } from '$lib/server/service/hazardService';
import type { NpcTick } from '$lib/server/service/npcService';
import type { Stipend, TaxRun } from '$lib/server/service/lawService';
import { findStartRegionId } from '$lib/db/seed';

/**
 * **Eine Stunde in dieser Welt — an einer Stelle.**
 *
 * Was hier steht, stand bis 5.69 im Rumpf von `schlagen()` (`ticker.ts`) und war damit
 * nur von der Uhr aus erreichbar. Wer die Welt messen oder prüfen wollte, baute den Takt
 * nach — und jeder Nachbau ließ etwas anderes weg. Zuletzt waren es fünf: der Messlauf
 * und `worldComesAlive` liefen mit `actForNpcs` allein, `selfSustainingEconomy` ebenso,
 * `selfSustaining` immerhin mit Geburt, Tod und Wahl. **Keiner davon kannte die
 * Stadtkasse.**
 *
 * Was das kostet, ist gemessen (Punkt 95): Derselbe Lauf über 2000 Ticks meldet mit dem
 * NPC-Teil allein **keinen einzigen** Fehlschlag und eine Kasse bei 778 Münzen — mit dem
 * vollen Takt 4199 gescheiterte Schichten und eine Kasse, die vierzig Spieljahre lang auf
 * null steht. Ein Werkzeug, das den Normalzustand der Welt nicht kennt, misst nicht sie,
 * sondern sich selbst.
 *
 * **Es wird nichts protokolliert.** Der Takt gibt zurück, was geschehen ist; wer daraus
 * Zeilen macht, entscheidet der Aufrufer — der Server schreibt sie ins Log, der Messlauf
 * zählt sie zusammen, ein Test sieht sie sich an. Dieselbe Trennung wie bei `measure.ts`:
 * hier geschieht etwas, gedeutet wird anderswo.
 *
 * **Die Reihenfolge ist Absicht** und stammt unverändert aus `schlagen()`:
 *
 * - **Geboren wird vor dem Sterben** — sonst käme ein Kind zur Welt, dessen Mutter im
 *   selben Herzschlag schon tot ist.
 * - **Gehandelt wird vor dem Sterben** — wer noch ein Brot in der Kammer hat, soll es
 *   essen dürfen, ehe der Würfel über ihn entscheidet.
 * - **Die Steuer kommt vor dem Sold** — die Kasse füllt sich erst und zahlt dann; bei
 *   knapper Kasse fällt der Sold aus, statt Schulden zu machen.
 * - **Das Unglück kommt nach dem Handeln** — niemandem soll die Werkstatt abbrennen, in
 *   der er in derselben Stunde noch arbeiten wollte.
 */
export interface WorldTick {
	family: FamilyTick;
	npcs: NpcTick;
	arrival?: Arrival;
	election: ElectionTick;
	maintained?: { building: string; spent: number };
	escheated: number;
	auctions: AuctionTick;
	governed?: GovernanceReport;
	tax?: TaxRun;
	stipends: Stipend[];
	hazard?: HazardReport;
	deaths: Death[];
}

export interface WorldTickOptions {
	/**
	 * Der Würfel — **einer für den ganzen Takt**. Ohne ihn würfelt jede Stelle für sich
	 * mit `Math.random`, und ein Lauf ließe sich nicht wiederholen. Genau daran ist der
	 * Messlauf vor 5.64 gescheitert.
	 */
	roll?: () => number;
	/**
	 * Wie viele Ticks die Weltuhr in diesem Schlag vorgerückt ist. Zählt nur für den
	 * Zuzug (5.47): Nach einem Neustart sind es mehrere Stunden auf einmal, und ohne sie
	 * kostete jeder Deploy der Stadt Ankünfte.
	 */
	elapsedTicks?: number;
	/** Die Stadt. Wird sonst gesucht — im Messlauf ein Zugriff je Tick weniger. */
	regionId?: string;
}

export async function tickWorld(tick: number, options: WorldTickOptions = {}): Promise<WorldTick> {
	const { roll = Math.random, elapsedTicks = 1 } = options;
	const stadtId: string = options.regionId ?? (await findStartRegionId());

	const family = await familyService.advanceFamilies(tick, roll);
	const npcs = await npcService.actForNpcs(tick);
	const arrival = await migrationService.admitNewcomers(stadtId, tick, roll, elapsedTicks);

	const election = await electionService.advanceElections(stadtId, tick);
	if (election.opened) await electionService.npcsStandForElection(stadtId, tick);

	const maintained = await buildingService.maintainAsNpcMayor(stadtId);
	const escheated = await auctionService.auctionEscheatedEstates(stadtId, tick);
	const auctions = await auctionService.advanceAuctions(stadtId, tick);
	const governed = await mayorService.governAsNpcMayor(stadtId, tick);

	const tax = await lawService.collectPropertyTax(stadtId, tick);
	const stipends = await lawService.payOfficeStipends(stadtId);

	const hazard = await hazardService.strike(stadtId, tick, roll);
	const deaths = await lifecycleService.reapTheDead(tick, roll);

	return {
		family,
		npcs,
		arrival,
		election,
		maintained,
		escheated,
		auctions,
		governed,
		tax,
		stipends,
		hazard,
		deaths
	};
}
