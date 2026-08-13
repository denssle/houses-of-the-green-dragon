import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type { LawAttributes, LawCreationAttributes } from '$lib/db/attributes/law.attributes';
import { LAW_KINDS } from '$lib/game/law.logic';
import { sequelize } from '$lib/db/sequelize';

export const Law: ModelStatic<Model<LawAttributes, LawCreationAttributes>> = sequelize.define(
	'law',
	{
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		RegionId: { type: DataTypes.STRING, allowNull: false },
		kind: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [[...LAW_KINDS]] } },
		value: { type: DataTypes.INTEGER, allowNull: false },
		enactedTick: { type: DataTypes.INTEGER, allowNull: false },
		EnactedByCharacterId: { type: DataTypes.STRING, allowNull: true, defaultValue: null }
	},
	{ timestamps: true }
);
