import { AGE_OF_MAJORITY } from '$lib/game/time';
import type { SkillType } from '$lib/game/skill.logic';

/**
 * Wer von außerhalb kommt (Punkt 71).
 *
 * **Grünau war eine geschlossene Welt.** Acht Gründer, und alles Weitere sind ihre
 * Nachfahren. Das Konzept sieht Zuzug vor, aber aus anderen Städten — und es gibt nur
 * eine. Faktisch kam nie jemand hinzu, und das hatte drei Folgen:
 *
 * - **Kein Ventil nach unten.** Schrumpft die Bevölkerung, gibt es keine Erholung. Eine
 *   Stadt kann aussterben, und dann ist die Welt zu Ende.
 * - **Niemand lernt ein Handwerk, das es nicht gibt** (Punkt 70). Fertigkeiten wachsen
 *   durch Tun, getan wird, wo ein Gebäude steht — also konnten alle schmieden und niemand
 *   backen. Ein zugezogener Bäcker bringt sein Handwerk mit; so wanderte Handwerk immer.
 * - **Und es kam kein Geld in die Welt.** Das ist der Punkt, an dem der Zuzug mehr ist als
 *   Bevölkerungspolitik: Wer ankommt, bringt mit, was er anderswo verdient hat. Damit hat
 *   die Welt eine Geldquelle, die die Regel aus `KONZEPT.md` **nicht** bricht — Geld
 *   entsteht nicht aus dem Nichts, es kommt mit einem Menschen von draußen.
 *
 * **Das macht die Zuzugsrate zur Geldpolitik dieser Welt**, und das ist eine bewusste
 * Entscheidung: Zu viele Fremde bedeuten satte Bürger, die nichts mehr unternehmen; zu
 * wenige bedeuten Stillstand. Die Zahlen unten sind deshalb der erste Hebel beim
 * Balancing (Punkt 16) und keine Nebensache.
 */

/**
 * Wie wahrscheinlich es je Tick ist, dass jemand ankommt.
 *
 * Bewusst klein: Bei fünfzig Ticks im Spieljahr ist das im Mittel **einer alle zwei
 * Jahre**. „Unregelmäßig" heißt nicht selten, sondern nicht nach Uhr — mal kommen zwei
 * kurz nacheinander, mal Jahre keiner, und beides soll sich wie eine Stadt anfühlen und
 * nicht wie eine Einwohnerpumpe.
 */
export const ARRIVAL_CHANCE_PER_TICK = 0.01;

/**
 * Was ein Zuwanderer mitbringt.
 *
 * Weit mehr als ein Gründer (20–90), und das ist der **wichtigste Balancing-Wert dieser
 * Welt**: Er bestimmt, ob aus einer Ankunft ein Betrieb wird oder nur ein Esser mehr.
 *
 * **Der erste Anlauf lag zu niedrig** (80–260), und der Messlauf hat es gezeigt: Nach
 * sechshundert Ticks standen sechs Zugezogene in der Stadt, der reichste mit 203 Münzen —
 * und keiner baute. Ein Grundstück kostet 40, die billigste Werkstatt 180, dazu die
 * Rücklage fürs Brot: gut 260 muss mitbringen, wer sofort anfangen soll. Wer knapp
 * darunter ankommt, müsste den Rest erarbeiten, und genau das geht nicht, solange die
 * Stadtkasse den Tagelohn nicht decken kann (Punkt 66).
 *
 * Jetzt reicht es bei den meisten für den ersten Schritt. Das ist Absicht: **Wer die Reise
 * auf sich nimmt, kommt mit einem Vorhaben** — und nicht, um sich als Knecht zu verdingen.
 */
export const ARRIVAL_MONEY_MIN = 150;
export const ARRIVAL_MONEY_MAX = 400;

/**
 * Was ein Zuzug die Stadt kostet — und ihr einbringt (5.26).
 *
 * **Das Einzugsgeld.** Wer sich in einer Stadt niederließ, zahlte dafür; historisch war das
 * der Normalfall und die Kehrseite des Bürgerrechts. Hier ist es zugleich die Einnahme, die
 * eine junge Stadt am dringendsten braucht: Sie kommt genau dann, wenn die Stadt wächst,
 * und sie hängt nicht an einer Wirtschaft, die es noch nicht gibt.
 *
 * Ein Zehntel des Mitgebrachten — spürbar, aber kein Hindernis. Wer mit 300 Münzen
 * ankommt, zahlt 30 und kann sein Handwerk trotzdem anfangen. Eine feste Summe wäre für
 * den Armen eine Mauer und für den Reichen ein Trinkgeld.
 */
export const SETTLEMENT_FEE_SHARE = 0.1;

export function settlementFee(broughtMoney: number): number {
	return Math.floor(broughtMoney * SETTLEMENT_FEE_SHARE);
}

/**
 * Wie gut er sein Handwerk beherrscht.
 *
 * Kein Meister, aber auch kein Anfänger: Er hat es gelernt, wo er herkam. Die Stufe
 * entscheidet über den Ertrag (`yieldOf`) und darüber, welche Werkstatt er baut (5.19).
 */
export const ARRIVAL_SKILL_MIN = 2;
export const ARRIVAL_SKILL_MAX = 5;

/**
 * Ehrgeiz und Fleiß eines Zuwanderers — festgelegt, nicht gewürfelt.
 *
 * Dieselben Werte wie bei den drei Gründern in `seed.ts`, und aus demselben Grund: Ob
 * eine Stadt je einen Betrieb bekommt, darf nicht am Würfel hängen. Wer auswandert, um
 * sein Handwerk woanders auszuüben, ist per se kein Zauderer — die übrigen Achsen
 * (Mut, Gier, Geselligkeit, Verträglichkeit) bleiben dem Zufall überlassen.
 */
export const ZUZUG_EHRGEIZ = 45;
export const ZUZUG_FLEISS = 45;

/** Zwischen diesen Altern kommt jemand an — mitten im Leben, nicht als Kind. */
export const ARRIVAL_AGE_MIN = AGE_OF_MAJORITY + 2;
export const ARRIVAL_AGE_MAX = 40;

/**
 * Wie lange jemand da sein muss, bevor er wählen darf.
 *
 * **Das Bürgerrecht in seiner einfachsten Form** (Konzept, Abschnitt 16). Ohne eine solche
 * Frist wäre Zuzug nicht harmlos: Wer eine Wahl gewinnen will, siedelte Leute an, und am
 * Tag ihrer Ankunft stimmten sie für ihn. Fünf Jahre sind eine Wahlperiode — wer eine
 * ganze abgewartet hat, gehört dazu.
 *
 * Das Vollbild aus dem Konzept (Bürgerrecht als eigener Status, der auch über Eigentum
 * entscheidet) bleibt offen; dies ist der Riegel, den es vorher braucht.
 */
export const CITIZENSHIP_AFTER_YEARS = 5;

/**
 * Kommt jemand an?
 *
 * **Ohne Dach kommt niemand.** Die städtische Unterkunft fasst zwanzig; ist sie voll,
 * bremst das den Zuzug von selbst, ohne dass jemand eine Obergrenze pflegen müsste. Und
 * es ist die stimmigere Regel: Wer ankommt und nichts findet, zieht weiter.
 *
 * **`ticks` ist die Zeit, die seit dem letzten Wurf vergangen ist** (5.47). Sie steht hier,
 * weil der Takt nur einmal je Herzschlag würfelt, die Weltuhr aber nach einem Neustart
 * mehrere Stunden auf einmal vorstellt. Bis hierher fielen diese Stunden für den Zuzug
 * aus: Die Welt alterte, aber niemand konnte in ihr ankommen — und jeder Deploy kostete
 * die Stadt Ankünfte.
 *
 * **Warum das hier anders ist als beim Sterben.** „Übersprungene Zeit hat nicht
 * stattgefunden" schützt Spieler davor, dass ein Serverausfall sie etwas kostet: Niemand
 * soll sterben oder Ernte verlieren, weil der Prozess lag. Beim Zuzug gibt es nichts zu
 * schützen — er nimmt niemandem etwas, er bringt jemanden. Die Regel kostete hier nur.
 *
 * Gerechnet wird die Gegenwahrscheinlichkeit: Bei zwanzig übersprungenen Stunden kommt
 * jemand mit 18 % statt mit 1 %. **Höchstens einer je Herzschlag** — wer nach einer Woche
 * Ausfall hereinschaut, findet eine Stadt vor und keine Karawane.
 */
export function someoneArrives(roll: number, hasRoom: boolean, ticks = 1): boolean {
	if (!hasRoom) return false;
	// Der Normalfall bleibt bitgenau, was er war: `1 - (1 - 0.01) ** 1` ergibt
	// 0.010000000000000009 und nicht 0.01 — ein Wurf genau auf der Schwelle fiele damit
	// anders aus als vor 5.47. Das ist folgenlos und trotzdem falsch.
	if (ticks <= 1) return roll < ARRIVAL_CHANCE_PER_TICK;

	return roll < 1 - Math.pow(1 - ARRIVAL_CHANCE_PER_TICK, ticks);
}

/** Was der Ankommende mitbringt — aus einem Wurf je Größe. */
export function arrivalGifts(rolls: { money: number; skill: number; age: number }): {
	money: number;
	skillLevel: number;
	ageInYears: number;
} {
	const spanne = (roll: number, min: number, max: number): number =>
		min + Math.floor(roll * (max - min + 1));

	return {
		money: spanne(rolls.money, ARRIVAL_MONEY_MIN, ARRIVAL_MONEY_MAX),
		skillLevel: spanne(rolls.skill, ARRIVAL_SKILL_MIN, ARRIVAL_SKILL_MAX),
		ageInYears: spanne(rolls.age, ARRIVAL_AGE_MIN, ARRIVAL_AGE_MAX)
	};
}

/**
 * Welches Handwerk er mitbringt.
 *
 * **Was die Stadt nicht hat, geht vor.** Ein weiterer Schmied in einer Stadt voller
 * Schmiede ändert nichts; ein Bäcker in einer Stadt ohne Brot ändert alles. Deshalb wird
 * unter den fehlenden gewählt und nur ersatzweise unter allen — sonst bliebe die Lösung
 * von Punkt 70 dem Zufall überlassen.
 */
export function skillToBring(
	allSkills: readonly SkillType[],
	presentInTown: readonly SkillType[],
	roll: number
): SkillType {
	const fehlend = allSkills.filter((koennen) => !presentInTown.includes(koennen));
	const auswahl = fehlend.length > 0 ? fehlend : allSkills;
	return auswahl[Math.min(auswahl.length - 1, Math.floor(roll * auswahl.length))];
}

/**
 * **Wer allein kommt, kommt dorthin, wo er Anschluss findet** (0.9.0).
 *
 * Bis 0.8.6 war das Geschlecht ein Münzwurf. In Grünau kamen so 14 Männer und 8 Frauen,
 * jede der acht hat geheiratet — und vier Männer blieben ledig, während die Stadt keine
 * einzige ledige Frau mehr hatte. Geburten hängen an Frauen, nicht an Männern.
 *
 * Die Chance auf eine Frau ist deshalb der Anteil der ledigen Männer an allen Ledigen,
 * geglättet um je einen: ohne Ledige 50:50, bei vier ledigen Männern und keiner Frau 5 zu 6.
 */
export function arrivalGender(
	ledigeMaenner: number,
	ledigeFrauen: number,
	roll: number
): 'FEMALE' | 'MALE' {
	const frauChance: number = (ledigeMaenner + 1) / (ledigeMaenner + ledigeFrauen + 2);
	return roll < frauChance ? 'FEMALE' : 'MALE';
}

/** In welcher Gestalt jemand ankommt (0.9.0). */
export type Haushaltsform = 'ALLEIN' | 'PAAR' | 'FAMILIE' | 'GROSSFAMILIE';

/**
 * **Nicht jeder kommt allein** (0.9.0). Paare, Familien mit Kindern, und manchmal drei
 * Generationen auf einem Wagen — so zog man um. Die Hälfte kommt weiter allein, weil der
 * Einzelne das Handwerk bringt, das fehlt, und weil eine Stadt, die nur Familien bekommt,
 * keinen Heiratsmarkt mehr hat.
 */
export const HAUSHALT_GEWICHTE: Readonly<Record<Haushaltsform, number>> = {
	ALLEIN: 0.5,
	PAAR: 0.2,
	FAMILIE: 0.2,
	GROSSFAMILIE: 0.1
};

export const KINDER_MIN = 1;
export const KINDER_MAX = 3;
/** Wie alt ein mitgebrachtes Kind höchstens ist — darüber kommt es als Erwachsener. */
export const KIND_ALTER_MAX = 12;
/** Wie viel älter als der Vater seine Eltern sind. */
export const GENERATION_MIN = 20;
export const GENERATION_MAX = 28;

export type Rolle = 'HAUPT' | 'PARTNER' | 'KIND' | 'GROSSVATER' | 'GROSSMUTTER';

export interface Ankoemmling {
	rolle: Rolle;
	geschlecht: 'FEMALE' | 'MALE';
	alter: number;
}

/**
 * Wer zusammen ankommt (0.9.0) — Rollen, Geschlecht und Alter, nichts weiter.
 *
 * **Es kommt nur, wer ein Bett findet.** Passt der gewürfelte Haushalt nicht in die freien
 * Betten, schrumpft er: erst weniger Kinder, dann weniger Großeltern, dann eine kleinere
 * Form. Wer ankommt und nichts findet, zieht weiter — dieselbe Regel wie für den Einzelnen.
 *
 * In einer Familie ist der Hauptzuzügler der Mann und die Partnerin seine Frau; die
 * Großeltern sind seine Eltern. Für die Linie ist das gleich, denn alle tragen ein Haus.
 */
export function planHousehold(
	roll: () => number,
	freieBetten: number,
	ledige: { maenner: number; frauen: number }
): Ankoemmling[] {
	const spanne = (min: number, max: number): number => min + Math.floor(roll() * (max - min + 1));

	let form: Haushaltsform = 'ALLEIN';
	const wurf: number = roll();
	let summe = 0;
	for (const [kandidat, gewicht] of Object.entries(HAUSHALT_GEWICHTE) as [
		Haushaltsform,
		number
	][]) {
		summe += gewicht;
		if (wurf < summe) {
			form = kandidat;
			break;
		}
	}

	let kinder: number =
		form === 'FAMILIE' || form === 'GROSSFAMILIE' ? spanne(KINDER_MIN, KINDER_MAX) : 0;
	let grosseltern: number = form === 'GROSSFAMILIE' ? spanne(1, 2) : 0;
	const erwachsene = (): number => (form === 'ALLEIN' ? 1 : 2);

	// Schrumpfen, bis der Haushalt passt.
	while (erwachsene() + kinder + grosseltern > freieBetten) {
		if (kinder > KINDER_MIN) kinder--;
		else if (grosseltern > 0) grosseltern--;
		else if (kinder > 0) kinder--;
		else if (form !== 'ALLEIN') form = 'ALLEIN';
		else return [];
	}
	if (form === 'GROSSFAMILIE' && grosseltern === 0) form = kinder > 0 ? 'FAMILIE' : 'PAAR';
	if (form === 'FAMILIE' && kinder === 0) form = 'PAAR';

	if (form === 'ALLEIN') {
		return [
			{
				rolle: 'HAUPT',
				geschlecht: arrivalGender(ledige.maenner, ledige.frauen, roll()),
				alter: spanne(ARRIVAL_AGE_MIN, ARRIVAL_AGE_MAX)
			}
		];
	}

	// Eltern alt genug für ihr ältestes Kind: mindestens zwei Jahre über der Mündigkeit
	// bei der Geburt.
	const vater: number = spanne(ARRIVAL_AGE_MIN, ARRIVAL_AGE_MAX);
	const mutter: number = Math.max(
		ARRIVAL_AGE_MIN,
		Math.min(ARRIVAL_AGE_MAX, vater + spanne(-4, 2))
	);
	const leute: Ankoemmling[] = [
		{ rolle: 'HAUPT', geschlecht: 'MALE', alter: vater },
		{ rolle: 'PARTNER', geschlecht: 'FEMALE', alter: mutter }
	];
	const juengster: number = Math.min(vater, mutter);
	const kindHoechstens: number = Math.max(0, Math.min(KIND_ALTER_MAX, juengster - ARRIVAL_AGE_MIN));
	for (let i = 0; i < kinder; i++) {
		leute.push({
			rolle: 'KIND',
			geschlecht: roll() < 0.5 ? 'FEMALE' : 'MALE',
			alter: spanne(0, kindHoechstens)
		});
	}
	if (grosseltern > 0) {
		const opa: number = vater + spanne(GENERATION_MIN, GENERATION_MAX);
		if (grosseltern === 2) {
			leute.push({ rolle: 'GROSSVATER', geschlecht: 'MALE', alter: opa });
			leute.push({ rolle: 'GROSSMUTTER', geschlecht: 'FEMALE', alter: opa + spanne(-4, 1) });
		} else {
			// Eine verwitwete Großmutter oder ein Großvater.
			const frau: boolean = roll() < 0.5;
			leute.push({
				rolle: frau ? 'GROSSMUTTER' : 'GROSSVATER',
				geschlecht: frau ? 'FEMALE' : 'MALE',
				alter: opa
			});
		}
	}
	return leute;
}

/** Welche Form ein geplanter Haushalt hat — für Chronik, Log und Messung. */
export function formOf(leute: readonly Ankoemmling[]): Haushaltsform {
	if (leute.some((l) => l.rolle === 'GROSSVATER' || l.rolle === 'GROSSMUTTER'))
		return 'GROSSFAMILIE';
	if (leute.some((l) => l.rolle === 'KIND')) return 'FAMILIE';
	return leute.length >= 2 ? 'PAAR' : 'ALLEIN';
}
