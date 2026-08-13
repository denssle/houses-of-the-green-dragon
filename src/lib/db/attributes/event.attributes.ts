import type { EventKind } from '$lib/game/chronicle.logic';

/**
 * Ein Eintrag in der Chronik.
 *
 * Art, Zeitpunkt, Ort, Beteiligte — kein fertiger Satz. Die Kennungen sind bewusst
 * **keine Fremdschlüssel mit Löschweitergabe**: Die Chronik soll auch dann noch lesbar
 * sein, wenn das Gebäude eine Ruine wurde und der Charakter längst tot ist. Ein Eintrag,
 * der mit seinem Gegenstand verschwindet, ist keine Chronik, sondern eine Zustandsanzeige.
 */
export interface EventAttributes {
	id: string;
	RegionId: string | null;
	kind: EventKind;
	tick: number;
	subjectId: string | null;
	objectId: string | null;
	buildingId: string | null;
	dynastyId: string | null;
	value: number | null;
	detail: string | null;
}

export type EventCreationAttributes = EventAttributes;
