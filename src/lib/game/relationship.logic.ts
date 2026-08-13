import type { ActionFailureReason } from '$lib/game/actionFailure';
import { TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Zuneigung — die drei Schichten, ihr Verfall und ihre Grenzen.
 *
 * Gespeichert wird nur die **persönliche Abweichung**, nicht die Zuneigung selbst. Der
 * Rest ergibt sich: Verwandtschaft aus dem Stammbaum, der Stand der beiden Häuser aus
 * der Dynastietabelle. Fehlt eine Zeile, gilt genau dieser Grundwert — bei n Charakteren
 * gäbe es sonst n² Zeilen, die zu 95 % nichts aussagen.
 *
 * Der Verfall zieht die persönliche Schicht Richtung null, also die Zuneigung Richtung
 * **Grundwert** und nicht Richtung Gleichgültigkeit: Ein Bruder, den man Jahre nicht
 * gesehen hat, ist wieder einfach ein Bruder — nicht ein Fremder.
 *
 * Alles hier ist reine Rechnung ohne Datenbank und ohne Uhr. Die Zeit kommt als
 * Tick-Abstand herein, damit sich zehn Jahre Funkstille in einem Test nachstellen
 * lassen, statt zwanzig Realtage zu warten.
 */

/** Die Grenzen der Skala. Zuneigung wie Abneigung laufen nicht ins Unendliche. */
export const AFFECTION_MAX = 100;
export const AFFECTION_MIN = -100;

/**
 * Nach so vielen Jahren ohne Zutun ist die Hälfte der persönlichen Schicht verflogen.
 *
 * Fünf Jahre sind zehn Realtage. Kurz genug, dass Beziehungen laufender Aufwand bleiben
 * und keine Dynastie ihre Machtbasis einfriert; lang genug, dass ein Urlaub keine
 * Freundschaft kostet.
 */
export const AFFECTION_HALF_LIFE_YEARS = 5;

/**
 * Häuser haben ein längeres Gedächtnis als Menschen. Eine Fehde, die niemand nährt,
 * klingt ab — aber über Generationen, nicht über Wochen.
 */
export const STANDING_HALF_LIFE_YEARS = 15;

/**
 * Mit diesem Gewicht geht der Stand der Häuser in die persönliche Zuneigung ein.
 *
 * Bewusst unter 1: Die persönliche Schicht reicht von -100 bis +100, die Hausschicht
 * höchstens von -50 bis +50. Damit **kann** die persönliche Erfahrung eine Fehde
 * überstimmen — Romeo und Julia bleiben möglich, sind aber ein Kampf gegen den Strom.
 */
export const HOUSE_LAYER_WEIGHT = 0.5;

/**
 * Welcher Bruchteil einer persönlichen Änderung auf das Verhältnis der Häuser abfärbt.
 *
 * Ein Zehntel, auf ganze Punkte gerundet: Eine Höflichkeit unter fünf Punkten bewegt
 * gar nichts, ein ernsthafter Zerwürfnis schon. So entsteht eine Fehde daraus, dass sich
 * über Jahre genug Leute in die Haare geraten — und nicht daraus, dass zwei einmal
 * aneinandergerieten.
 */
export const HOUSE_DRIFT_FACTOR = 0.1;

/** Wie zwei Charaktere miteinander verwandt sind — die erste Schicht. */
export const KINSHIPS = [
	'SPOUSE',
	'PARENT',
	'CHILD',
	'SIBLING',
	'GRANDPARENT',
	'GRANDCHILD',
	'NONE'
] as const;
export type Kinship = (typeof KINSHIPS)[number];

/**
 * Der Bonus aus dem Stammbaum.
 *
 * Ein **Ausgangspunkt, keine Untergrenze**: Wer seine Kinder schlecht behandelt, zieht
 * die Beziehung trotz Bonus ins Negative bis zum offenen Hass. Deshalb wird hier addiert
 * und nicht nach unten begrenzt.
 */
export function kinshipBonus(kinship: Kinship): number {
	switch (kinship) {
		case 'SPOUSE':
			return 40;
		case 'PARENT':
		case 'CHILD':
			return 30;
		case 'SIBLING':
			return 20;
		case 'GRANDPARENT':
		case 'GRANDCHILD':
			return 15;
		case 'NONE':
			return 0;
	}
}

/**
 * Der Grundwert: Verwandtschaft plus Hausstand.
 *
 * Genau das, was gilt, wenn die beiden noch nie miteinander zu tun hatten — und damit
 * der Wert, auf den die Zuneigung nach langer Funkstille zurückfällt.
 */
export function baseAffection(kinship: Kinship, houseStanding: number): number {
	return kinshipBonus(kinship) + houseStanding * HOUSE_LAYER_WEIGHT;
}

/**
 * Was von einem Wert nach der verstrichenen Zeit übrig ist.
 *
 * Exponentiell über die Halbwertszeit, und das aus einem Grund, der über Geschmack
 * hinausgeht: Diese Kurve ist **zusammensetzbar**. Zweimal fünf Jahre ergeben genau
 * dasselbe wie einmal zehn. Bei einem linearen Verfall hinge das Ergebnis davon ab, wie
 * oft zwischendurch nachgerechnet wurde — und damit davon, wie oft jemand die Seite
 * aufruft.
 *
 * Bewusst **ungerundet**: Gerundet wird erst beim Schreiben, und geschrieben wird nur
 * bei einer echten Änderung. Würde hier gerundet, sammelte sich der Fehler über viele
 * Abfragen.
 */
export function decayed(value: number, elapsedTicks: number, halfLifeYears: number): number {
	if (value === 0 || elapsedTicks <= 0) return value;
	const halbwertszeit: number = halfLifeYears * TICKS_PER_YEAR;
	return value * Math.pow(0.5, elapsedTicks / halbwertszeit);
}

/**
 * Die Zuneigung, wie sie jetzt gilt.
 *
 * Grundwert plus verfallene persönliche Schicht, am Ende auf die Skala begrenzt. Die
 * Begrenzung steht ganz außen: Ein Verwandtschaftsbonus soll den Hass nicht heimlich
 * anheben, und eine Fehde nicht die Zuneigung deckeln, bevor die Person zu Wort kommt.
 */
export function affectionNow(
	personal: number,
	lastChangedTick: number,
	currentTick: number,
	kinship: Kinship,
	houseStanding: number
): number {
	const geblieben: number = decayed(
		personal,
		currentTick - lastChangedTick,
		AFFECTION_HALF_LIFE_YEARS
	);
	return clamp(baseAffection(kinship, houseStanding) + geblieben);
}

/**
 * Der Stand zweier Häuser, wie er jetzt gilt — derselbe Verfall, längeres Gedächtnis.
 */
export function standingNow(
	standing: number,
	lastChangedTick: number,
	currentTick: number
): number {
	return clamp(decayed(standing, currentTick - lastChangedTick, STANDING_HALF_LIFE_YEARS));
}

/**
 * Eine Interaktion verrechnen.
 *
 * Der bisherige Wert wird erst auf den Stand von jetzt gebracht und dann verschoben —
 * sonst käme eine Zuneigung, die seit Jahren brachliegt, mit ihrem alten Gewicht zurück,
 * sobald jemand einmal grüßt.
 */
export function changeAffection(
	personal: number,
	lastChangedTick: number,
	currentTick: number,
	delta: number
): number {
	const geblieben: number = decayed(
		personal,
		currentTick - lastChangedTick,
		AFFECTION_HALF_LIFE_YEARS
	);
	return clamp(Math.round(geblieben + delta));
}

/**
 * Wie stark eine persönliche Änderung auf das Verhältnis der Häuser abfärbt.
 *
 * Null bei kleinen Regungen — und das ist keine Ungenauigkeit, sondern die Aussage: Ein
 * Gruß auf der Straße ist keine Außenpolitik.
 */
export function houseDrift(personalDelta: number): number {
	const abdruck: number = Math.round(personalDelta * HOUSE_DRIFT_FACTOR);
	// `Math.round(-0.4)` ist `-0`. Rechnerisch dasselbe wie 0, aber `Object.is` und
	// `JSON.stringify` sehen einen Unterschied — und keine Höflichkeit soll je nach
	// Vorzeichen anders aussehen.
	return abdruck === 0 ? 0 : abdruck;
}

// --- Zeit miteinander verbringen -----------------------------------------------------

/** Was ein Besuch kostet und einbringt. */
export const SOCIALIZE_ACTION_POINT_COST = 1;
export const SOCIALIZE_AFFECTION_GAIN = 6;

/**
 * Der Ausschnitt eines Charakters, auf den es bei einer Begegnung ankommt.
 */
export interface Visitor {
	actionPoints: number;
	regionId: string;
}

export type SocializeOutcome =
	| { ok: true; actionPoints: number; delta: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Zeit mit jemandem verbringen — die einfachste freundliche Handlung.
 *
 * Bewusst klein gehalten: Sechs Punkte sind spürbar, aber weit unter der Schwelle, ab
 * der die Häuser mitziehen. Wer eine Freundschaft will, muss wiederkommen — und wer
 * Außenpolitik machen will, braucht mehr als Höflichkeit.
 *
 * Ab 4.4 setzt das Werben hierauf auf, ab 4.6 kommen Lohn und Anstellung als weitere
 * Wege dazu. Feindliche Handlungen fehlen noch mit Absicht: Sie hängen an Kämpfen und
 * Verletzungen, und das ist Punkt 6 der offenen Punkte.
 */
export function socialize(visitor: Visitor, other: { regionId: string }): SocializeOutcome {
	if (visitor.regionId !== other.regionId) {
		return { ok: false, reason: 'WRONG_REGION' };
	}
	if (visitor.actionPoints < SOCIALIZE_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}
	return {
		ok: true,
		actionPoints: visitor.actionPoints - SOCIALIZE_ACTION_POINT_COST,
		delta: SOCIALIZE_AFFECTION_GAIN
	};
}

/** Hält einen Wert auf der Skala. */
export function clamp(value: number): number {
	return Math.max(AFFECTION_MIN, Math.min(AFFECTION_MAX, value));
}

/**
 * Ein Wort für eine Zahl.
 *
 * Die Oberfläche zeigt keine Punkte: Eine Zuneigung von 37 lüde dazu ein, sie
 * auszurechnen statt sie zu pflegen — und der Wert ist ohnehin nur die halbe Wahrheit,
 * weil er nicht erwidert sein muss.
 */
export function affectionLabel(value: number): string {
	if (value <= -60) return 'Hass';
	if (value <= -25) return 'Feindschaft';
	if (value < -5) return 'Abneigung';
	if (value <= 5) return 'gleichgültig';
	if (value < 25) return 'Wohlwollen';
	if (value < 60) return 'Freundschaft';
	return 'Verbundenheit';
}
