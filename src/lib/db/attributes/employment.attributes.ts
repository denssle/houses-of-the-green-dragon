/**
 * Ein Anstellungsverhältnis.
 *
 * Ein Charakter, eine Stelle: `EmployeeCharacterId` ist der Schlüssel. Zwei Anstellungen
 * zugleich wären kein Fehler der Welt, aber eine Buchhaltung mehr, ohne dass jemand
 * danach gefragt hätte.
 *
 * Der Lohn steht **hier** und nicht am Gebäude: Er ist zwischen Arbeitgeber und
 * Angestelltem vereinbart, und wenn der Betrieb morgen weniger bietet, gilt das für den
 * Nächsten — nicht rückwirkend für den, der schon da ist.
 */
export interface EmploymentAttributes {
	EmployeeCharacterId: string;
	BuildingId: string;
	wagePerActionPoint: number;
	sinceTick: number;
}

export type EmploymentCreationAttributes = EmploymentAttributes;
