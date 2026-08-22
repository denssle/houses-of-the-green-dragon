import { base } from '$app/paths';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import * as dynastyService from '$lib/server/service/dynastyService';
import * as familyService from '$lib/server/service/familyService';
import * as userService from '$lib/server/service/userService';
import * as worldService from '$lib/server/service/worldService';

/**
 * Ein fremdes Haus (5.46, Punkt 81).
 *
 * **Bis hierher hatte nur das eigene eine Adresse.** Auf der Seite eines Charakters stand
 * „aus dem Haus Müller", ohne Weg dorthin — `/dynasty` lädt über `locals.currentUser` und
 * zeigt deshalb immer das eigene. Ein Name ohne Adresse ist eine Sackgasse; wer zu einer
 * Familie gehört, soll nachschlagen können, zu welcher.
 *
 * **Was hier steht, ist nichts Vertrauliches** (entschieden am 22.08.2026): wer das Haus
 * gegründet hat und wer dazugehört. Beides steht ohnehin in der Chronik. Besitz und
 * Vermögen stehen **nicht** hier — dafür gibt es die Häuserliste der Stadt, und spätestens
 * mit Punkt 23 (Räuber als Beruf) wäre eine Vermögensübersicht fremder Familien eine
 * Einladung.
 *
 * Das eigene Haus wird weitergereicht: Dort gibt es Gründung, Nachfolge und die
 * Ahnengalerie, und die gehören dem Spieler und nicht dem Haus.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const haus = await dynastyService.getDynasty(params.dynasty_id);
	if (!haus) {
		error(404, 'Not Found');
	}

	const eigenes = locals.currentUser
		? await dynastyService.getDynastyForUser(locals.currentUser.id)
		: undefined;
	if (eigenes?.id === haus.id) {
		redirect(303, `${base}/dynasty`);
	}

	return {
		dynasty: haus,
		// Ein Haus ohne Gründer ist der Normalfall, sobald es NPC-Familien sind (5.10) —
		// und bei gelöschten Konten bleibt der Name, aber niemand steht mehr dahinter.
		founder: haus.foundedBy ? await userService.getUser(haus.foundedBy) : undefined,
		tree: await familyService.getFamilyTree(haus.id, await worldService.currentTick())
	};
};
