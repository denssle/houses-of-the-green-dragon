import type { BuildingAction } from '$lib/model/buildingAction';

export interface BuildingTemplate {
	optionId: number;
	initialName: string;
	price: number;
	description: string;
	type: 'PUBLIC' | 'RESIDENCE' | 'CRAFT';
	limited: boolean;
	limitedTo: number;
	actions: BuildingAction[];
	/**
	 * Was der Betrieb je eingesetztem Aktionspunkt zahlt. Fehlt der Wert, ist das Gebäude
	 * kein Arbeitsplatz. Der Lohn steht hier und nicht als Konstante in der Logik, damit
	 * die Schmiede mehr zahlen kann als die Kate — und damit eine Balancing-Änderung
	 * sofort für alle Betriebe gilt, auch für längst gebaute.
	 */
	wagePerActionPoint?: number;
	/**
	 * Wie viele Menschen hier wohnen koennen. Fehlt der Wert, ist das Gebaeude kein
	 * Zuhause. Die Zahl ist die Bremse der Bevoelkerung: Kinder kommen nur, wo Platz ist
	 * (siehe family.logic.ts) — wer wachsen will, muss ausbauen.
	 */
	residents?: number;
}
