import type { Transaction } from 'sequelize';
import { Region } from '$lib/db/model/region';

/**
 * Das Kassenbuch der Stadt — jede Bewegung mit einem Grund (5.77, Punkt 101).
 *
 * **Warum es das braucht.** Seit 5.72 kennt der Messbericht eine Bilanz über die ganze
 * Welt: Bestand, Zufluss, und als Rest das unterwegs vernichtete Geld. Sie beruht auf
 * einer Identität und kam deshalb ohne Umbau aus — aber sie kennt nur **eine Zahl je
 * Richtung**. Woher das Geld kam und wohin es ging, stand nirgends.
 *
 * Was das kostet, hat der Messlauf nach 5.76 vorgeführt: Die Grundsteuer brachte auf
 * einmal 1098 statt 4780, und niemand konnte sagen, warum. Eine Vermutung hätte sich
 * leicht gefunden; belastbar war sie nicht. (Sie **war** am Ende keine Ursache, sondern
 * Streuung — Punkt 107 ist hinfällig. Das ändert nichts am Grund für dieses Buch: Erst
 * die Aufschlüsselung hat gezeigt, dass nichts zu erklären war.) In dieser Phase kam **jeder**
 * tragfähige Befund aus einer Aufschlüsselung und keiner aus einer Vermutung — der
 * stillstehende Kreis aus `idleReason` (Punkt 63), die Todesursache (5.71), die drei
 * Vermutungen über den Arbeitsmarkt, die allesamt danebenlagen.
 *
 * **Warum es ein eigenes Modul ist und keine Konvention.** Die Kasse wurde an siebzehn
 * Stellen in zehn Diensten bewegt, nach zwei Mustern (`increment` und ein gelesenes
 * `update`). Eine Regel „bitte auch mitschreiben" hätte gehalten, bis sie das erste Mal
 * jemand vergisst — und dann wäre das Buch nicht falsch, sondern unbemerkt unvollständig,
 * was schlimmer ist. Hier führt nur ein Weg an die Kasse, und wer ihn geht, bucht.
 *
 * **Dasselbe gilt beim Abschaffen**, und das war die Lehre aus 5.79: Wer eine Zahlung
 * entfernt, muss ihren Grund mitnehmen. `PUBLIC_REPAIR` blieb einmal als Karteileiche
 * stehen, nachdem die Instandsetzung aufgehört hatte, Geld zu kosten — und eine Zeile,
 * die im Bericht nie erscheint, liest sich wie „ist nie vorgekommen".
 *
 * **Warum im Speicher und nicht in einer Tabelle.** Eine Zeile je Münzbewegung wäre die
 * teuerste Schreiblast des Spiels, für eine Auskunft, die man alle paar Wochen braucht.
 * Gezählt werden deshalb nur Summen je Grund — fünfzehn Zahlen, die nichts kosten und
 * beim Neustart verschwinden. Wer eine Geschichte der Kasse will, braucht die Chronik,
 * nicht dieses Buch.
 */

/**
 * Woher das Geld kam — jeder Zufluss der Stadtkasse.
 *
 * Die Namen sind die des Spiels und nicht die der Dienste: `TITHE` kommt aus zwei
 * Diensten (der eigenen Ernte und der des Knechts), und das ist richtig so — für die
 * Frage „wovon lebt die Stadt" ist es derselbe Posten.
 */
export const KASSENZUFLUESSE = [
	/** Die Grundsteuer, je Grundstück und Spieljahr (4.7b). */
	'PROPERTY_TAX',
	/** Der Zehnt auf jede Ernte — in Münzen, denn die Kasse ist kein Kornspeicher. */
	'TITHE',
	/** Standgeld für einen Marktstand (5.20). */
	'STALL_FEE',
	/** Die Handelssteuer, die der Käufer obendrauf zahlt. */
	'SALES_TAX',
	/** Erstverkauf von Bauland zum Festpreis. */
	'PLOT_SALE',
	/** Die Pacht einer Abbaufläche. */
	'LEASE_FEE',
	/** Das Einzugsgeld eines Zugezogenen (5.24). */
	'SETTLEMENT_FEE',
	/** Schulgeld — ein Gesetz, kein Preis (4.7e). */
	'SCHOOL_FEE',
	/** Der Zuschlag einer Versteigerung (5.42). */
	'AUCTION',
	/** Erbenloser Nachlass, der der Stadt zufällt (Punkt 79). */
	'ESCHEAT'
] as const;

/**
 * Wohin es ging — und ob jemand es bekommt.
 *
 * **Die zweite Frage ist die wichtigere — und seit 5.93 hat sie zum ersten Mal überall
 * dieselbe Antwort:** Jede Ausgabe der Stadtkasse kommt bei einem Menschen an. `PUBLIC_BUILD`
 * war die letzte, die es nicht tat (Punkt 102); seit der öffentliche Bau ein Rohbau ist,
 * zahlt die Stadt auch dafür Löhne statt eines Preises.
 *
 * **`GRANARY` ist mit 5.102 gefallen** (Punkt 85): Den städtischen Kornspeicher, der Brot
 * aus dem Nichts verkaufte, gibt es nicht mehr — und mit der Einnahme ist ihr Grund
 * gegangen. Im letzten Lauf mit ihm brachte er noch 660 Münzen, die Grundsteuer 4447.
 *
 * **`DEVELOPMENT` und `PUBLIC_BUILD` sind aus demselben Grund gestrichen** (5.92 und
 * 5.93, Punkt 102): Weder Erschließung noch öffentlicher Bau kosten noch Münzen, beide
 * kosten zwanzig Schichten Arbeit — und was die Stadt dafür zahlt, ist Lohn an einen
 * Menschen und wird als `WAGE` gebucht.
 *
 * **`PUBLIC_REPAIR` stand hier bis 5.79 und ist ersatzlos gestrichen.** Seit 5.78 kostet
 * Instandsetzen keine Münze mehr, sondern Aktionspunkte; die Buchung entfiel mit der
 * Zahlung, und der Grund blieb als Karteileiche zurück. Ein Kassenbuch mit einem Posten,
 * den nichts je bucht, ist genau der Fehler, vor dem der Kopf dieser Datei warnt: nicht
 * falsch, sondern unbemerkt unvollständig — und im Messbericht sieht eine fehlende Zeile
 * aus wie „ist nie vorgekommen". Genau das ist einmal passiert: Der Bericht nach 5.78
 * schwieg zur Instandsetzung, und das wurde als „kein Bürgermeister hat je repariert"
 * gelesen. Wenn die Stadt für Instandsetzung zahlt, tut sie es über den Tagelohn, und der
 * ist `WAGE`.
 */
export const KASSENABFLUESSE = [
	/** Lohn an einen Bürger — Tagelohn an städtischen Bauten, Sold der Wache. */
	'WAGE',
	/** Die Aufwandsentschädigung an einen Amtsinhaber (4.7b). */
	'STIPEND'
] as const;

export type Kassenzufluss = (typeof KASSENZUFLUESSE)[number];
export type Kassenabfluss = (typeof KASSENABFLUESSE)[number];
export type Kassengrund = Kassenzufluss | Kassenabfluss;

/**
 * Wohin Geld fließt, ohne bei jemandem anzukommen.
 *
 * **Diese Liste ist seit 5.93 leer, und das ist der Punkt** (Punkt 102). Sie hat vier
 * Einträge gehabt: den privaten Bau, den Auftrag, den Ausbau — und zuletzt Erschließung
 * und öffentlichen Bau. Jeder davon ist zu Arbeit geworden, und Arbeit hat einen
 * Empfänger.
 *
 * **Sie bleibt trotzdem stehen.** Punkt 66 hat 2026 festgehalten, dass Geld den Besitzer
 * wechselt und nicht entsteht; die Gegenrichtung stand nie dabei — es darf auch nicht
 * verschwinden. Wer hier einen Grund einträgt, sagt damit: Dieses Geld ist aus der Welt.
 * Die leere Liste ist die Aussage, dass es zurzeit keinen solchen Grund gibt, und kein
 * Versehen.
 */
const OHNE_EMPFAENGER: readonly Kassenabfluss[] = [];

/** Bekommt bei dieser Ausgabe ein Mensch das Geld? */
export function hatEmpfaenger(grund: Kassenabfluss): boolean {
	return !OHNE_EMPFAENGER.includes(grund);
}

export interface Kassenbuch {
	zufluss: Partial<Record<Kassenzufluss, number>>;
	abfluss: Partial<Record<Kassenabfluss, number>>;
}

const buch: Kassenbuch = { zufluss: {}, abfluss: {} };

function istZufluss(grund: Kassengrund): grund is Kassenzufluss {
	return (KASSENZUFLUESSE as readonly string[]).includes(grund);
}

/**
 * Geld in die Stadtkasse — mit dem Grund, aus dem es kommt.
 *
 * `betrag` ist immer positiv; die Richtung sagt der Grund. Null und weniger tut nichts:
 * Ein Zehnt von null Münzen ist keine Buchung, und mehrere Aufrufer prüfen das heute
 * selbst — eine Prüfung an einer Stelle ist billiger als elf.
 */
export async function einnehmen(
	regionId: string,
	betrag: number,
	grund: Kassenzufluss,
	t?: Transaction
): Promise<void> {
	await bewege(regionId, betrag, grund, t);
}

/**
 * Geld aus der Stadtkasse — mit dem Grund, für den es ausgegeben wird.
 *
 * **Die Deckung prüft der Aufrufer.** Das ist Absicht: Wer ausgibt, weiß, was geschehen
 * soll, wenn die Kasse leer ist — die Aufwandsentschädigung zahlt anteilig aus, ein
 * öffentlicher Bau unterbleibt ganz. Diese Entscheidung hier zu treffen hieße, sie allen
 * abzunehmen.
 */
export async function ausgeben(
	regionId: string,
	betrag: number,
	grund: Kassenabfluss,
	t?: Transaction
): Promise<void> {
	await bewege(regionId, betrag, grund, t);
}

async function bewege(
	regionId: string,
	betrag: number,
	grund: Kassengrund,
	t?: Transaction
): Promise<void> {
	if (!(betrag > 0)) return;

	// **`increment` und nicht ein gelesenes `update`.** Mehrere der abgelösten Stellen
	// lasen die Kasse, rechneten und schrieben die Summe zurück; das ist nur unter einer
	// Sperre richtig, und ob eine gehalten wurde, musste man je Stelle nachsehen. Ein
	// Schritt um einen Betrag ist es immer.
	await Region.increment('treasury', {
		by: istZufluss(grund) ? betrag : -betrag,
		where: { id: regionId },
		...(t ? { transaction: t } : {})
	});

	if (istZufluss(grund)) {
		buch.zufluss[grund] = (buch.zufluss[grund] ?? 0) + betrag;
	} else {
		buch.abfluss[grund] = (buch.abfluss[grund] ?? 0) + betrag;
	}
}

/**
 * Das Buch, wie es gerade steht.
 *
 * Eine Kopie: Wer misst, soll nicht versehentlich buchen können.
 */
export function kassenbuch(): Kassenbuch {
	return { zufluss: { ...buch.zufluss }, abfluss: { ...buch.abfluss } };
}

/**
 * Das Buch leeren — für den Messlauf, der bei null anfangen will.
 *
 * Im Betrieb ruft das niemand: Dort zählt es seit dem letzten Serverstart mit, und das
 * ist eine brauchbare Auskunft, solange man weiß, worauf sie sich bezieht.
 */
export function kassenbuchLeeren(): void {
	buch.zufluss = {};
	buch.abfluss = {};
}
