import { Region as RegionModel } from '$lib/db/model/region';
import { RegionLink } from '$lib/db/model/regionLink';
import type { Region } from '$lib/model/region';
import { convertToRegion } from '$lib/db/attributes/region.attributes';

export async function getRegion(regionId: string): Promise<Region | undefined> {
	const gefunden = await RegionModel.findByPk(regionId);
	return gefunden ? convertToRegion(gefunden.dataValues) : undefined;
}

/**
 * Zu welcher Stadt eine Region gehört — eine Stadt zu sich selbst.
 *
 * **Der Umlandfläche fehlte bis 5.24 die Zugehörigkeit** (Punkt 65). `seedWorld()` legt
 * Eichwald, Mühlenfeld, Erzgrube und die anderen als **eigene Regionen** an, jede mit
 * eigener Kasse — und Zehnt wie Pachtgebühr gingen dorthin. Das hatte zwei Folgen, und
 * beide waren still:
 *
 * - **Der Erlass des Bürgermeisters griff nie.** Er gilt für Grünau; nachgeschlagen wurde
 *   er in Eichwald, wo kein Erlass steht und deshalb der Rückfallwert galt. Gertrud hat
 *   den Zehnt in vier Schritten auf das Maximum gesetzt, und es war ohne jede Wirkung.
 * - **Das Geld verschwand aus dem Spiel.** Die Region „Eichwald" hat eine `treasury`, aber
 *   keinen Bürgermeister, keine Bauten und keine Ausgaben. Was dort einging, war weg.
 *
 * Die Verbindung zieht `seedWorld()` ohnehin: Jede Umlandregion hat einen `RegionLink` zu
 * genau einer Stadt. Sobald es eine zweite gibt (Punkt 31), wird daraus eine echte Frage
 * — dann entscheidet die Karte, wem ein Acker zinst. Bis dahin ist es diese eine Zeile.
 */
export async function cityOf(regionId: string): Promise<string> {
	const region = await RegionModel.findByPk(regionId);
	if (!region || region.dataValues.type === 'CITY') return regionId;

	const weg = await RegionLink.findOne({ where: { fromRegionId: regionId } });
	// Ohne Verbindung bleibt es bei der Fläche selbst: lieber eine Kasse, die niemand
	// leert, als ein Absturz beim Ernten.
	return weg?.dataValues.toRegionId ?? regionId;
}
