import * as worldService from '$lib/server/service/worldService';
import * as familyService from '$lib/server/service/familyService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as npcService from '$lib/server/service/npcService';

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
