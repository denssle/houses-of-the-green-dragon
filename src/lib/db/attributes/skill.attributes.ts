import type { SkillType } from '$lib/game/skill.logic';

/**
 * Was ein Charakter kann — **spärlich gespeichert**.
 *
 * Wer eine Fertigkeit nie ausgeübt hat, hat dazu keine Zeile; das gilt als Stufe null.
 * Bei einem wachsenden Katalog und einer wachsenden Bevölkerung wäre alles andere
 * Ballast, und es ist dieselbe Sparsamkeit wie bei der Zuneigung.
 *
 * `progress` gehört mitgespeichert, weil es sich — anders als Zuneigung, Aktionsbudget
 * und Gebäudeverfall — **nicht aus der Zeit ableiten lässt**: Übung hängt daran, was
 * jemand getan hat, nicht daran, wie lange er es nicht getan hat. Das ist die erste
 * Stelle im Spiel, an der bei jeder Handlung geschrieben werden muss.
 */
export interface SkillAttributes {
	CharacterId: string;
	type: SkillType;
	level: number;
	progress: number;
}

export type SkillCreationAttributes = SkillAttributes;
