import type { Optional } from 'sequelize';
import type { RegionType } from '$lib/db/attributes/enums';
import type { Region } from '$lib/model/region';

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
	/** Wann zuletzt Grundsteuer erhoben wurde. Leer, solange nie erhoben wurde. */
	lastTaxTick: number | null;
	/** Was beim letzten Grundsteuertermin geschuldet war (0.10.0). Leer, solange keiner war. */
	lastTaxDue: number | null;
	/** Was davon nicht einzutreiben war (0.10.0) — der Maßstab für ein knappes Jahr. */
	lastTaxShortfall: number | null;
}

export type RegionCreationAttributes = Optional<
	RegionAttributes,
	'treasury' | 'lastTaxTick' | 'lastTaxDue' | 'lastTaxShortfall'
>;

export function convertToRegion(attributes: RegionAttributes): Region {
	return {
		id: attributes.id,
		name: attributes.name,
		type: attributes.type,
		treasury: attributes.treasury
	};
}
