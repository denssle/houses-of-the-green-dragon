import type { EventKind } from '$lib/game/chronicle.logic';
import { LAW_RULES, type LawKind } from '$lib/game/law.logic';
import { OFFICE_NAMES, type Office } from '$lib/game/election.logic';
import { SKILL_NAMES, type SkillType } from '$lib/game/skill.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';

/**
 * Die Sätze zur Chronik.
 *
 * Getrennt von der Ablage: Dort steht eine Zeile aus Kennungen, hier entsteht der Satz.
 * Dieselbe Trennung wie bei `actionMessage.ts` und aus demselben Grund — sonst fröre jeder
 * Eintrag seine damalige Formulierung ein, und ein umbenannter Charakter hieße in der
 * Chronik für immer anders.
 */

export interface ChronicleLine {
	kind: EventKind;
	subject?: { id?: string; name: string };
	object?: { id?: string; name: string };
	building?: { id?: string; name: string };
	dynasty?: { name: string };
	value: number | null;
	detail: string | null;
}

/**
 * Die Stellen im Satz, an denen jemand oder etwas genannt wird.
 *
 * Der Satz wird einmal gebaut — mit Platzhaltern statt Namen. Wer ihn als Text braucht,
 * bekommt die Namen eingesetzt; wer ihn anzeigen will, bekommt ihn in Stücken und kann
 * die Genannten verlinken. Zwei Fassungen desselben Satzes nebeneinander zu pflegen wäre
 * die Alternative gewesen, und sie liefen auseinander, sobald jemand eine Formulierung
 * ändert.
 *
 * Steuerzeichen als Platzhalter, weil sie in keinem Namen vorkommen können.
 */
const PLATZ = { subject: '\u0001', object: '\u0002', building: '\u0003' } as const;

/** Ein Stück eines Chroniksatzes: entweder Text oder jemand, den man aufsuchen kann. */
export type ChroniclePart =
	| { text: string }
	| { name: string; target: 'character' | 'building'; id?: string };

/** Was in der Chronik steht — als ganzer Satz. */
export function chronicleMessage(entry: ChronicleLine): string {
	return satz(entry)
		.split(/([\u0001\u0002\u0003])/)
		.map((stueck) => {
			if (stueck === PLATZ.subject) return entry.subject?.name ?? 'Jemand';
			if (stueck === PLATZ.object) return entry.object?.name ?? 'jemanden';
			if (stueck === PLATZ.building) return entry.building?.name ?? 'ein Gebäude';
			return stueck;
		})
		.join('');
}

/**
 * Derselbe Satz, aber in Stücken — damit die Anzeige die Genannten verlinken kann.
 *
 * Leere Stücke fallen weg: Steht ein Platzhalter am Satzanfang, liefert `split` davor
 * eine leere Zeichenkette, und die als eigenes Stück auszugeben wäre nur Ballast.
 */
export function chronicleParts(entry: ChronicleLine): ChroniclePart[] {
	return satz(entry)
		.split(/([\u0001\u0002\u0003])/)
		.filter((stueck) => stueck !== '')
		.map((stueck): ChroniclePart => {
			if (stueck === PLATZ.subject) {
				return {
					name: entry.subject?.name ?? 'Jemand',
					target: 'character',
					id: entry.subject?.id
				};
			}
			if (stueck === PLATZ.object) {
				return {
					name: entry.object?.name ?? 'jemanden',
					target: 'character',
					id: entry.object?.id
				};
			}
			if (stueck === PLATZ.building) {
				return {
					name: entry.building?.name ?? 'ein Gebäude',
					target: 'building',
					id: entry.building?.id
				};
			}
			return { text: stueck };
		});
}

function satz(entry: ChronicleLine): string {
	const wer: string = PLATZ.subject;
	const wen: string = PLATZ.object;
	const haus: string = PLATZ.building;

	switch (entry.kind) {
		case 'BIRTH':
			return entry.object
				? `${wer} ist zur Welt gekommen, Kind von ${wen}.`
				: `${wer} ist zur Welt gekommen.`;
		case 'MARRIAGE':
			return `${wer} und ${wen} haben geheiratet.`;
		case 'DEATH':
			return entry.value === null
				? `${wer} ist gestorben.`
				: `${wer} ist mit ${entry.value} Jahren gestorben.`;
		case 'INHERITANCE':
			return `${wen} hat ${wer} beerbt.`;
		case 'DYNASTY_EXTINCT':
			return `Das Haus ${entry.dynasty?.name ?? 'eines Verstorbenen'} ist erloschen.`;
		case 'ELECTION_OPENED':
			return `Eine Wahl zum ${amt(entry.detail)} ist ausgerufen.`;
		case 'ELECTION_CLOSED':
			return entry.subject
				? `${wer} ist zum ${amt(entry.detail)} gewählt — mit ${entry.value ?? 0} Stimmen.`
				: `Die Wahl zum ${amt(entry.detail)} ging ohne Ergebnis aus.`;
		case 'LAW_ENACTED':
			return `${wer} hat ${gesetz(entry.detail)} auf ${entry.value ?? 0} gesetzt.`;
		case 'BUILDING_BUILT':
			return `${haus} wurde errichtet${entry.subject ? ` — von ${wer}` : ''}.`;
		case 'BUILDING_RENOVATED':
			return `${wer} hat ${haus} herrichten lassen (${entry.value ?? 0} Münzen).`;
		case 'BUILDING_RUINED':
			return `${haus} ist zur Ruine verfallen.`;
		case 'JOB_TAKEN':
			return `${wer} hat eine Stelle in ${haus} angetreten.`;
		case 'JOB_ENDED':
			return `${wer} arbeitet nicht mehr in ${haus}.`;
		case 'RAID':
			// Was geraubt wurde, sagt `detail`: eine Ware, „Münzen" oder die Stadtkasse.
			if (entry.detail === 'TREASURY') {
				return `Räuber haben die Stadtkasse geplündert — ${entry.value ?? 0} Münzen.`;
			}
			if (entry.building) {
				return `In ${haus} wurde eingebrochen: ${entry.value ?? 0} ${beute(entry.detail)}.`;
			}
			return `${wer} wurde überfallen und um ${entry.value ?? 0} ${beute(entry.detail)} gebracht.`;
		case 'FIRE':
			return `In ${haus} hat es gebrannt — der Zustand fiel um ${entry.value ?? 0}.`;
		case 'LAND_DEVELOPED':
			return `${wer} hat ${entry.value ?? 0} neue Grundstücke ausweisen lassen.`;
		case 'AUCTION_WON':
			return `${wer} hat ein Grundstück ersteigert — für ${entry.value ?? 0} Münzen.`;
		case 'SCHOOL_ATTENDED':
			// Über den Lehrer und nicht über das Haus: „in Schule" bräuchte einen Artikel,
			// und der hinge am Namen, den der Bürgermeister vergeben hat.
			return `${wer} hat bei ${wen} ${fach(entry.detail)} gelernt.`;
	}
}

function amt(detail: string | null): string {
	if (detail && detail in OFFICE_NAMES) return OFFICE_NAMES[detail as Office];
	return 'Amt';
}

function gesetz(detail: string | null): string {
	if (detail && detail in LAW_RULES) return LAW_RULES[detail as LawKind].name;
	return 'ein Gesetz';
}

/** Was erbeutet wurde — Münzen oder eine Ware aus dem Katalog. */
function beute(detail: string | null): string {
	if (!detail || detail === 'MONEY') return 'Münzen';
	return getItemTemplate(detail)?.name ?? 'Waren';
}

function fach(detail: string | null): string {
	if (detail && detail in SKILL_NAMES) return SKILL_NAMES[detail as SkillType];
	return 'etwas';
}
