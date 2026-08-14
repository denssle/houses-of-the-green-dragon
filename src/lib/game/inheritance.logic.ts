import { AGE_OF_MAJORITY, ageInYears } from '$lib/game/time';

/**
 * Wer erbt, und wie viel.
 *
 * Zwei Regeln aus dem Konzept, die hier zusammenkommen: Der Spieler **wählt** seinen
 * Erben unter den eigenen Kindern, und die übrigen bekommen einen **Anteil nach Gesetz**.
 * Weil dieses Gesetz ab 4.7 der Rat einer Stadt ändern kann, ist der Satz ein Parameter
 * und kein Literal — sonst müsste die Erbschaftslogik später aufgemacht werden.
 *
 * Geteilt wird nur das Bargeld. Grundstücke und Gebäude gehen ungeteilt an den Erben:
 * Ein Viertel eines Hauses ist nichts, was man bewohnen, vermieten oder renovieren kann,
 * und über Generationen zersplitterte Grundbesitz sonst zu Bruchteilen, die niemand mehr
 * zusammenbekommt. Der Preis dafür ist, dass Geschwister in einem Haus mit viel Boden
 * und wenig Münzen wenig erben — was mittelalterlich stimmig ist und die Politik aus 4.7
 * mit einem Streitgegenstand versorgt.
 */

/** Welcher Anteil des Bargelds unter den übrigen Kindern aufgeteilt wird. */
export const SIBLING_SHARE = 0.25;

/**
 * Was dem überlebenden Ehepartner zusteht, bevor unter den Kindern geteilt wird.
 *
 * Er erbt das Haus nicht — Grund und Mauern gehen ungeteilt an den Erben, damit der Besitz
 * über Generationen nicht zerfällt. Aber er darf davon nicht mittellos zurückbleiben. Ein
 * Viertel vorweg ist genug, um weiterzuleben, und wenig genug, dass eine Ehe kurz vor dem
 * Tod kein Weg wird, ein Haus auszunehmen.
 */
export const SPOUSE_SHARE = 0.25;

/** Was die Erbfolge von einem Kind wissen muss. */
export interface Child {
	id: string;
	birthTick: number;
}

/**
 * Wer das Haus weiterführt.
 *
 * Der benannte Erbe zählt nur, solange er lebt — deshalb kommen hier ausschließlich
 * lebende Kinder herein. Ist keiner benannt oder hat der Benannte den Erblasser nicht
 * überlebt, greift die Regel: das älteste **volljährige** Kind.
 *
 * Gibt es nur Minderjährige, erbt trotzdem das älteste von ihnen. Ein Haus, das an
 * seinen Kindern vorbei erlischt, wäre die härtere Regel — aber eine, die den Spieler
 * für etwas bestraft, das er nicht steuern kann: Wann er stirbt, entscheidet der Würfel.
 * Ein Kind auf dem Stuhl des Hausherrn ist mittelalterlich ohnehin der Normalfall.
 */
export function chooseHeir(
	designatedId: string | null,
	livingChildren: Child[],
	currentTick: number
): string | null {
	if (livingChildren.length === 0) return null;

	const benannt = livingChildren.find((kind) => kind.id === designatedId);
	if (benannt) return benannt.id;

	// Ältestes zuerst: kleinerer Geburts-Tick heißt früher geboren.
	const nachAlter: Child[] = [...livingChildren].sort((a, b) => a.birthTick - b.birthTick);
	const volljaehrig = nachAlter.find(
		(kind) => ageInYears(kind.birthTick, currentTick) >= AGE_OF_MAJORITY
	);
	return (volljaehrig ?? nachAlter[0]).id;
}

/** Wie das Bargeld auseinandergeht. */
export interface EstateSplit {
	/** Was dem Erben bleibt. */
	heir: number;
	/** Was **jedes** der übrigen Kinder bekommt. */
	perSibling: number;
	/** Was an die Stadt fällt — nur, wenn es keinen Erben gibt. */
	toCity: number;
	/** Was der überlebende Ehepartner vorweg bekommt. */
	spouse: number;
}

/**
 * Teilt das Bargeld auf.
 *
 * Gerechnet wird in ganzen Münzen, und der Rest der Teilung bleibt beim Erben. Das ist
 * keine Bevorzugung, sondern die einzige Stelle, an der er sicher hingehört: Der Erbe
 * ist immer genau einer, die Geschwister sind es nicht — bei ihnen müsste man auslosen,
 * wer den übrigen Pfennig bekommt.
 *
 * Ohne Erben fällt alles an die Stadt, auch der Anteil der Geschwister. Das ist kein
 * Sonderfall der Rechnung, sondern der Fall „das Haus ist am Ende": Wer keinen Erben
 * hat, hat auch keine Kinder, unter denen zu teilen wäre.
 */
export function splitEstate(
	money: number,
	hasHeir: boolean,
	siblingCount: number,
	share: number = SIBLING_SHARE,
	hasSpouse: boolean = false,
	spouseShare: number = SPOUSE_SHARE
): EstateSplit {
	// Der Ehepartner wird **vorweg** bedient, aus dem ganzen Nachlass. Erst danach beginnt
	// die Teilung unter den Kindern — sonst hinge sein Auskommen daran, wie viele
	// Geschwister es gibt, und eine kinderreiche Ehe ließe die Witwe ärmer zurück als eine
	// kinderlose.
	const anEhepartner: number = hasSpouse ? Math.floor(money * spouseShare) : 0;
	const rest: number = money - anEhepartner;

	if (!hasHeir) {
		// Ohne Erben fällt der Rest an die Stadt — der Anteil des Partners bleibt seiner.
		// Ein Haus endet hier, ein Mensch nicht.
		return { heir: 0, perSibling: 0, toCity: rest, spouse: anEhepartner };
	}
	if (siblingCount <= 0) {
		return { heir: rest, perSibling: 0, toCity: 0, spouse: anEhepartner };
	}

	const topf: number = Math.floor(rest * share);
	const jeGeschwister: number = Math.floor(topf / siblingCount);
	return {
		heir: rest - jeGeschwister * siblingCount,
		perSibling: jeGeschwister,
		toCity: 0,
		spouse: anEhepartner
	};
}
