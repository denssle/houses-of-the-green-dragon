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
}
