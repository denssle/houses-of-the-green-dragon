import type { BuildingTemplate } from '$lib/model/buildingTemplate';

export interface Building extends BuildingTemplate {
	id: bigint;
	belongsTo: bigint;
	name: string;
}