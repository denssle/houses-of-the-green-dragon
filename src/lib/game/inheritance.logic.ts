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
	share: number = SIBLING_SHARE
): EstateSplit {
	if (!hasHeir) {
		return { heir: 0, perSibling: 0, toCity: money };
	}
	if (siblingCount <= 0) {
		return { heir: money, perSibling: 0, toCity: 0 };
	}

	const topf: number = Math.floor(money * share);
	const jeGeschwister: number = Math.floor(topf / siblingCount);
	return {
		heir: money - jeGeschwister * siblingCount,
		perSibling: jeGeschwister,
		toCity: 0
	};
}
