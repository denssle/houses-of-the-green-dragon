import type { Optional } from 'sequelize';

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
