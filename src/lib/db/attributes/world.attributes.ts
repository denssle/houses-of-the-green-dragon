import type { Optional } from 'sequelize';

/**
 * Die Weltzeit — genau eine Zeile, deshalb die feste `id`.
 *
 * `currentTick` zählt ein laufender Takt hoch, auch wenn niemand angemeldet ist; die
 * Welt ist kein Spielstand, der beim Aufrufen fortgesetzt wird. `lastTickAt` hält fest,
 * wann das zuletzt geschah — daraus ergibt sich nach einem Serverausfall, wie viele
 * Ticks fehlen.
 */
export interface WorldAttributes {
	id: number;
	currentTick: number;
	lastTickAt: Date;
}

export type WorldCreationAttributes = Optional<
	WorldAttributes,
	'id' | 'currentTick' | 'lastTickAt'
>;

/** Die Weltzeit steht immer in dieser einen Zeile. */
export const WORLD_ID = 1;
