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
	// Seit 4.13 die fünfte Stufe: etwas Eigenes aufbauen (Punkt 29).
	'BUY_PLOT',
	'BUILD',
	'LEASE',
	'HARVEST',
	'CRAFT',
	'SELL',
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

	// --- Was zum Unternehmen gehört (4.13) --------------------------------------------
	/** Gehört ihm eine Werkstatt? */
	ownsWorkshop: boolean;
	/** Hat er ein unbebautes eigenes Grundstück? */
	hasFreePlot: boolean;
	/** Pachtet er eine Abbaufläche? */
	hasLease: boolean;
	/** Steht eine Fläche zur Pacht frei? */
	leaseAvailable: boolean;
	/** Liegen im eigenen Betrieb Waren, die noch niemand anbietet? */
	ownStockToSell: number;
	/** Reichen die Zutaten für einen Durchgang? */
	canCraft: boolean;
	/** Was ein Grundstück kostet — nichts heißt: keines zu haben. */
	plotPrice: number | null;
	/** Was die billigste Werkstatt kostet, die hier fehlt. */
	workshopPrice: number | null;
	leaseFee: number;
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
 * **Die Rangfolge ist eine Bedürfnishierarchie**, keine Willkür — wer hungert, denkt nicht
 * an ein Gewand, und wer kein Dach hat, gründet keinen Betrieb. Die Stufen sind an Maslow
 * angelehnt, und sie leisten hier mehr als eine Ordnung: Sie beantworten die Frage, die
 * jede neue NPC-Handlung sonst einzeln aufwerfen würde — **wann tut er das?** Antwort:
 * wenn alles Darunterliegende gedeckt ist.
 *
 * Innerhalb einer Stufe entscheidet die Persönlichkeit, **ob** und **wie früh** — nicht,
 * was zuerst kommt. Ein Träger stirbt nicht am Hunger, weil er faul ist; er kümmert sich
 * nur später darum.
 */
export function decideNpcAction(state: NpcState): NpcAction {
	return (
		ueberleben(state) ??
		sicherheit(state) ??
		zugehoerigkeit(state) ??
		ansehen(state) ??
		entfaltung(state) ??
		'IDLE'
	);
}

/**
 * Stufe 1 — **Überleben**: essen, und wenn nichts da ist, welches besorgen.
 *
 * Essen kostet keinen Aktionspunkt: Wer erst dafür arbeiten müsste, verhungerte
 * ausgerechnet dann, wenn er schon geschwächt ist.
 */
function ueberleben(state: NpcState): NpcAction | undefined {
	const hungrig: boolean = state.satiety < eatingThreshold(state.personality);
	if (!hungrig) return undefined;

	if (state.food > 0) return 'EAT';
	if (state.money >= state.foodPrice) return 'BUY_FOOD';
	// Wer hungert und nichts hat, arbeitet — unabhängig von seinem Fleiß. Sonst
	// verhungerte der Träge zuverlässig, und Faulheit wäre keine Eigenart mehr, sondern
	// ein Todesurteil.
	if (state.workAvailable && state.actionPoints > 0) return 'WORK';
	return undefined;
}

/**
 * Stufe 2 — **Sicherheit**: ein Dach, ein Auskommen, eine Rücklage.
 *
 * Was hier steht, schützt vor der Stufe darunter: Die Anstellung sichert das Essen von
 * morgen, das Dach die Kinder von übermorgen (ohne Wohnraum keine Geburt, siehe 4.4).
 */
function sicherheit(state: NpcState): NpcAction | undefined {
	// Eine feste Stelle nehmen, wenn sie mehr bringt als die Tagelöhnerei. Kostet nichts
	// und wirkt ab der nächsten Schicht — deshalb vor dem Arbeiten.
	if (!state.hasJob && state.betterJobAvailable && state.isAdult) return 'TAKE_JOB';

	// Wieder zu Kräften kommen, wenn Arbeit wartet. Der Trank füllt nur auf, was fehlt;
	// im Müßiggang wäre er ein teures Getränk.
	if (
		state.actionPoints < TONIC_WORTH_IT_BELOW &&
		state.tonicInStock > 0 &&
		(state.hasJob || state.workAvailable)
	) {
		return 'DRINK_TONIC';
	}

	// Verdienen, bis die Rücklage steht. Wie hoch sie ist, sagt die Gier.
	if (
		state.workAvailable &&
		state.actionPoints > 0 &&
		state.money < desiredReserve(state.personality, state.foodPrice)
	) {
		return 'WORK';
	}

	if (!state.hasHome && state.homeAvailable) return 'MOVE_IN';
	return undefined;
}

/**
 * Stufe 3 — **Zugehörigkeit**: eine Familie gründen.
 *
 * Der Gesellige wirbt, der Eigenbrötler seltener — aber auch er kommt irgendwann dazu,
 * sonst stürbe seine Linie an seinem Wesen.
 */
function zugehoerigkeit(state: NpcState): NpcAction | undefined {
	if (
		!state.isMarried &&
		state.isAdult &&
		state.matchAvailable &&
		state.actionPoints > 0 &&
		state.personality.sociability > -80
	) {
		return 'COURT';
	}
	return undefined;
}

/**
 * Stufe 4 — **Ansehen**: wie man dasteht.
 *
 * Gekauft wird nur über der Rücklage. Ein NPC, der sein letztes Geld für ein Gewand
 * ausgibt, verhungert darin — und die Rücklage hängt an der Gier: Der Genügsame kauft
 * früher, der Raffende später.
 */
function ansehen(state: NpcState): NpcAction | undefined {
	// Anziehen kostet nichts und wirkt bei jedem Umgang — deshalb vor dem Kaufen.
	if (!state.wearsGarment && state.garmentInStock > 0) return 'WEAR_GARMENT';

	const uebrig: number = state.money - desiredReserve(state.personality, state.foodPrice);

	// Kleidung nur, wer überhaupt unter Leute geht. Dem Eigenbrötler ist gleich, wie er
	// aussieht.
	if (
		!state.wearsGarment &&
		state.garmentInStock === 0 &&
		state.garmentPrice !== null &&
		uebrig >= state.garmentPrice &&
		state.personality.sociability > -50
	) {
		return 'BUY_GARMENT';
	}

	// Einen Trank auf Vorrat nimmt nur mit, wer arbeitet.
	if (
		state.tonicInStock === 0 &&
		state.tonicPrice !== null &&
		uebrig >= state.tonicPrice &&
		(state.hasJob || state.workAvailable)
	) {
		return 'BUY_TONIC';
	}

	return undefined;
}

/**
 * Stufe 5 — **Entfaltung**: etwas Eigenes aufbauen.
 *
 * Hier wird aus einem Einwohner ein Unternehmer: ein Grundstück kaufen, eine Werkstatt
 * darauf stellen, Rohstoff pachten, herstellen, verkaufen. Alles davon konnten bisher nur
 * Spieler — und solange das so war, gehörte jeder Betrieb der Welt einem Menschen am
 * Bildschirm. Fiel der letzte weg, stellte niemand mehr etwas her.
 *
 * **Dass es ganz oben steht, ist die Antwort auf die Balancing-Frage.** Ein NPC, der bei
 * jeder Gelegenheit baut, verwandelt die Stadt in eine Fabriklandschaft. Hier baut nur,
 * wer satt ist, ein Dach hat, versorgt ist und Geld übrig hat — und selbst dann nur, wenn
 * sein Wesen dazu drängt.
 *
 * Die Reihenfolge innerhalb der Stufe geht **vom Vorhandenen zum Neuen**: erst
 * verwerten, was da ist (verkaufen, herstellen, ernten), dann erweitern (pachten,
 * bauen, kaufen). Sonst häufte einer Grundstücke an, während in seiner Werkstatt die
 * Ware verdirbt.
 */
function entfaltung(state: NpcState): NpcAction | undefined {
	if (!state.isAdult || state.actionPoints <= 0) return undefined;

	// Verkaufen: Was im eigenen Betrieb liegt, bringt erst als Angebot Geld. Ohne diesen
	// Schritt wäre die ganze Stufe eine Beschäftigungstherapie.
	if (state.ownStockToSell > 0) return 'SELL';

	// Herstellen, solange Zutaten da sind.
	if (state.canCraft) return 'CRAFT';

	// Ernten, was die gepachtete Fläche hergibt.
	if (state.hasLease) return 'HARVEST';

	const uebrig: number = state.money - desiredReserve(state.personality, state.foodPrice);

	// Eine Fläche pachten, wenn der eigene Betrieb Rohstoff braucht.
	if (state.ownsWorkshop && !state.hasLease && state.leaseAvailable && uebrig >= state.leaseFee) {
		return 'LEASE';
	}

	// **Bauen ist die teuerste Entscheidung und steht deshalb hinten.** Wer nichts
	// unternimmt, verliert nichts; wer zu früh baut, hat kein Geld mehr für Brot.
	if (!state.ownsWorkshop && state.hasFreePlot && state.workshopPrice !== null) {
		if (uebrig >= state.workshopPrice && isEnterprising(state.personality)) return 'BUILD';
	}

	// Ein Grundstück, um darauf zu bauen. Erst danach lohnt der Blick auf die Werkstatt.
	if (
		!state.ownsWorkshop &&
		!state.hasFreePlot &&
		state.plotPrice !== null &&
		uebrig >= state.plotPrice &&
		isEnterprising(state.personality)
	) {
		return 'BUY_PLOT';
	}

	return undefined;
}

/**
 * Ab wann einer etwas Eigenes wagt.
 *
 * Ehrgeiz treibt, Trägheit bremst, und beides zusammen ergibt die Neigung. Die Schwelle
 * liegt über der Mitte: Ein Betrieb ist Arbeit, und die meisten Leute begnügen sich mit
 * einer Anstellung — sonst stünde nach zwei Generationen in jeder Gasse eine Werkstatt,
 * und niemand wäre mehr da, der darin arbeitet.
 */
export const ENTERPRISE_THRESHOLD = 20;

export function isEnterprising(personality: Personality): boolean {
	return (personality.ambition + personality.diligence) / 2 >= ENTERPRISE_THRESHOLD;
}
