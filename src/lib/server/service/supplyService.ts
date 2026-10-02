import { Op } from 'sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import type { Building as Haus } from '$lib/model/building';
import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import { getItemTemplate } from '$lib/model/itemTemplate';
import { supplyNeeded } from '$lib/game/need.logic';

/**
 * Was die Stadt hat, gemessen an dem, was sie braucht.
 *
 * Herausgelöst aus `npcService` (5.97), weil inzwischen zwei fragen: die Werkstattwahl
 * (baut einer die zweite Bäckerei?) und die Versteigerung (wie viel ist einem eine
 * heimgefallene Bäckerei wert?). Beide sollen dieselbe Antwort bekommen — und keiner von
 * beiden soll den anderen dafür importieren müssen.
 */

/**
 * Welche Handwerke die Stadt nicht satt bekommen — die Nachfrageseite der Werkstattwahl.
 *
 * **Knappheit statt Gedächtnis** (5.95, Punkt 89). Zur Wahl stand, was nicht zustande kam
 * mitzuschreiben — wer wollte kaufen und fand nichts (Punkt 90). Das wäre die ehrlichere
 * Größe und kostet eine Tabelle, die Neustarts überleben muss. Hier steht die andere:
 * **Was liegt da, gemessen an dem, was die Stadt isst?** Beides ist vorhanden — Einwohner
 * und Warenbestand —, und die Rechnung dahinter ist so alt wie die Sättigung: ein Laib
 * alle vierzig Ticks und Kopf (`supplyNeeded`).
 *
 * **Gezählt wird, was zu haben ist**: Preisschilder und Betriebslager zusammen. Ware im
 * Lager eines Bäckers ist Versorgung, die morgen am Markt hängt — sie jetzt zu übersehen
 * hieße, eine zweite Bäckerei zu verlangen, während die erste eine volle Kammer hat.
 *
 * **Ein Rohbau zählt als Antwort.** Sonst bekäme in der Stunde, in der die Lücke aufgeht,
 * **jeder** NPC dieselbe Bäckerei vorgeschlagen, und die Stadt bekäme sechs davon
 * (Herdenverhalten, Punkte 88 und 90). So entsteht eine nach der anderen: Ist die Lücke
 * danach immer noch offen, ist die nächste dran.
 *
 * **Nur Nahrung**, und das sei benannt: Für Bretter und Quader gibt es keine Verzehrzahl,
 * an der sich Bedarf messen ließe — ihr Bedarf hängt daran, wer gerade baut. Für sie
 * bleibt es bei einer je Handwerk, und Punkt 89 bleibt insoweit offen.
 *
 * **Der Kornspeicher zählt nicht mit**, und das mit Absicht. Er verkauft ohne Bestand und
 * ohne Grenze; zählte er als Versorgung, wäre Brot nie knapp, und die Regel bestätigte die
 * Krücke, statt die Kette anzuschieben, die sie ablösen soll (Punkt 85).
 */
export async function knappeHandwerke(
	handwerke: BuildingTemplate[],
	vorhanden: Haus[],
	regionId: string
): Promise<BuildingTemplate[]> {
	// Erst sortieren, was ohne Datenbank geht: Nur Nahrungsbetriebe kommen in Frage, und
	// wer schon daran baut, hat die Lücke bereits beantwortet. Bleibt nichts übrig, kostet
	// die ganze Frage keine Abfrage.
	const nahrung = handwerke
		.flatMap((vorlage) => {
			const rezept = vorlage.recipes?.[0];
			const ware = rezept ? getItemTemplate(rezept.outputItemId) : undefined;
			return ware?.nourishment
				? [{ vorlage, itemId: ware.itemId, nourishment: ware.nourishment }]
				: [];
		})
		.filter(
			({ vorlage }) =>
				!vorhanden.some((haus) => haus.optionId === vorlage.optionId && haus.underConstruction)
		);
	if (nahrung.length === 0) return [];

	const einwohner: number = await Character.count({
		where: { RegionId: regionId, deathTick: null }
	});
	if (einwohner === 0) return [];

	const knapp: BuildingTemplate[] = [];
	for (const { vorlage, itemId, nourishment } of nahrung) {
		const noetig: number = supplyNeeded(einwohner, nourishment);
		if ((await warenbestand(regionId, itemId)) < noetig) knapp.push(vorlage);
	}
	return knapp;
}

/** Wie viel von einer Ware in dieser Stadt zu haben ist — am Schild und im Lager. */
export async function warenbestand(regionId: string, itemId: string): Promise<number> {
	const haeuser = await Building.findAll({
		include: [{ model: Plot, as: 'plot', where: { RegionId: regionId }, required: true }],
		attributes: ['id']
	});
	const ids: string[] = haeuser.map((haus) => haus.dataValues.id);
	if (ids.length === 0) return 0;

	const angebote: number =
		(await ShopOffer.sum('quantity', { where: { BuildingId: { [Op.in]: ids }, itemId } })) ?? 0;
	const lager: number =
		(await BuildingStock.sum('quantity', { where: { BuildingId: { [Op.in]: ids }, itemId } })) ?? 0;
	return angebote + lager;
}
