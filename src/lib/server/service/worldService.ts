import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';

/**
 * Die Weltzeit.
 *
 * Vorerst nur lesend: Wer den Tick hochzählt, entscheidet Phase 4.1 — dort entsteht der
 * Takt, der auch dann läuft, wenn niemand angemeldet ist. Bis dahin steht die Zeit
 * still, und alles, was aus ihr abgeleitet wird (Alter, Verfall, nachwachsende
 * Aktionspunkte), bleibt schlicht stehen.
 */
export async function currentTick(): Promise<number> {
	const welt = await World.findByPk(WORLD_ID);
	if (!welt) {
		throw new Error('Keine Weltzeit — der Weltaufbau ist nicht gelaufen.');
	}
	return welt.dataValues.currentTick;
}
