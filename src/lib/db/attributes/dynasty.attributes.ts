import type { Optional } from 'sequelize';
import type { Dynasty } from '$lib/model/dynasty';

/**
 * Das langlebige Spielerobjekt. Ein User hat mehrere Dynastien über die Zeit — erlischt
 * eine kinderlos, beginnt er mit einer neuen —, davon aber höchstens eine ohne
 * `isExtinct`.
 */
export interface DynastyAttributes {
	id: string;
	name: string;
	UserId: string;
	isExtinct: boolean;
	foundedAtTick: number;
	extinctAtTick: number | null;
}

export type DynastyCreationAttributes = Optional<DynastyAttributes, 'isExtinct' | 'extinctAtTick'>;

export function convertToDynasty(attributes: DynastyAttributes): Dynasty {
	return {
		id: attributes.id,
		name: attributes.name,
		foundedBy: attributes.UserId,
		isExtinct: attributes.isExtinct
	};
}
