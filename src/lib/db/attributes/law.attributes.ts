import type { LawKind } from '$lib/game/law.logic';

/**
 * Ein Erlass.
 *
 * **Gespeichert wird der Vorgang, nicht der Zustand.** Es gibt keine Zeile „Zehnt = 15",
 * die überschrieben wird, sondern für jede Änderung eine neue Zeile mit Tick und
 * Urheber; es gilt der jüngste Erlass je Art. Dieselbe Bauart wie beim Amt aus 4.7a, und
 * derselbe Gewinn: Die Chronik fällt ab, statt eigens geführt zu werden — wer hat wann
 * die Steuern erhöht, und wie ist ihm die nächste Wahl bekommen?
 */
export interface LawAttributes {
	id: string;
	RegionId: string;
	kind: LawKind;
	value: number;
	enactedTick: number;
	/** Wer es erlassen hat. Bleibt stehen, auch wenn er längst tot ist. */
	EnactedByCharacterId: string | null;
}

export type LawCreationAttributes = LawAttributes;
