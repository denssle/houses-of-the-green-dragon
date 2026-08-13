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
	NO_SUCH_PERSON: 'Diese Person gibt es nicht — oder nicht mehr.',
	TOO_YOUNG: 'Dafür ist eines von euch noch zu jung.',
	ALREADY_MARRIED: 'Eines von euch ist bereits verheiratet.',
	TOO_LITTLE_AFFECTION: 'So weit seid ihr noch nicht — wirb weiter.',
	CLOSE_KIN: 'Ihr seid zu nah verwandt.',
	SAME_GENDER: 'Aus dieser Verbindung gingen keine Kinder hervor.',
	NO_PROPOSAL: 'Es liegt kein Antrag vor.',
	NO_ROOM: 'Im Haus ist kein Platz mehr.',
	NOTHING_TO_DO: 'Daran gibt es nichts zu tun.',
	MAX_LEVEL: 'Weiter lässt sich hier nicht ausbauen.',
	NOT_FOR_SALE: 'Das steht nicht zum Verkauf.',
	ALREADY_OWNED: 'Das gehört dir bereits.',
	NOTHING_TO_LEARN: 'Bei ihm oder ihr ist nichts mehr zu lernen.',
	TEACHER_TOO_TIRED: 'Der Meister hat heute keine Zeit mehr.',
	NOT_EDIBLE: 'Das kann man nicht essen.',
	NOT_IN_STOCK: 'Davon hast du nichts mehr.'
};

export function actionMessage(reason: ActionFailureReason): string {
	return SAETZE[reason];
}
