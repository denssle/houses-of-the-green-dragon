import type { Personality } from '$lib/game/personality.logic';
import { LAW_RULES, type LawKind } from '$lib/game/law.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Was ein Bürgermeister von sich aus tut.
 *
 * **Eine Stadt hat Bedürfnisse wie ein Mensch**, und sie lassen sich in derselben Weise
 * ordnen wie die eines NPCs (siehe `npc.logic.ts`): erst das Nötige, dann das Nützliche,
 * dann das Wünschenswerte. Wer regiert, arbeitet diese Liste von oben ab — und wer sie
 * nicht abarbeitet, verliert bei der nächsten Wahl.
 *
 * Das gilt für NPCs im Amt. Ein Spieler bekommt diese Hilfe nicht: Er soll selbst
 * entscheiden, sonst wäre das Amt eine Schaltfläche, die erledigt, was ohnehin geschieht.
 */

export const MAYOR_ACTIONS = [
	'PAY_WAGE',
	'REPAIR',
	'BUILD_PUBLIC',
	'DEVELOP_LAND',
	'SET_TAX',
	'NOTHING'
] as const;
export type MayorAction = (typeof MAYOR_ACTIONS)[number];

/** Die Lage der Stadt, aus der heraus entschieden wird. */
export interface CityState {
	personality: Personality;
	treasury: number;
	/**
	 * Steht in einem städtischen Haus eine Stelle offen, für die kein Sold aushängt?
	 *
	 * Bis 5.14 fragte das nur nach dem Wachhaus — und die städtische Schmiede stand
	 * deshalb seit dem ersten Tag der Welt ohne Schmied da: Für sie hing nie ein Aushang
	 * aus, also konnte sich niemand bewerben. Ein Arbeitsplatz, den die Stadt besitzt,
	 * aber nie ausschreibt, ist eine Kulisse.
	 */
	unstaffedWorkplace: boolean;
	/** Verfällt ein öffentlicher Bau? */
	repairNeeded: boolean;
	repairCost: number;
	/** Fehlt ein öffentlicher Bau, der jetzt schon wirkt? */
	missingBuildingPrice: number | null;
	/** Ist die Stadt ohne freies Bauland? */
	landExhausted: boolean;
	developmentCost: number;
	/** Die geltenden Sätze der Steuern, an denen ein Amtsinhaber drehen darf. */
	rates: Record<NpcMayorLaw, number>;
	/**
	 * **Wie viele davon betroffen wären** — die Bemessungsgrundlage je Steuer: Grundstücke
	 * in Bürgerhand für die Grundsteuer, laufende Pachten für den Zehnt.
	 *
	 * Ohne sie drehte ein Bürgermeister an einer Steuer, die niemanden erreicht. Genau das
	 * war der Zustand bis 5.71 (Punkt 96): Der Zehnt war das einzige Gesetz, das ein NPC
	 * anfassen konnte, er greift auf die Ernte einer Pacht — und in vierzig gemessenen
	 * Spieljahren gab es davon eine. Die Kasse stand durchgehend auf null, während das Amt
	 * jeden Tick aufs Neue die Steuern erhöhte.
	 */
	taxBase: Record<NpcMayorLaw, number>;
	/**
	 * Seit wie vielen Ticks der geltende Satz in Kraft ist — `Infinity`, wenn nie jemand
	 * etwas erlassen hat. Siehe `TAX_EFFECT_DELAY`.
	 */
	rateAgeInTicks: Record<NpcMayorLaw, number>;
}

/**
 * Wie viel die Stadt in der Kasse behalten will.
 *
 * Löhne und Instandhaltung laufen weiter, auch wenn gerade nichts eingeht — eine Stadt,
 * die alles verbaut, kann ihre Wache nächste Woche nicht bezahlen. Gerechnet in
 * Erschließungskosten, damit die Zahl mit den Preisen mitwandert statt eine Konstante zu
 * sein, die beim ersten Balancing danebenliegt.
 */
export const TREASURY_RESERVE_FACTOR = 2;

export function treasuryReserve(developmentCost: number): number {
	return developmentCost * TREASURY_RESERVE_FACTOR;
}

/**
 * **Woran ein Bürgermeister drehen darf.**
 *
 * Bis 5.71 war es eines: der Zehnt. Das las sich sparsam und war eine Sperre — der Zehnt
 * greift auf die Ernte einer Pacht, und eine Stadt, in der niemand pachtet, konnte ihre
 * Kasse mit keinem Mittel füllen, das ihr zur Verfügung stand. Die Grundsteuer dagegen
 * trifft jeden Grundbesitzer einmal im Spieljahr und steht schon im Gesetzbuch; sie war
 * nur für niemanden erreichbar, weil ihr Startsatz null ist und ein Spieler im Amt der
 * einzige war, der ihn hätte ändern können.
 *
 * **Der Startsatz bleibt null.** Eine Welt beginnt ohne Grundsteuer, und wer sie einführt,
 * muss sich dafür verantworten — das ist der Unterschied zwischen einer Vorgabe der Welt
 * und einer Entscheidung. Ein Spieler im Amt kann sie ebenso wieder abschaffen.
 */
export const NPC_MAYOR_LAWS = ['PROPERTY_TAX', 'TITHE'] as const satisfies readonly LawKind[];
export type NpcMayorLaw = (typeof NPC_MAYOR_LAWS)[number];

/**
 * Ab wann ein Bürgermeister die Steuern anhebt.
 *
 * Wenn die Kasse nicht einmal die Rücklage hergibt. Und er senkt sie wieder, wenn sie das
 * Vielfache davon hält — eine Stadt, die hortet, nimmt ihren Bürgern Geld ab, das sie
 * besser selbst ausgäben.
 */
export const TAX_RAISE_STEP = 5;

/**
 * **Ein Anteil springt in Fünfern, eine Münze nicht.**
 *
 * Fünf Prozent mehr Zehnt sind ein Schritt, fünf Münzen mehr Grundsteuer sind ein
 * Vermögen: Ein Grundstück kostet vierzig, und ein Einwohner hat im Messlauf gut vierzig
 * in der Tasche. Weil die Kasse ihre Rücklage selten erreicht, dreht das Amt fast in jedem
 * Tick — in Fünfern wäre die Grundsteuer binnen vier Amtshandlungen am Anschlag und die
 * Stadt ausgepresst.
 */
export const TAX_RAISE_STEP_COIN = 1;

export function taxStep(kind: NpcMayorLaw): number {
	return LAW_RULES[kind].unit === 'COIN' ? TAX_RAISE_STEP_COIN : TAX_RAISE_STEP;
}

/**
 * **Wie lange eine Steueränderung wirken muss, ehe man wieder an ihr dreht.**
 *
 * Der Fehler, den erst der Testlauf zeigte (5.71): Ein Bürgermeister entscheidet
 * **stündlich**, die Grundsteuer wird **jährlich** eingezogen. Ohne Frist erhöht er sie
 * zwanzigmal, bevor die erste Münze daraus ankommt — die Kasse steht ja weiter unter der
 * Rücklage —, und steht binnen zwanzig Ticks beim Höchstsatz. Zwanzig Münzen je
 * Grundstück und Spieljahr gegen einen Tagelohn von drei ist keine Steuer mehr; in
 * `worldComesAlive` ist daran jemand verhungert.
 *
 * Die Regel dagegen ist keine Zahl, sondern ein Satz: **Man dreht nicht wieder, bevor man
 * gesehen hat, was die letzte Drehung bewirkt hat.** Der Zehnt braucht deshalb keine
 * Frist — er greift bei jeder Ernte, seine Wirkung ist sofort da.
 */
export const TAX_EFFECT_DELAY: Record<NpcMayorLaw, number> = {
	PROPERTY_TAX: TICKS_PER_YEAR,
	TITHE: 0
};

export interface TaxChange {
	kind: NpcMayorLaw;
	value: number;
}

/**
 * An welcher Steuer gedreht wird und wohin.
 *
 * **An der, die trägt.** Gewählt wird nach der Bemessungsgrundlage: Wo elf Grundstücke in
 * Bürgerhand sind und eine Pacht läuft, ist die Grundsteuer das Mittel und der Zehnt eine
 * Geste. Steuern ohne Betroffene bleiben unangetastet — sie brächten nichts ein und
 * ärgerten trotzdem jemanden, sobald es ihn gibt.
 *
 * In beide Richtungen derselbe Hebel: Wer die Stadt trägt, dem wird auch als Erstem
 * abgenommen, wenn die Kasse überläuft.
 *
 * **Und nicht, ehe die letzte Änderung gewirkt hat** — siehe `TAX_EFFECT_DELAY`.
 */
export function nextTaxChange(state: CityState): TaxChange | undefined {
	const ruecklage: number = treasuryReserve(state.developmentCost);
	const knapp: boolean = state.treasury < ruecklage;
	const ueppig: boolean = state.treasury > ruecklage * 4;
	if (!knapp && !ueppig) return undefined;

	const hebel = NPC_MAYOR_LAWS.filter(
		(kind) => state.taxBase[kind] > 0 && state.rateAgeInTicks[kind] >= TAX_EFFECT_DELAY[kind]
	).sort((a, b) => state.taxBase[b] - state.taxBase[a]);

	for (const kind of hebel) {
		const grenzen = LAW_RULES[kind];
		const satz: number = state.rates[kind];
		const schritt: number = taxStep(kind);

		if (knapp && satz < grenzen.max) {
			return { kind, value: Math.min(grenzen.max, satz + schritt) };
		}
		if (ueppig && satz > grenzen.min) {
			return { kind, value: Math.max(grenzen.min, satz - schritt) };
		}
	}
	return undefined;
}

/**
 * Die Entscheidung.
 *
 * Die Rangfolge ist dieselbe Idee wie beim Einwohner: **erst was trägt, dann was
 * wächst.** Eine Stadt mit unbesetzten Werkstätten und verfallenen Bauten verliert
 * Ertrag, eine ohne Bauland kann nicht wachsen — und die Steuer ist das Mittel, nicht der
 * Zweck: Sie kommt zuletzt, wenn das Geld für all das nicht reicht.
 *
 * Bis 5.40 stand hier „erst was schützt": Das galt der Wache gegen die Räuber, und beide
 * sind vorerst aus dem Spiel.
 */
export function decideMayorAction(state: CityState): MayorAction {
	const ruecklage: number = treasuryReserve(state.developmentCost);

	// 1. Die Stellen besetzen, die die Stadt zu vergeben hat. Eine Schmiede ohne Schmied
	//    stellt nichts her, obwohl die Stadt sie bezahlt hat. Steht ganz oben, weil es
	//    nichts kostet außer dem Aushang — der Lohn fließt erst, wenn jemand annimmt und
	//    arbeitet.
	if (state.unstaffedWorkplace) return 'PAY_WAGE';

	// 2. Erhalten, was steht. Billiger als neu bauen, und der Verfall frisst still.
	if (state.repairNeeded && state.treasury >= state.repairCost) return 'REPAIR';

	// 3. Bauen, was fehlt — aber nur über der Rücklage: Löhne und Instandhaltung laufen
	//    weiter.
	if (
		state.missingBuildingPrice !== null &&
		state.treasury - state.missingBuildingPrice >= ruecklage
	) {
		return 'BUILD_PUBLIC';
	}

	// 4. Land erschließen, wenn keines mehr frei ist. Die Versteigerung bringt es zurück,
	//    aber erst später — deshalb nach dem Bauen.
	if (state.landExhausted && state.treasury - state.developmentCost >= ruecklage) {
		return 'DEVELOP_LAND';
	}

	// 5. An der Steuer drehen. Zuletzt, weil sie andere trifft: Wer sie anhebt, nimmt
	//    seinen Wählern etwas weg — und wird daran gemessen.
	if (nextTaxChange(state) !== undefined) return 'SET_TAX';

	return 'NOTHING';
}
