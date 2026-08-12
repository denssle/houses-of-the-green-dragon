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
}
