import type { Personality } from '$lib/game/personality.logic';
import { LAW_RULES, type LawKind } from '$lib/game/law.logic';

/**
 * Was ein Bürgermeister von sich aus tut.
 *
 * **Eine Stadt hat Bedürfnisse wie ein Mensch**, und sie lassen sich in derselben Weise
 * ordnen wie die eines NPCs (siehe `npc.logic.ts`): erst das Nötige, dann das Nützliche,
 * dann das Wünschenswerte. Wer regiert, arbeitet diese Liste von oben ab — und wer sie
 * nicht abarbeitet, verliert bei der nächsten Wahl.
 *
 * Das gilt für NPCs im Amt. Ein Spieler bekommt diese Hilfe nicht: Er soll selbst
 * entscheiden, sonst wäre das Amt eine Schaltfläche, die erledigt, was ohnehin geschieht.
 */

export const MAYOR_ACTIONS = [
	'PAY_WAGE',
	'REPAIR',
	'BUILD_PUBLIC',
	'DEVELOP_LAND',
	'SET_TAX',
	'NOTHING'
] as const;
export type MayorAction = (typeof MAYOR_ACTIONS)[number];

/** Die Lage der Stadt, aus der heraus entschieden wird. */
export interface CityState {
	personality: Personality;
	treasury: number;
	/**
	 * Steht in einem städtischen Haus eine Stelle offen, für die kein Sold aushängt?
	 *
	 * Bis 5.14 fragte das nur nach dem Wachhaus — und die städtische Schmiede stand
	 * deshalb seit dem ersten Tag der Welt ohne Schmied da: Für sie hing nie ein Aushang
	 * aus, also konnte sich niemand bewerben. Ein Arbeitsplatz, den die Stadt besitzt,
	 * aber nie ausschreibt, ist eine Kulisse.
	 */
	unstaffedWorkplace: boolean;
	/** Verfällt ein öffentlicher Bau? */
	repairNeeded: boolean;
	repairCost: number;
	/** Fehlt ein öffentlicher Bau, der jetzt schon wirkt? */
	missingBuildingPrice: number | null;
	/** Ist die Stadt ohne freies Bauland? */
	landExhausted: boolean;
	developmentCost: number;
	/** Der geltende Zehnt und was er sein könnte. */
	tithe: number;
}

/**
 * Wie viel die Stadt in der Kasse behalten will.
 *
 * Löhne und Instandhaltung laufen weiter, auch wenn gerade nichts eingeht — eine Stadt,
 * die alles verbaut, kann ihre Wache nächste Woche nicht bezahlen. Gerechnet in
 * Erschließungskosten, damit die Zahl mit den Preisen mitwandert statt eine Konstante zu
 * sein, die beim ersten Balancing danebenliegt.
 */
export const TREASURY_RESERVE_FACTOR = 2;

export function treasuryReserve(developmentCost: number): number {
	return developmentCost * TREASURY_RESERVE_FACTOR;
}

/**
 * Ab wann ein Bürgermeister die Steuern anhebt.
 *
 * Wenn die Kasse nicht einmal die Rücklage hergibt. Und er senkt sie wieder, wenn sie das
 * Vielfache davon hält — eine Stadt, die hortet, nimmt ihren Bürgern Geld ab, das sie
 * besser selbst ausgäben.
 */
export const TAX_RAISE_STEP = 5;

export function nextTithe(state: CityState): number | undefined {
	const ruecklage: number = treasuryReserve(state.developmentCost);
	const grenzen = LAW_RULES.TITHE;

	if (state.treasury < ruecklage && state.tithe < grenzen.max) {
		return Math.min(grenzen.max, state.tithe + TAX_RAISE_STEP);
	}
	if (state.treasury > ruecklage * 4 && state.tithe > grenzen.min) {
		return Math.max(grenzen.min, state.tithe - TAX_RAISE_STEP);
	}
	return undefined;
}

/** Welches Gesetz ein NPC-Bürgermeister anfasst — bisher nur eines. */
export const NPC_MAYOR_LAW: LawKind = 'TITHE';

/**
 * Die Entscheidung.
 *
 * Die Rangfolge ist dieselbe Idee wie beim Einwohner: **erst was trägt, dann was
 * wächst.** Eine Stadt mit unbesetzten Werkstätten und verfallenen Bauten verliert
 * Ertrag, eine ohne Bauland kann nicht wachsen — und die Steuer ist das Mittel, nicht der
 * Zweck: Sie kommt zuletzt, wenn das Geld für all das nicht reicht.
 *
 * Bis 5.40 stand hier „erst was schützt": Das galt der Wache gegen die Räuber, und beide
 * sind vorerst aus dem Spiel.
 */
export function decideMayorAction(state: CityState): MayorAction {
	const ruecklage: number = treasuryReserve(state.developmentCost);

	// 1. Die Stellen besetzen, die die Stadt zu vergeben hat. Eine Schmiede ohne Schmied
	//    stellt nichts her, obwohl die Stadt sie bezahlt hat. Steht ganz oben, weil es
	//    nichts kostet außer dem Aushang — der Lohn fließt erst, wenn jemand annimmt und
	//    arbeitet.
	if (state.unstaffedWorkplace) return 'PAY_WAGE';

	// 2. Erhalten, was steht. Billiger als neu bauen, und der Verfall frisst still.
	if (state.repairNeeded && state.treasury >= state.repairCost) return 'REPAIR';

	// 3. Bauen, was fehlt — aber nur über der Rücklage: Löhne und Instandhaltung laufen
	//    weiter.
	if (
		state.missingBuildingPrice !== null &&
		state.treasury - state.missingBuildingPrice >= ruecklage
	) {
		return 'BUILD_PUBLIC';
	}

	// 4. Land erschließen, wenn keines mehr frei ist. Die Versteigerung bringt es zurück,
	//    aber erst später — deshalb nach dem Bauen.
	if (state.landExhausted && state.treasury - state.developmentCost >= ruecklage) {
		return 'DEVELOP_LAND';
	}

	// 5. An der Steuer drehen. Zuletzt, weil sie andere trifft: Wer sie anhebt, nimmt
	//    seinen Wählern etwas weg — und wird daran gemessen.
	if (nextTithe(state) !== undefined) return 'SET_TAX';

	return 'NOTHING';
}
