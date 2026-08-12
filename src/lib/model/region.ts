import type { RegionType } from '$lib/db/attributes/enums';

/** Ein Ort auf der Karte. Die Kasse führt nur eine Stadt. */
export interface Region {
	id: string;
	name: string;
	type: RegionType;
	treasury: number | null;
}
