import type { ActionFailureReason } from '$lib/game/actionFailure';

/**
 * Die Sätze zu den Fehlschlägen aus der Spiellogik.
 *
 * Getrennt von den Regeln: Dort steht ein Code, hier steht die Formulierung. Sonst wäre
 * jeder Grund an so vielen Stellen ausformuliert, wie er vorkommt — und beim ersten
 * Umformulieren gingen die Fassungen auseinander.
 */
const SAETZE: Record<ActionFailureReason, string> = {
	NOT_ENOUGH_ACTION_POINTS: 'Dafür fehlt die Kraft — warte, bis wieder Aktionspunkte da sind.',
	NOT_ENOUGH_MONEY: 'Das Geld reicht nicht.',
	WRONG_REGION: 'Das liegt zu weit weg — du bist nicht am selben Ort.',
	NOT_A_WORKPLACE: 'Hier gibt es keine Arbeit.',
	PLOT_NOT_OWNED: 'Das Grundstück gehört dir nicht.',
	PLOT_ALREADY_BUILT: 'Auf dem Grundstück steht schon ein Gebäude.',
	LIMIT_REACHED: 'Von dieser Art gibt es in der Stadt bereits genug.',
	SAME_PERSON: 'Mit sich selbst schließt man keine Freundschaft.',
	NO_SUCH_PERSON: 'Diese Person gibt es nicht — oder nicht mehr.'
};

export function actionMessage(reason: ActionFailureReason): string {
	return SAETZE[reason];
}
