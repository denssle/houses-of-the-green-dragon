import type { BuildingOption } from '$lib/model/buildingOption';

export interface Building extends BuildingOption {
	id: number;
	belongsTo: number;
	name: string;
}