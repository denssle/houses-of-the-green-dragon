import type { EventKind } from '$lib/game/chronicle.logic';
import { LAW_RULES, type LawKind } from '$lib/game/law.logic';
import { OFFICE_NAMES, type Office } from '$lib/game/election.logic';
import { SKILL_NAMES, type SkillType } from '$lib/game/skill.logic';

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
	subject?: { name: string };
	object?: { name: string };
	building?: { name: string };
	dynasty?: { name: string };
	value: number | null;
	detail: string | null;
}

/** Was in der Chronik steht — als ganzer Satz. */
export function chronicleMessage(entry: ChronicleLine): string {
	const wer: string = entry.subject?.name ?? 'Jemand';
	const wen: string = entry.object?.name ?? 'jemanden';
	const haus: string = entry.building?.name ?? 'ein Gebäude';

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

function fach(detail: string | null): string {
	if (detail && detail in SKILL_NAMES) return SKILL_NAMES[detail as SkillType];
	return 'etwas';
}
