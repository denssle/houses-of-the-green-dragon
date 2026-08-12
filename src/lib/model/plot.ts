import type { OwnerType, PlotType, ResourceType } from '$lib/db/attributes/enums';

/**
 * Ein Grundstück, wie es die Anwendung sieht.
 *
 * Das Grundstück überdauert das Haus darauf — deshalb ein eigenes Objekt und kein Feld
 * am Gebäude. Wer bauen will, braucht erst eines davon.
 */
export interface Plot {
	id: string;
	address: string;
	type: PlotType;
	resourceType: ResourceType | null;
	regionId: string;
	ownerType: OwnerType;
	ownerCharacterId: string | null;
	forSalePrice: number | null;
}
