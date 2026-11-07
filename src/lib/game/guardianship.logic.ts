import { SATIETY_COMFORTABLE, SATIETY_WEAKENED } from '$lib/game/need.logic';
import { AGE_OF_MAJORITY, ageInYears } from '$lib/game/time';

/**
 * Wer sich um eine Waise kümmert (0.7.0).
 *
 * **Warum es das braucht.** In der Hungersnot von Grünau (Oktober 2026) starben vier
 * Kinder, und alle vier hatten ihre Eltern vor ihnen verloren. Seit Punkt 84 sorgen die
 * Eltern für ihre Kinder — und nach ihrem Tod war dafür niemand mehr zuständig.
 *
 * **Die Reihenfolge ist die der Wirklichkeit:** Zuerst nimmt die Familie das Kind auf. Hat
 * es keine, die es kann, nimmt die Stadt es ins Waisenhaus und bezahlt sein Brot.
 *
 * **Waise ist, wer unter sechzehn ist**, nicht unter zwölf. Mit zwölf darf man zwar
 * arbeiten, eine feste Anstellung gibt es aber erst mit der Volljährigkeit. Eine der Toten
 * war dreizehn: alt genug, um nicht mehr zu den Kindern zu zählen, und zu jung für eine
 * Stelle.
 */

/** Das Waisenhaus — als Konstante, weil Migration, Dienst und Haushalt danach fragen. */
export const WAISENHAUS_OPTION_ID = 14;

/** Wie viele Waisen das Waisenhaus aufnimmt. */
export const WAISENHAUS_PLAETZE = 20;

/**
 * Wie viele Laibe je Waise im Lager liegen sollen.
 *
 * Zwei reichen für achtzig Ticks. Der Vorrat soll eine Stunde ohne Angebot am Markt
 * überbrücken, er soll der Stadt aber nicht das Brot wegkaufen.
 */
export const WAISEN_BROT_VORRAT = 2;

/** Unter dieser Sättigung bekommt eine Waise im Waisenhaus ihr Brot. */
export const WAISE_ISST_UNTER = SATIETY_COMFORTABLE;

/**
 * Unter dieser Sättigung holt die Stadt ein Mündel zu sich, wenn im Haushalt kein Brot liegt.
 *
 * **Das Netz unter dem Vormund.** Wer ein Kind aufnimmt, hat damit noch kein Geld: In Grünau
 * besaßen im November 14 von 26 Einwohnern keine Münze. Ohne diese Schwelle verhungerte das
 * Kind eben beim Onkel statt allein.
 */
export const MUENDEL_IN_NOT_UNTER = SATIETY_WEAKENED;

/** Noch nicht volljährig? */
export function isMinor(birthTick: number, tick: number): boolean {
	return ageInYears(birthTick, tick) < AGE_OF_MAJORITY;
}

/** Der Ausschnitt eines Menschen, aus dem sich die Verwandtschaft ablesen lässt. */
export interface Kin {
	id: string;
	motherId: string | null;
	fatherId: string | null;
	DynastyId: string | null;
}

export const NAHE = {
	GROSSELTERN: 1,
	GESCHWISTER: 2,
	ONKEL_ODER_TANTE: 3,
	HAUS: 4
} as const;

function elternVon(person: Pick<Kin, 'motherId' | 'fatherId'>): string[] {
	return [person.motherId, person.fatherId].filter((id): id is string => id !== null);
}

/**
 * Wie nah ist einer dem Kind? Kleiner heißt näher, `undefined` heißt: gar nicht verwandt.
 *
 * Halbgeschwister zählen wie Geschwister, und ein angeheirateter Onkel zählt nicht, weil
 * es von ihm aus keine Abstammungslinie zum Kind gibt. Die letzte Stufe ist das Haus: Wer
 * denselben Namen trägt, gehört zur Familie, auch wenn der gemeinsame Vorfahr lange tot ist.
 */
export function kinshipRank(kind: Kin, eltern: Kin[], kandidat: Kin): number | undefined {
	const elternIds: string[] = elternVon(kind);
	const grosseltern: string[] = eltern.flatMap(elternVon);
	const seineEltern: string[] = elternVon(kandidat);

	if (grosseltern.includes(kandidat.id)) return NAHE.GROSSELTERN;
	if (seineEltern.some((id) => elternIds.includes(id))) return NAHE.GESCHWISTER;
	if (seineEltern.some((id) => grosseltern.includes(id))) return NAHE.ONKEL_ODER_TANTE;
	if (kind.DynastyId !== null && kandidat.DynastyId === kind.DynastyId) return NAHE.HAUS;
	return undefined;
}

export interface GuardianCandidate {
	id: string;
	rank: number;
	money: number;
	birthTick: number;
}

/**
 * Wer das Kind aufnimmt: der Nächste, unter Gleichnahen der mit dem meisten Geld, dann der
 * Älteste. Die Kennung entscheidet zuletzt, damit dieselbe Lage dasselbe Ergebnis gibt.
 */
export function chooseGuardian(kandidaten: GuardianCandidate[]): string | undefined {
	return [...kandidaten].sort(
		(a, b) =>
			a.rank - b.rank || b.money - a.money || a.birthTick - b.birthTick || a.id.localeCompare(b.id)
	)[0]?.id;
}
