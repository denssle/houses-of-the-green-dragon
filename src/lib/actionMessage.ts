import type { ActionFailureReason } from '$lib/game/actionFailure';
import { MAX_NAME_LENGTH, MIN_NAME_LENGTH, type NameProblem } from '$lib/game/naming.logic';

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
	NOT_IN_STOCK: 'Davon hast du nichts mehr.',
	INVENTORY_FULL: 'Dein Inventar fasst nicht mehr — lagere etwas ein oder wohne besser.',
	WRONG_SEASON: 'Dafür ist jetzt nicht die Jahreszeit.',
	NOT_LEASED: 'Die Fläche ist nicht deine — pachte sie erst.',
	NO_JOB_OFFERED: 'Hier wird niemand gesucht.',
	ALREADY_EMPLOYED: 'Du hast bereits eine Anstellung.',
	EMPLOYER_BROKE: 'Der Betrieb kann den Lohn nicht zahlen.',
	NO_ELECTION: 'Es wird gerade nicht gewählt.',
	ALREADY_STANDING: 'Du stehst bereits auf dem Wahlzettel.',
	ALREADY_VOTED: 'Du hast deine Stimme schon abgegeben.',
	NOT_IN_OFFICE: 'Dazu müsstest du das Amt innehaben.',
	NOT_A_CITIZEN: 'Du bist noch nicht lange genug hier, um mitzuwählen.',
	OUT_OF_BOUNDS: 'So weit reicht die Macht des Amtes nicht.',
	BID_TOO_LOW: 'Damit ist niemand zu überbieten.'
};

export function actionMessage(reason: ActionFailureReason): string {
	return SAETZE[reason];
}

/**
 * Warum ein Name nicht angenommen wurde.
 *
 * Eigene Liste statt eines Eintrags in `SAETZE`: Namen sind keine Handlung, die scheitert,
 * sondern eine Eingabe, die nicht taugt — und die Gründe dafür gelten für Kinder wie für
 * Gebäude gleichermaßen.
 */
const NAMENSSAETZE: Record<NameProblem, string> = {
	TOO_SHORT: `Ein Name braucht mindestens ${MIN_NAME_LENGTH} Zeichen.`,
	TOO_LONG: `Mehr als ${MAX_NAME_LENGTH} Zeichen sind kein Name mehr.`,
	TAKEN: 'So heißt schon ein Geschwisterkind.',
	TOO_OLD: 'Dafür ist es zu spät — der Name steht seit der Volljährigkeit fest.',
	NOT_YOURS: 'Darüber hast du nicht zu bestimmen.'
};

export function nameMessage(reason: NameProblem): string {
	return NAMENSSAETZE[reason];
}
