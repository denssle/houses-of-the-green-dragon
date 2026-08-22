import { base } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Die alte Adresse der Kammer (5.45).
 *
 * **Der persönliche Vorrat heißt jetzt Inventar**, und mit dem Namen ist die Seite
 * umgezogen. Wer `/chamber` als Lesezeichen hat oder aus einem alten Link kommt, soll
 * nicht auf eine Fehlerseite laufen — ein Umzug ohne Nachsendeauftrag ist eine gebrochene
 * Zusage, und die Adresse steht seit 5.33 in der Welt.
 *
 * `308` und nicht `302`: Die Verschiebung ist dauerhaft, und Browser dürfen sie sich
 * merken.
 */
export const load: PageServerLoad = () => {
	redirect(308, `${base}/inventory`);
};
