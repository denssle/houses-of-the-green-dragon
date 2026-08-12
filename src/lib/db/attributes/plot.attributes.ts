import type { Optional } from 'sequelize';
import type { OwnerType, PlotType, ResourceType } from '$lib/db/attributes/enums';
import type { Plot } from '$lib/model/plot';

/**
 * Ein Grundstück — Bauland in der Stadt oder Abbaufläche im Umland.
 *
 * Eigenständig und nicht ein Feld am Gebäude, weil es das Gebäude überdauert: Verfällt
 * ein Haus zur Ruine, verschwindet die `building`-Zeile, das Grundstück bleibt beim
 * Eigentümer. Genau das gibt der Stadt Platz zurück, den aufgegebene Häuser sonst für
 * immer blockierten.
 *
 * `forSalePrice` ist der ganze Immobilienmarkt: Verkaufen heißt, einen Preis zu setzen —
 * kein Auktionsobjekt, passend zum Festpreisprinzip.
 */
export interface PlotAttributes {
	id: string;
	address: string;
	type: PlotType;
	resourceType: ResourceType | null;
	RegionId: string;
	ownerType: OwnerType;
	OwnerCharacterId: string | null;
	forSalePrice: number | null;
}

export type PlotCreationAttributes = Optional<
	PlotAttributes,
	'resourceType' | 'ownerType' | 'OwnerCharacterId' | 'forSalePrice'
>;

export function convertToPlot(attributes: PlotAttributes): Plot {
	return {
		id: attributes.id,
		address: attributes.address,
		type: attributes.type,
		resourceType: attributes.resourceType,
		regionId: attributes.RegionId,
		ownerType: attributes.ownerType,
		ownerCharacterId: attributes.OwnerCharacterId,
		forSalePrice: attributes.forSalePrice
	};
}
