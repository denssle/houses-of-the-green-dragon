import type { Optional } from 'sequelize';
import type { RegionType } from '$lib/db/attributes/enums';

/**
 * Ein Ort auf der Karte — eine Stadt oder eine Umlandfläche.
 *
 * `treasury` führt nur eine Stadt: Steuern und Pacht fließen hinein, öffentliche
 * Gebäude und die Erschließung neuen Baulands heraus. Bei Umlandflächen bleibt das Feld
 * leer.
 */
export interface RegionAttributes {
	id: string;
	name: string;
	type: RegionType;
	treasury: number | null;
}

export type RegionCreationAttributes = Optional<RegionAttributes, 'treasury'>;
