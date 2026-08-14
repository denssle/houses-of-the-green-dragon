import type { Personality } from '$lib/game/personality.logic';
import { SATIETY_COMFORTABLE, SATIETY_WEAKENED } from '$lib/game/need.logic';

/**
 * Was ein NPC als Nächstes tut.
 *
 * **Eine gewichtete Entscheidung, keine Regel je Lage.** Das ist der ganze Zweck der
 * Persönlichkeitsachsen aus 4.4a: Eine neue Handlung braucht neue Gewichte, nicht eine
 * neue Verzweigung über jeden denkbaren Charakterzug.
 *
 * **NPCs kommen so oft zum Zug wie Spielercharaktere.** Sie haben dasselbe
 * Aktionsbudget, dieselben Kosten und dieselben Regeln — deshalb braucht es hier keine
 * eigene Taktung: Wer nichts mehr hat, tut nichts mehr. Das drosselt die Schleife von
 * selbst und hält beide Hälften der Welt vergleichbar. Ein zweiter Satz Regeln für die
 * Simulation würde unweigerlich abdriften, und Balancing wäre dann nicht mehr möglich.
 *
 * Heute hängen drei der sechs Achsen an einer Handlung: Fleiß am Arbeiten, Gier am
 * Sparen, Geselligkeit am Werben. Mut, Ehrgeiz und Verträglichkeit warten auf Kampf
 * (Punkt 6) und Politik (4.7) — sie bekommen ihre Gewichte mit den Handlungen, zu denen
 * sie gehören.
 */

export const NPC_ACTIONS = [
	'EAT',
	'BUY_FOOD',
	'TAKE_JOB',
	'WORK',
	'MOVE_IN',
	'COURT',
	// Seit 4.12: Was über das Überleben hinausgeht. Ohne diese vier kaufen NPCs
	// ausschließlich Nahrung — und jeder Beruf außer dem Bäcker hätte keine Kundschaft.
	'BUY_GARMENT',
	'WEAR_GARMENT',
	'BUY_TONIC',
	'DRINK_TONIC',
	'IDLE'
] as const;
export type NpcAction = (typeof NPC_ACTIONS)[number];

/** Der Zustand, aus dem heraus ein NPC entscheidet. */
export interface NpcState {
	personality: Personality;
	actionPoints: number;
	money: number;
	satiety: number;
	/** Wie viele essbare Stücke im Lager liegen. */
	food: number;
	hasHome: boolean;
	/** Ist ein freier Platz in Reichweite, in den er ziehen könnte? */
	homeAvailable: boolean;
	isMarried: boolean;
	isAdult: boolean;
	/** Steht ein Arbeitsplatz offen, an dem er verdienen könnte? */
	workAvailable: boolean;
	/** Hat er eine feste Anstellung? */
	hasJob: boolean;
	/** Bietet jemand mehr als die Tagelöhnerei? */
	betterJobAvailable: boolean;
	/** Gibt es jemanden, um den er werben könnte? */
	matchAvailable: boolean;
	/** Was ein Stück Nahrung kostet. */
	foodPrice: number;

	// --- Was über das Nötigste hinausgeht (4.12) --------------------------------------
	/** Trägt er ein heiles Gewand? */
	wearsGarment: boolean;
	/** Liegt eines in der Kammer, ungetragen? */
	garmentInStock: number;
	tonicInStock: number;
	/** Was ein Gewand am Markt kostet — nichts heißt: keines zu haben. */
	garmentPrice: number | null;
	tonicPrice: number | null;
}

/**
 * Ab wie vielen fehlenden Aktionspunkten sich ein Trank lohnt.
 *
 * Erst wenn kaum noch etwas übrig ist: Ein Trank auf halbem Stand verschenkt die Hälfte
 * seiner Wirkung, weil er nur auffüllt, was fehlt.
 */
export const TONIC_WORTH_IT_BELOW = 3;

/**
 * Wie viel Geld einer zurücklegen will, bevor er aufhört zu arbeiten.
 *
 * Die Gier bestimmt es: Ein Genügsamer arbeitet, bis das Nötigste gedeckt ist, ein
 * Gieriger hört nie auf. Gerechnet in Mahlzeiten, nicht in Münzen — sonst hinge die
 * Zahl an den Preisen und ginge beim ersten Balancing daneben.
 */
export function desiredReserve(personality: Personality, foodPrice: number): number {
	const mahlzeiten: number = 3 + Math.round(((personality.greed + 100) / 200) * 12);
	return mahlzeiten * foodPrice;
}

/**
 * Ab welcher Sättigung einer sich ums Essen kümmert.
 *
 * Der Fleißige sorgt früher vor, der Träge wartet, bis es zwickt. Die Spanne liegt
 * bewusst über der Schwelle, ab der Not weh tut — auch der Trägste soll sich rühren,
 * bevor er geschwächt ist.
 */
export function eatingThreshold(personality: Personality): number {
	const spanne: number = SATIETY_COMFORTABLE - SATIETY_WEAKENED;
	return SATIETY_WEAKENED + Math.round(((personality.diligence + 100) / 200) * spanne);
}

/**
 * Die Entscheidung.
 *
 * Die Reihenfolge ist eine Rangfolge der Dringlichkeit, keine Willkür: Erst überleben,
 * dann ein Dach, dann eine Familie. Innerhalb jeder Stufe entscheidet die
 * Persönlichkeit, **ob** und **wie früh** — nicht, was zuerst kommt. Ein Träger stirbt
 * nicht am Hunger, weil er faul ist; er kümmert sich nur später darum.
 */
export function decideNpcAction(state: NpcState): NpcAction {
	// 1. Überleben. Essen kostet keinen Aktionspunkt — wer erst dafür arbeiten müsste,
	//    verhungerte ausgerechnet dann, wenn er schon geschwächt ist.
	const hungrig: boolean = state.satiety < eatingThreshold(state.personality);
	if (hungrig && state.food > 0) return 'EAT';

	// 2. Nachschub, solange das Geld reicht.
	if (hungrig && state.money >= state.foodPrice) return 'BUY_FOOD';

	// 3. Eine feste Stelle nehmen, wenn sie mehr bringt als die Tagelöhnerei. Kostet
	//    nichts und wirkt ab der nächsten Schicht — deshalb vor dem Arbeiten.
	if (!state.hasJob && state.betterJobAvailable && state.isAdult) return 'TAKE_JOB';

	// 4. Verdienen. Wer hungert und nichts hat, arbeitet — unabhängig von seinem Fleiß.
	//    Sonst verhungerte der Träge zuverlässig, und Faulheit wäre keine Eigenart mehr,
	//    sondern ein Todesurteil.
	if (state.workAvailable && state.actionPoints > 0) {
		if (hungrig) return 'WORK';
		if (state.money < desiredReserve(state.personality, state.foodPrice)) return 'WORK';
	}

	// 5. Ein Dach. Kostet nichts und ist die Voraussetzung für alles Weitere — ohne
	//    Wohnraum keine Kinder (4.4).
	if (!state.hasHome && state.homeAvailable) return 'MOVE_IN';

	// 6. Eine Familie. Der Gesellige wirbt, der Eigenbrötler seltener — aber auch er
	//    kommt irgendwann dazu, sonst stürbe seine Linie an seinem Wesen.
	if (
		!state.isMarried &&
		state.isAdult &&
		state.matchAvailable &&
		state.actionPoints > 0 &&
		state.personality.sociability > -80
	) {
		return 'COURT';
	}

	// 7. Wieder zu Kräften kommen — aber nur, wenn es auch etwas zu tun gibt. Ein Trank
	//    im Müßiggang ist ein teures Getränk: Die Punkte wachsen von selbst nach, und
	//    verschenkt wäre er, weil er nur auffüllt, was fehlt.
	if (
		state.actionPoints < TONIC_WORTH_IT_BELOW &&
		state.tonicInStock > 0 &&
		(state.hasJob || state.workAvailable)
	) {
		return 'DRINK_TONIC';
	}

	// 8. Sich kleiden. Kostet nichts und wirkt bei jedem Umgang — deshalb vor dem Kaufen.
	if (!state.wearsGarment && state.garmentInStock > 0) return 'WEAR_GARMENT';

	// 9. Kaufen, was das Auskommen verbessert — aber **nur über der Rücklage**. Ein NPC,
	//    der sein letztes Geld für ein Gewand ausgibt, verhungert darin. Die Rücklage
	//    hängt an der Gier: Der Genügsame kauft früher, der Raffende später.
	const ruecklage: number = desiredReserve(state.personality, state.foodPrice);
	const uebrig: number = state.money - ruecklage;

	//    Kleidung nur, wer überhaupt unter Leute geht. Dem Eigenbrötler ist gleich, wie er
	//    aussieht — und das ist die zweite Achse, die hier etwas zu sagen bekommt.
	if (
		!state.wearsGarment &&
		state.garmentInStock === 0 &&
		state.garmentPrice !== null &&
		uebrig >= state.garmentPrice &&
		state.personality.sociability > -50
	) {
		return 'BUY_GARMENT';
	}

	//    Einen Trank auf Vorrat nimmt nur mit, wer arbeitet: Für den Müßiggänger ist er
	//    ein teures Getränk ohne Zweck.
	if (
		state.tonicInStock === 0 &&
		state.tonicPrice !== null &&
		uebrig >= state.tonicPrice &&
		(state.hasJob || state.workAvailable)
	) {
		return 'BUY_TONIC';
	}

	return 'IDLE';
}
