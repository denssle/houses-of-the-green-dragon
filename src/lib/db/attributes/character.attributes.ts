import type { Optional } from 'sequelize';
import type { CharacterRole, Gender } from '$lib/db/attributes/enums';
import type { Character } from '$lib/model/character';

/**
 * Das sterbliche Gegenstück zur Dynastie.
 *
 * Zu den Feldern, die nicht selbsterklärend sind:
 *
 * - `DynastyId` ist nullbar, weil die Fremd-NPCs, die die Welt zum Start bevölkern, zu
 *   keinem Haus gehören. Bei ihnen entfällt die mittlere Schicht der Zuneigung.
 * - `deathTick` bleibt leer, solange der Charakter lebt — daran und nicht an einem
 *   `isAlive`-Kennzeichen hängt die Unterscheidung, damit es keine zwei Wahrheiten gibt.
 * - `actionPoints` und `lastTickProcessed` gehören zusammen: Das Kontingent wächst pro
 *   Tick nach und wird beim Zugriff nachgerechnet, nicht in einem Durchlauf über alle
 *   Charaktere.
 * - Die Anstellung steht bewusst NICHT hier, sondern kommt ab Phase 4.6 als eigene
 *   Tabelle mit Lohn und Laufzeit. Nur das Wohnen hängt direkt am Charakter.
 */
export interface CharacterAttributes {
	id: string;
	firstName: string;
	title: string;
	role: CharacterRole;
	gender: Gender;
	actionPoints: number;
	lastTickProcessed: number;
	money: number;
	birthTick: number;
	deathTick: number | null;
	RegionId: string;
	DynastyId: string | null;
	motherId: string | null;
	fatherId: string | null;
	spouseId: string | null;
	heirId: string | null;
	pregnantSinceTick: number | null;
	pregnantByFatherId: string | null;
	proposedToId: string | null;
	HomeBuildingId: string | null;
}

export type CharacterCreationAttributes = Optional<
	CharacterAttributes,
	| 'title'
	| 'actionPoints'
	| 'money'
	| 'deathTick'
	| 'DynastyId'
	| 'motherId'
	| 'fatherId'
	| 'spouseId'
	| 'heirId'
	| 'pregnantSinceTick'
	| 'pregnantByFatherId'
	| 'proposedToId'
	| 'HomeBuildingId'
>;

export function convertToCharacter(attributes: CharacterAttributes): Character {
	return {
		id: attributes.id,
		firstName: attributes.firstName,
		title: attributes.title,
		role: attributes.role,
		gender: attributes.gender,
		actionPoints: attributes.actionPoints,
		money: attributes.money,
		birthTick: attributes.birthTick,
		deathTick: attributes.deathTick,
		regionId: attributes.RegionId,
		dynastyId: attributes.DynastyId,
		homeBuildingId: attributes.HomeBuildingId,
		spouseId: attributes.spouseId,
		pregnantSinceTick: attributes.pregnantSinceTick
	};
}
