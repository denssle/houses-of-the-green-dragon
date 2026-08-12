import { Region as RegionModel } from '$lib/db/model/region';
import type { Region } from '$lib/model/region';
import { convertToRegion } from '$lib/db/attributes/region.attributes';

export async function getRegion(regionId: string): Promise<Region | undefined> {
	const gefunden = await RegionModel.findByPk(regionId);
	return gefunden ? convertToRegion(gefunden.dataValues) : undefined;
}
