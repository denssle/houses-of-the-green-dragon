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
	/**
	 * Geleistete Erschließungsschichten — `null`, wenn keine Erschließung läuft (5.92).
	 *
	 * Wer wissen will, ob hier gebaut werden darf, fragt `isUnderDevelopment()`: Die Null
	 * ist der Anfang einer Baustelle, nicht ihr Fehlen.
	 */
	developmentShifts: number | null;
	/**
	 * Wann das Grundstück aus einem erbenlosen Nachlass an die Stadt fiel — `null`, solange
	 * es von jeher ihr gehört (5.101). Dieselbe Unterscheidung wie am Gebäude.
	 */
	escheatedTick: number | null;
}
