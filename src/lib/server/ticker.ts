import * as worldService from '$lib/server/service/worldService';
import * as familyService from '$lib/server/service/familyService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as auctionService from '$lib/server/service/auctionService';
import * as buildingService from '$lib/server/service/buildingService';
import * as electionService from '$lib/server/service/electionService';
import * as hazardService from '$lib/server/service/hazardService';
import * as lawService from '$lib/server/service/lawService';
import * as mayorService from '$lib/server/service/mayorService';
import * as migrationService from '$lib/server/service/migrationService';
import * as npcService from '$lib/server/service/npcService';
import { OFFICE_NAMES } from '$lib/game/election.logic';
import { findStartRegionId } from '$lib/db/seed';

/**
 * Der Herzschlag der Welt.
 *
 * Ein Intervall im Serverprozess, kein Cron: Auf dem Uberspace läuft die App als **ein**
 * Node-Prozess, damit ist das der kürzeste Weg. Ein Cron gegen einen geschützten Endpunkt
 * wäre robuster, weil er einen hängenden Prozess sichtbar macht — das lohnt sich, sobald
 * die Welt echte Spieler hat und ein stehengebliebener Takt auffiele. Bis dahin gilt:
 * Fällt der Prozess aus, fällt der Takt mit ihm, und die verpasste Zeit wird beim
 * nächsten Start übersprungen.
 *
 * **Nachgesehen wird jede Minute, weitergestellt wird stündlich.** Der Takt selbst muss
 * nicht genau sein: `advanceWorld()` rechnet aus der vergangenen Echtzeit, wie viele
 * Ticks fällig sind, und verschiebt den Ankerpunkt um genau diese — nicht auf „jetzt“.
 * Ein Intervall, das ein paar Sekunden nachgeht, summiert sich damit nicht auf.
 */
const NACHSEHEN_ALLE_MS = 60 * 1000;

let laufend: NodeJS.Timeout | undefined;

export function startTicker(): void {
	// Der Dev-Server lädt Servermodule bei Änderungen neu; ohne diese Sperre liefen
	// mehrere Intervalle nebeneinander und die Welt bekäme mehrere Herzschläge.
	if (laufend) return;

	laufend = setInterval(() => {
		void schlagen();
	}, NACHSEHEN_ALLE_MS);

	// Beim Start einmal sofort: Nach einem Neustart soll die Uhr nicht erst eine Minute
	// falsch gehen.
	void schlagen();
}

export function stopTicker(): void {
	if (!laufend) return;
	clearInterval(laufend);
	laufend = undefined;
}

async function schlagen(): Promise<void> {
	try {
		const geschehen = await worldService.advanceWorld();
		if (!geschehen) return;

		if (geschehen.missed > 0) {
			console.info(
				`Weltzeit um ${geschehen.ticks} Ticks vorgestellt, davon ${geschehen.missed} verpasst ` +
					'(Serverausfall) — für die übersprungene Zeit wächst nichts nach.'
			);
		}

		// Genau **ein** Wurf je Herzschlag, auch wenn die Uhr gerade über eine Ausfallzeit
		// gesprungen ist: Die übersprungenen Ticks haben für alles Handelnde nicht
		// stattgefunden, und dazu gehört das Sterben. Sonst raffte ein Wochenendausfall
		// beim Neustart eine halbe Generation dahin — für Spieler, die nicht zusehen
		// konnten.
		// Erst geboren werden, dann sterben. Andersherum käme ein Kind zur Welt, dessen
		// Mutter im selben Herzschlag schon tot ist — möglich in der Wirklichkeit, aber
		// hier nur verwirrend, weil beides im selben Log stünde.
		const familie = await familyService.advanceFamilies(geschehen.currentTick);
		for (const geburt of familie.births) {
			console.info(`${geburt.name} ist zur Welt gekommen.`);
		}

		// Handeln vor dem Sterben: Wer noch ein Brot in der Kammer hat, soll es essen
		// duerfen, bevor der Wuerfel ueber ihn entscheidet. Andersherum verhungerten
		// Leute mit vollem Vorrat.
		const npcs = await npcService.actForNpcs(geschehen.currentTick);
		if (npcs.acted > 0) {
			console.info(`${npcs.acted} Einwohner haben gehandelt:`, npcs.byAction);
		}

		const stadtId: string = await findStartRegionId();

		// **Wer von auswaerts kommt** (5.24, Punkt 71). Im Mittel einer alle zwei
		// Spieljahre, und nur solange ein Bett frei ist — wer ankommt und nichts findet,
		// zieht weiter. Er bringt ein Handwerk mit, das der Stadt fehlt, und das Geld, das
		// er anderswo verdient hat.
		const zugezogen = await migrationService.admitNewcomers(stadtId, geschehen.currentTick);
		if (zugezogen) {
			console.info(
				`${zugezogen.name} ${zugezogen.house} ist angekommen — ` +
					`${zugezogen.skill}, ${zugezogen.money} Muenzen.`
			);
		}

		// Politik: eine Wahl ausrufen oder auszaehlen. Passiert alle fuenf Spieljahre und
		// ist deshalb billig, auch wenn es hier in der Schleife steht.
		const wahl = await electionService.advanceElections(stadtId, geschehen.currentTick);
		if (wahl.opened) {
			console.info('Eine Wahl ist ausgerufen.');
			await electionService.npcsStandForElection(stadtId, geschehen.currentTick);
		}
		if (wahl.closed) {
			console.info(
				`Wahl ausgezaehlt: ${wahl.closed.votes} Stimmen auf ${wahl.closed.candidates} Kandidaten.`
			);
		}

		// Ein NPC im Amt laesst herrichten, was verfaellt. Ohne das verrottete jede Stadt,
		// in der gerade kein Spieler regiert — und das ist der Normalfall.
		const gepflegt = await buildingService.maintainAsNpcMayor(stadtId);
		if (gepflegt) {
			console.info(
				`Der Buergermeister liess ${gepflegt.building} herrichten (${gepflegt.spent} Muenzen).`
			);
		}

		// Was der Stadt aus erbenlosen Nachlaessen zugefallen ist, kommt unter den Hammer
		// (Punkt 79) — im Takt und nicht als Amtshandlung: „So bald wie moeglich" darf nicht
		// daran haengen, dass gerade jemand im Amt ist.
		const heimgefallen = await auctionService.auctionEscheatedEstates(
			stadtId,
			geschehen.currentTick
		);
		if (heimgefallen > 0) {
			console.info(`${heimgefallen} heimgefallene Anwesen sind ausgeboten.`);
		}

		// Faellige Versteigerungen zuschlagen. Wie die Wahl selten und deshalb billig.
		const auktionen = await auctionService.advanceAuctions(stadtId, geschehen.currentTick);
		if (auktionen.closed > 0) {
			console.info(
				`${auktionen.closed} Versteigerungen beendet, ${auktionen.awarded} mit Zuschlag.`
			);
		}

		// Und er fuehrt sein Amt: Wache bezahlen, bauen, Land ausweisen, Steuern setzen.
		// Hoechstens eine Handlung je Tick — ein Buergermeister, der in derselben Stunde
		// alles taete, waere kein Amtsinhaber, sondern ein Automat.
		const regiert = await mayorService.governAsNpcMayor(stadtId, geschehen.currentTick);
		if (regiert) {
			console.info(
				`Amtshandlung: ${regiert.action}` +
					(regiert.detail ? ` (${regiert.detail})` : '') +
					(regiert.value !== undefined ? ` — ${regiert.value}` : '')
			);
		}

		// Die Grundsteuer ist die einzige Abgabe, die an der Zeit haengt statt an einer
		// Handlung — deshalb braucht sie als einzige einen Durchlauf. Einmal im Spieljahr.
		const steuer = await lawService.collectPropertyTax(stadtId, geschehen.currentTick);
		if (steuer) {
			console.info(
				`Grundsteuer: ${steuer.collected} Muenzen von ${steuer.payers} Besitzern` +
					(steuer.shortfall > 0 ? `, ${steuer.shortfall} nicht eintreibbar.` : '.')
			);
		}

		// Und was die Stadt ihrerseits schuldet: den Sold ihrer Amtsinhaber. Nach der
		// Steuer, weil sich die Kasse erst fuellt und dann zahlt — bei knapper Kasse faellt
		// er aus, statt Schulden zu machen.
		for (const sold of await lawService.payOfficeStipends(stadtId)) {
			if (sold.paid > 0) {
				console.info(
					`${OFFICE_NAMES[sold.office]} ${sold.name}: ${sold.paid} Muenzen Aufwandsentschaedigung` +
						(sold.shortfall > 0 ? ` (${sold.shortfall} blieb die Kasse schuldig).` : '.')
				);
			} else {
				console.info(
					`Die Stadtkasse konnte ${OFFICE_NAMES[sold.office]} ${sold.name} nicht bezahlen.`
				);
			}
		}

		// Unglueck: hoechstens eins je Herzschlag. Vor dem Sterben, damit ein Brand noch in
		// die Chronik kommt, ehe sein Opfer stirbt — und nach dem Handeln, damit niemandem
		// die Werkstatt abbrennt, in der er in derselben Stunde noch arbeiten wollte.
		const unglueck = await hazardService.strike(stadtId, geschehen.currentTick);
		if (unglueck) {
			console.info(`Brand in ${unglueck.what} — Zustand um ${unglueck.value} gefallen.`);
		}

		for (const fall of await lifecycleService.reapTheDead(geschehen.currentTick)) {
			console.info(
				`${fall.name} ist mit ${fall.age} Jahren gestorben` +
					(fall.extinctDynastyId
						? ' — ohne Erben. Das Haus ist erloschen.'
						: fall.heirId
							? `. Erbe: ${fall.heirId}.`
							: '.')
			);
		}
	} catch (error) {
		// Ein gescheiterter Takt darf den Server nicht mitnehmen: Der nächste Durchlauf
		// holt dieselbe Zeit nach, weil sich alles aus `lastTickAt` ergibt und nicht aus
		// der Zahl der Versuche.
		console.error('Die Weltzeit ließ sich nicht weiterstellen:', error);
	}
}
