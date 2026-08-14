import type { CharacterRole, Gender } from '$lib/db/attributes/enums';
import type { Personality } from '$lib/game/personality.logic';

/**
 * Ein Charakter, wie ihn die Anwendung sieht.
 *
 * Das Alter steht bewusst nicht darin: Es ergibt sich aus `birthTick` und der aktuellen
 * Weltzeit (`ageInYears`). Zwei Felder für denselben Sachverhalt gingen auseinander,
 * sobald die Zeit weiterläuft — und sie läuft weiter, auch wenn niemand hinsieht.
 */
export interface Character {
	id: string;
	firstName: string;
	title: string;
	/** Wann zuletzt ein Mensch hereingeschaut hat — nur er selbst setzt es (5.5). */
	lastSeenTick: number | null;
	role: CharacterRole;
	gender: Gender;
	actionPoints: number;
	money: number;
	birthTick: number;
	deathTick: number | null;
	regionId: string;
	dynastyId: string | null;
	homeBuildingId: string | null;
	spouseId: string | null;
	/** Seit wann schwanger — null heisst: nicht. Steht hier, weil die Anzeige es zeigt. */
	pregnantSinceTick: number | null;
	/**
	 * Seit wann das Gewand getragen wird — null heißt: keines.
	 *
	 * Ob es noch heil ist, rechnet `attire.logic.ts` daraus aus; ein zweites Feld dafür
	 * ginge mit der Zeit auseinander.
	 */
	wornSinceTick: number | null;
	/** Die Anlagen. Festgelegt bei der Geburt, unveraenderlich. */
	personality: Personality;
}
