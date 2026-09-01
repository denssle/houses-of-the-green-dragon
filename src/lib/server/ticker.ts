import * as worldService from '$lib/server/service/worldService';
import { tickWorld, type WorldTick } from '$lib/server/worldTick';
import { OFFICE_NAMES } from '$lib/game/election.logic';

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

		// **Genau ein Wurf je Herzschlag**, auch wenn die Uhr gerade über eine Ausfallzeit
		// gesprungen ist: Die übersprungenen Ticks haben für alles Handelnde nicht
		// stattgefunden, und dazu gehört das Sterben. Sonst raffte ein Wochenendausfall
		// beim Neustart eine halbe Generation dahin — für Spieler, die nicht zusehen
		// konnten. Nur der Zuzug zählt die verstrichene Zeit mit (5.47), und deshalb
		// bekommt der Takt sie mitgegeben.
		const stunde = await tickWorld(geschehen.currentTick, { elapsedTicks: geschehen.ticks });

		// **Und was in dieser Stunde geschehen ist, kommt ins Log.** Das Erzählen gehört
		// hierher und nicht in den Takt (5.69): Derselbe Takt läuft im Messlauf und in den
		// Tests, und dort wäre jede dieser Zeilen Lärm.
		berichten(stunde);
	} catch (error) {
		// Ein gescheiterter Takt darf den Server nicht mitnehmen: Der nächste Durchlauf
		// holt dieselbe Zeit nach, weil sich alles aus `lastTickAt` ergibt und nicht aus
		// der Zahl der Versuche.
		console.error('Die Weltzeit ließ sich nicht weiterstellen:', error);
	}
}

/** Eine Stunde Grünau, in Zeilen. */
function berichten(stunde: WorldTick): void {
	for (const geburt of stunde.family.births) {
		console.info(`${geburt.name} ist zur Welt gekommen.`);
	}

	if (stunde.npcs.acted > 0) {
		console.info(`${stunde.npcs.acted} Einwohner haben gehandelt:`, stunde.npcs.byAction);
	}

	// **Und warum die übrigen nichts getan haben** (5.62).
	//
	// `idleReason` beantwortet das seit 4.17 je NPC und Tick, `actForNpcs` zählt es mit —
	// und der Ticker warf es weg. Auf dem laufenden Server stand deshalb nur eine große
	// Zahl neben `IDLE`, und ob dahinter Zufriedenheit steckte, ein leerer Aktionsvorrat
	// oder ein Vorhaben, das niemand je erreichen kann, war von außen nicht zu
	// unterscheiden.
	if (Object.keys(stunde.npcs.byIdleReason).length > 0) {
		console.info('Warum die anderen nichts taten:', stunde.npcs.byIdleReason);
	}

	// Was ein NPC beschlossen hat und dann doch nicht konnte. Meist leer — und wenn nicht,
	// ist es der interessanteste Teil des Protokolls: Ein Entschluss, der jeden Tick aufs
	// Neue scheitert, ist eine Schleife, die niemand sieht.
	if (Object.keys(stunde.npcs.byFailure).length > 0) {
		console.warn('Woran es scheiterte:', stunde.npcs.byFailure);
	}

	if (stunde.arrival) {
		console.info(
			`${stunde.arrival.name} ${stunde.arrival.house} ist angekommen — ` +
				`${stunde.arrival.skill}, ${stunde.arrival.money} Muenzen.`
		);
	}

	if (stunde.election.opened) console.info('Eine Wahl ist ausgerufen.');
	if (stunde.election.closed) {
		console.info(
			`Wahl ausgezaehlt: ${stunde.election.closed.votes} Stimmen auf ` +
				`${stunde.election.closed.candidates} Kandidaten.`
		);
	}

	if (stunde.maintained) {
		console.info(
			`Der Buergermeister liess ${stunde.maintained.building} herrichten ` +
				`(${stunde.maintained.spent} Muenzen).`
		);
	}

	if (stunde.escheated > 0) {
		console.info(`${stunde.escheated} heimgefallene Anwesen sind ausgeboten.`);
	}

	if (stunde.auctions.closed > 0) {
		console.info(
			`${stunde.auctions.closed} Versteigerungen beendet, ${stunde.auctions.awarded} mit Zuschlag.`
		);
	}

	if (stunde.governed) {
		console.info(
			`Amtshandlung: ${stunde.governed.action}` +
				(stunde.governed.detail ? ` (${stunde.governed.detail})` : '') +
				(stunde.governed.value !== undefined ? ` — ${stunde.governed.value}` : '')
		);
	}

	if (stunde.tax) {
		console.info(
			`Grundsteuer: ${stunde.tax.collected} Muenzen von ${stunde.tax.payers} Besitzern` +
				(stunde.tax.shortfall > 0 ? `, ${stunde.tax.shortfall} nicht eintreibbar.` : '.')
		);
	}

	for (const sold of stunde.stipends) {
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

	if (stunde.hazard) {
		console.info(`Brand in ${stunde.hazard.what} — Zustand um ${stunde.hazard.value} gefallen.`);
	}

	for (const fall of stunde.deaths) {
		console.info(
			`${fall.name} ist mit ${fall.age} Jahren ` +
				`${fall.cause === 'HUNGER' ? 'an Entkräftung gestorben' : 'gestorben'}` +
				(fall.extinctDynastyId
					? ' — ohne Erben. Das Haus ist erloschen.'
					: fall.heirId
						? `. Erbe: ${fall.heirId}.`
						: '.')
		);
	}
}
