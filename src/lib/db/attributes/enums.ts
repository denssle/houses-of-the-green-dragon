/**
 * Aufzählungen, die mehr als eine Tabelle betreffen.
 *
 * Bewusst als String-Union statt als `DataTypes.ENUM`: Ein echtes ENUM verhält sich
 * zwischen SQLite und MariaDB unterschiedlich, und genau diese Unterschiede müsste die
 * Migrationsprüfung in 1.4 dann ausgleichen. Die Werte werden stattdessen über
 * `validate: { isIn }` im Modell erzwungen — dialektunabhängig und in der Fehlermeldung
 * verständlicher.
 */

/** Der gespielte Charakter oder einer der vielen, die die Welt bevölkern. */
export const CHARACTER_ROLES = ['PLAYER', 'NPC'] as const;
export type CharacterRole = (typeof CHARACTER_ROLES)[number];

/**
 * Rein biologisch — für Ehe und Zeugung. Rechte hängen im Spiel ausdrücklich nicht
 * daran (siehe `KONZEPT.md`): Erben, wählen, arbeiten und Ämter bekleiden können alle.
 */
export const GENDERS = ['FEMALE', 'MALE'] as const;
export type Gender = (typeof GENDERS)[number];

/** Orte auf der Karte: Städte und die Umlandflächen, aus denen Rohstoffe kommen. */
export const REGION_TYPES = ['CITY', 'FOREST', 'QUARRY', 'FIELD', 'MINE'] as const;
export type RegionType = (typeof REGION_TYPES)[number];

/** Ein Grundstück trägt entweder ein Gebäude oder liefert einen Rohstoff. */
export const PLOT_TYPES = ['BUILDING_LAND', 'RESOURCE'] as const;
export type PlotType = (typeof PLOT_TYPES)[number];

export const RESOURCE_TYPES = ['WOOD', 'STONE', 'GRAIN', 'ORE', 'WOOL', 'HERBS'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/**
 * Wem etwas gehört, wird ausdrücklich ausgezeichnet und nicht aus einem leeren
 * Fremdschlüssel erschlossen: `NONE` (nie vergebenes Bauland) und `CITY` (Gemeingut,
 * etwa Abbauflächen und öffentliche Gebäude) wären sonst nicht unterscheidbar.
 */
export const OWNER_TYPES = ['CHARACTER', 'CITY', 'NONE'] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];
