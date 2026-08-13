import type { Gender } from '$lib/db/attributes/enums';

/**
 * Die Grundpersönlichkeit — woher ein Charakter seine Ziele nimmt.
 *
 * Sechs Achsen mit Zahlen statt eines Katalogs benannter Eigenschaften. Der Unterschied
 * ist kein Geschmack: Mit Achsen wird jede Entscheidung eine **gewichtete Summe**, und
 * eine neue Handlung braucht neue Gewichte statt einer Verzweigung über jeden denkbaren
 * Charakterzug. Sichtbar wird trotzdem ein Wort, abgeleitet aus dem stärksten Ausschlag.
 *
 * Jede Achse trägt mindestens eine Entscheidung — eine ohne wäre ein Wert, den niemand
 * liest. Was woran hängt, steht in `KONZEPT.md`, Abschnitt 8.
 *
 * **Sie ändert sich nie.** Anders als Zuneigung (4.3) und Fertigkeiten (4.5a) ist die
 * Persönlichkeit das Feste am Charakter: Was einer erlebt, verschiebt seine Beziehungen
 * und sein Können, nicht seine Anlagen. Wer anders handeln soll, muss ein anderer sein —
 * dafür gibt es den Generationenwechsel.
 */

export const PERSONALITY_AXES = [
	'courage',
	'diligence',
	'greed',
	'sociability',
	'ambition',
	'agreeableness'
] as const;
export type PersonalityAxis = (typeof PERSONALITY_AXES)[number];

export type Personality = Record<PersonalityAxis, number>;

/** Die Grenzen jeder Achse. Null ist der Durchschnitt, nicht das Fehlen einer Anlage. */
export const AXIS_MAX = 100;
export const AXIS_MIN = -100;

/**
 * Wie weit ein Kind von der Mitte seiner Eltern abweichen kann.
 *
 * Dreißig Punkte in beide Richtungen: genug, dass aus zwei Fleißigen ein Faulpelz werden
 * kann, wenn beide Würfel schlecht fallen — aber selten genug, dass Geschwister einander
 * ähneln und kluge Partnerwahl sich auszahlt.
 */
export const INHERITANCE_SPREAD = 30;

/**
 * Ab diesem Ausschlag fällt eine Anlage überhaupt auf.
 *
 * Darunter heißt es „ausgeglichen": Nicht jeder Mensch ist eine Karikatur, und ein
 * Etikett, das jeder trägt, sagt nichts.
 */
export const NOTABLE_FROM = 25;

/**
 * Die Anlagen der ersten Generation.
 *
 * Der Mittelwert dreier Würfe statt eines einzelnen — das ergibt eine Glockenkurve statt
 * einer Gleichverteilung. Ohne das wäre ein Charakter mit +95 Gier so häufig wie einer
 * mit 0, und eine Stadt voller Extreme ist keine Bevölkerung, sondern ein Panoptikum.
 */
export function randomPersonality(roll: () => number): Personality {
	const achse = (): number => {
		const mittel: number = (roll() + roll() + roll()) / 3;
		return Math.round((mittel * 2 - 1) * AXIS_MAX);
	};
	return {
		courage: achse(),
		diligence: achse(),
		greed: achse(),
		sociability: achse(),
		ambition: achse(),
		agreeableness: achse()
	};
}

/**
 * Was ein Kind von seinen Eltern mitbekommt.
 *
 * Mittelwert beider plus Streuung. Fehlt ein Elternteil — bei einem Kind, dessen Vater
 * die Welt nie kennengelernt hat —, zählt der andere allein; fehlen beide, wird gewürfelt.
 *
 * Damit hat die Partnerwahl eine Ebene mehr: Wer einen brauchbaren Erben will, heiratet
 * nicht irgendwen. Gewissheit gibt es trotzdem keine, und das ist der Punkt — ein Haus
 * soll sich seine Nachfolge nicht anzüchten können.
 */
export function inheritPersonality(
	mother: Personality | null,
	father: Personality | null,
	roll: () => number
): Personality {
	if (!mother && !father) return randomPersonality(roll);

	const geerbt = {} as Personality;
	for (const achse of PERSONALITY_AXES) {
		const eltern: number[] = [mother?.[achse], father?.[achse]].filter(
			(wert): wert is number => wert !== undefined
		);
		const mitte: number = eltern.reduce((a, b) => a + b, 0) / eltern.length;
		const streuung: number = (roll() * 2 - 1) * INHERITANCE_SPREAD;
		geerbt[achse] = clampAxis(Math.round(mitte + streuung));
	}
	return geerbt;
}

export function clampAxis(value: number): number {
	return Math.max(AXIS_MIN, Math.min(AXIS_MAX, value));
}

/**
 * Die Wörter zu den Achsen — je Richtung eines.
 *
 * Alle sind Adjektive, die sich im Deutschen schwach deklinieren lassen: „der Gierige",
 * „die Gierige". Damit genügt ein Wort je Richtung, und der Artikel entscheidet über das
 * Geschlecht — kein zweiter Satz Formen, der beim Erweitern vergessen würde.
 */
const WOERTER: Record<PersonalityAxis, { hoch: string; tief: string }> = {
	courage: { hoch: 'Mutige', tief: 'Vorsichtige' },
	diligence: { hoch: 'Fleißige', tief: 'Faule' },
	greed: { hoch: 'Gierige', tief: 'Genügsame' },
	sociability: { hoch: 'Gesellige', tief: 'Verschlossene' },
	ambition: { hoch: 'Ehrgeizige', tief: 'Bescheidene' },
	agreeableness: { hoch: 'Friedfertige', tief: 'Streitsüchtige' }
};

/**
 * Das Etikett: der stärkste Ausschlag, in Worte gefasst.
 *
 * Die Oberfläche zeigt keine Zahlen — aus demselben Grund wie bei der Zuneigung. Sechs
 * Werte zwischen -100 und +100 lüden dazu ein, den passenden Erben auszurechnen; ein
 * Wort sagt, worauf man sich einstellen muss, und lässt den Rest offen.
 */
export function personalityLabel(personality: Personality, gender: Gender): string {
	let staerkste: PersonalityAxis = PERSONALITY_AXES[0];
	for (const achse of PERSONALITY_AXES) {
		if (Math.abs(personality[achse]) > Math.abs(personality[staerkste])) {
			staerkste = achse;
		}
	}

	if (Math.abs(personality[staerkste]) < NOTABLE_FROM) return 'ausgeglichen';

	const wort: string =
		personality[staerkste] > 0 ? WOERTER[staerkste].hoch : WOERTER[staerkste].tief;
	return `${gender === 'FEMALE' ? 'die' : 'der'} ${wort}`;
}
