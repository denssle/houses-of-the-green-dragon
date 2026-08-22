import type { ActionFailureReason } from '$lib/game/actionFailure';

/**
 * Gesetze.
 *
 * **Ein Gesetz erfindet keine Regel, es setzt eine Zahl.** Jede Gesetzesart zeigt auf
 * eine Stellschraube, die es im Spiel ohnehin schon gibt — der Zehnt auf die Ernte, das
 * Standgeld am Markt. Der Bürgermeister verschiebt sie, mehr nicht. Der Grund ist
 * handfest: Ein Gesetz als freier Effekt wäre für jede Art ein Sonderfall im Code, und
 * nach fünf Gesetzen wüsste niemand mehr, was zusammen mit was gilt. So bleibt die Regel
 * an einer Stelle, und das Gesetz ist nur ihr Parameter.
 *
 * **Erlassen wird gespeichert, nicht der geltende Satz.** Jeder Erlass ist eine eigene
 * Zeile mit Tick und Urheber; es gilt der jüngste. Dieselbe Bauart wie beim Amt aus
 * 4.7a — und sie liefert nebenbei die Chronik: Wer hat wann die Steuern erhöht, und
 * verlor er darüber die nächste Wahl?
 */

export const LAW_KINDS = [
	'TITHE',
	'STALL_FEE',
	'SALES_TAX',
	'PROPERTY_TAX',
	'SCHOOL_FEE',
	'OFFICE_STIPEND'
] as const;
export type LawKind = (typeof LAW_KINDS)[number];

/** Prozent vom Wert oder Münzen je Stück — davon hängt ab, wie man es anzeigt. */
export type LawUnit = 'PERCENT' | 'COIN';

export interface LawRule {
	name: string;
	/** Was der Satz belastet, in einem Satz. */
	description: string;
	unit: LawUnit;
	/** Der Wert, der ohne jeden Erlass gilt — der Zustand vor 4.7b. */
	fallback: number;
	min: number;
	max: number;
}

/**
 * Die Grenzen, die auch ein Bürgermeister nicht überschreiten kann.
 *
 * Ohne sie wäre der erste Amtsinhaber, der einen Zehnt von 100 % erlässt, das Ende der
 * Wirtschaft — und zwar unwiderruflich, weil danach niemand mehr genug hat, um zu
 * handeln. Die Grenzen sind die Verfassung: Sie stehen im Code, nicht zur Abstimmung.
 * Nach unten ist überall die Null erlaubt; ein Bürgermeister darf die Stadt aushungern,
 * das ist eine politische Entscheidung und keine kaputte.
 */
export const LAW_RULES: Record<LawKind, LawRule> = {
	TITHE: {
		name: 'Zehnt',
		description: 'Anteil jeder Ernte, der an die Stadt geht',
		unit: 'PERCENT',
		fallback: 10,
		min: 0,
		max: 30
	},
	STALL_FEE: {
		name: 'Standgeld',
		description: 'Was ein Stand am Markt je Angebot kostet',
		unit: 'COIN',
		fallback: 2,
		min: 0,
		max: 20
	},
	SALES_TAX: {
		name: 'Verkaufssteuer',
		description: 'Anteil am Kaufpreis, den der Käufer zusätzlich an die Stadt zahlt',
		unit: 'PERCENT',
		fallback: 0,
		min: 0,
		max: 20
	},
	PROPERTY_TAX: {
		name: 'Grundsteuer',
		description: 'Was ein Grundstück seinen Besitzer je Spieljahr kostet',
		unit: 'COIN',
		fallback: 0,
		min: 0,
		max: 20
	},
	SCHOOL_FEE: {
		name: 'Schulgeld',
		description: 'Was ein Schultag die Eltern kostet',
		unit: 'COIN',
		fallback: 3,
		min: 0,
		max: 20
	},
	/**
	 * **Das einzige Gesetz, das Geld aus der Kasse nimmt statt hinein.** Alle anderen
	 * belasten Bürger zugunsten der Stadt; dieses belastet die Stadt zugunsten dessen, der
	 * sie führt — und ausgerechnet er setzt den Satz. Das ist kein Versehen, sondern der
	 * Reiz: Ein Bürgermeister, der sich selbst großzügig entlohnt, muss das vor der
	 * nächsten Wahl erklären, und die Tafel im Rathaus zeigt jedem, was er sich nimmt.
	 *
	 * **Warum eine Münze je Tick.** Ein Tagelohn bringt drei Münzen für einen
	 * Aktionspunkt; ein Spieljahr voller Arbeit also gut 150. Das Amt kostet nicht den
	 * ganzen Tag — höchstens eine Handlung je Tick, meist keine —, und der Satz trifft
	 * ungefähr, was diese Zeit anderswo einbrächte: rund fünfzig Münzen im Spieljahr, ein
	 * Drittel eines Arbeitsjahres. Genug, dass auch ein Armer kandidieren kann, ohne dass
	 * das Amt zum Broterwerb wird.
	 *
	 * Nach oben ist bei fünf Schluss: Das wäre mehr, als ein Vollzeitarbeiter verdient,
	 * und ab da kandidierte man fürs Geld statt fürs Gestalten. Nach unten steht wie
	 * überall die Null — eine Stadt darf beschließen, dass das Amt eine Ehre ist.
	 */
	OFFICE_STIPEND: {
		name: 'Aufwandsentschädigung',
		description: 'Was die Stadt einem gewählten Amtsinhaber je Tick zahlt',
		unit: 'COIN',
		fallback: 1,
		min: 0,
		max: 5
	}
};

/** Ein Erlass, wie ihn die Ablage hergibt. */
export interface Enactment {
	kind: LawKind;
	value: number;
	enactedTick: number;
}

/**
 * Der Satz, der jetzt gilt.
 *
 * Der jüngste Erlass — und ohne jeden Erlass der Rückfallwert. Deshalb ändert sich durch
 * 4.7b zunächst nichts: Zehnt bleibt bei zehn Prozent, Standgeld bei zwei Münzen. Erst
 * ein Bürgermeister, der etwas anderes will, macht einen Unterschied.
 */
export function currentValue(enactments: Enactment[], kind: LawKind): number {
	const passende = enactments.filter((erlass) => erlass.kind === kind);
	if (passende.length === 0) return LAW_RULES[kind].fallback;

	return passende.reduce((juengster, erlass) =>
		erlass.enactedTick > juengster.enactedTick ? erlass : juengster
	).value;
}

export type EnactmentOutcome = { ok: true } | { ok: false; reason: ActionFailureReason };

/**
 * Darf dieser Erlass ergehen?
 *
 * Nur der Amtsinhaber, nur innerhalb der Grenzen, nur ganze Zahlen. Und nicht derselbe
 * Satz noch einmal: Ein Erlass, der nichts ändert, wäre ein Eintrag in der Chronik ohne
 * Vorgang.
 */
export function canEnact(
	enacter: { isHolder: boolean },
	kind: LawKind,
	value: number,
	currently: number
): EnactmentOutcome {
	if (!enacter.isHolder) return { ok: false, reason: 'NOT_IN_OFFICE' };
	if (!Number.isInteger(value)) return { ok: false, reason: 'NOTHING_TO_DO' };

	const regel = LAW_RULES[kind];
	if (value < regel.min || value > regel.max) return { ok: false, reason: 'OUT_OF_BOUNDS' };
	if (value === currently) return { ok: false, reason: 'NOTHING_TO_DO' };

	return { ok: true };
}

/**
 * Was eine Abgabe in Münzen ausmacht.
 *
 * Abgerundet, und zwar überall dort, wo die Stadt kassiert: Ein Zehnt von 10 % auf eine
 * einzelne Rübe ist null, nicht eins. Das ist eine bewusste Bevorzugung der kleinen
 * Menge — wer im Kleinen wirtschaftet, zahlt anteilig weniger, und das ist der Unterschied
 * zwischen einer Steuer und einer Wegelagerei.
 */
export function taxOn(amount: number, percent: number): number {
	if (amount <= 0 || percent <= 0) return 0;
	return Math.floor((amount * percent) / 100);
}

/** Was ein Besitzer je Spieljahr für seine Grundstücke schuldet. */
export function propertyTaxFor(plotCount: number, ratePerPlot: number): number {
	if (plotCount <= 0 || ratePerPlot <= 0) return 0;
	return plotCount * ratePerPlot;
}

/**
 * Was tatsächlich eingezogen wird.
 *
 * Wer nicht genug hat, zahlt, was er hat — der Rest wird **erlassen** und nicht als
 * Schuld vorgetragen. Eine Steuerschuld wäre ein eigenes System (Vollstreckung,
 * Zwangsversteigerung, Schuldturm), und ohne dieses System wäre sie nur eine Zahl, die
 * wächst und nie etwas tut. Die Zwangsversteigerung ist der richtige Ort dafür, und die
 * gehört zur Erschließung von Bauland (Punkt 13).
 */
export function collectable(owed: number, money: number): number {
	return Math.max(0, Math.min(owed, money));
}
