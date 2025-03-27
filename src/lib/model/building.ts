import type { BuildingTemplate } from '$lib/model/buildingTemplate';

export interface Building extends BuildingTemplate {
	id: number;
	belongsTo: number;
	name: string;
}