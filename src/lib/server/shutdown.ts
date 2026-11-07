import { sequelize } from '$lib/db/sequelize';
import { stopTicker } from '$lib/server/ticker';

/**
 * Wie lange das Aufräumen dauern darf, bevor der Prozess trotzdem geht. Großzügig, weil
 * ein laufender Takt fertig werden soll — aber endlich: Ein Herunterfahren, das hängt,
 * wäre wieder ein Prozess, der läuft und nichts mehr bedient.
 */
const NOTAUSGANG_MS = 60 * 1000;

interface Schritte {
	stopTicker: () => Promise<void>;
	closeDatabase: () => Promise<void>;
	exit: (code: number) => void;
}

const echteSchritte: Schritte = {
	stopTicker,
	closeDatabase: () => sequelize.close(),
	exit: (code) => process.exit(code)
};

/**
 * Bringt zu Ende, was adapter-node anfängt (0.6.4).
 *
 * Bei SIGTERM und SIGINT schließt adapter-node den HTTP-Server, ruft aber kein
 * `process.exit()`: Der Prozess soll enden, sobald die Event-Loop leer ist. Unsere leert
 * sich nie, denn der Takt hält sie mit seinem Intervall am Leben. Bis 0.6.3 blieb nach
 * einem Signal deshalb ein Prozess zurück, der die Welt weiterrechnete und auf keinem Port
 * mehr lauschte — für den Supervisor RUNNING, für den Webserver 502. So lag das Spiel bis
 * zum 07.11.2026 still, vermutlich seit dem 22.10., und nichts fiel auf.
 *
 * Darum gilt: **Ist der HTTP-Server zu, geht der ganze Prozess.** Der Supervisor startet
 * ihn neu, und ein Dienst läuft entweder ganz oder gar nicht.
 */
export async function herunterfahren(
	grund: string,
	schritte: Schritte = echteSchritte
): Promise<void> {
	console.info(`${new Date().toISOString()} HTTP-Server geschlossen (${grund}), Prozess endet.`);

	const notausgang = setTimeout(() => {
		console.error('Das Aufräumen hängt — der Prozess endet trotzdem.');
		schritte.exit(1);
	}, NOTAUSGANG_MS);

	let code = 0;
	try {
		await schritte.stopTicker();
		await schritte.closeDatabase();
	} catch (error) {
		console.error('Das Aufräumen ist gescheitert:', error);
		code = 1;
	}

	clearTimeout(notausgang);
	schritte.exit(code);
}

let angemeldet = false;

/** Gibt das Ereignis nur im gebauten Server; der Dev-Server sendet es nie. */
export function endenWennHttpEndet(): void {
	if (angemeldet) return;
	angemeldet = true;

	process.once('sveltekit:shutdown', (grund: string) => {
		void herunterfahren(grund);
	});
}
