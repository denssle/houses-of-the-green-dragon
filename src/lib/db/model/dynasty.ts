import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	DynastyAttributes,
	DynastyCreationAttributes
} from '$lib/db/attributes/dynasty.attributes';
import { sequelize } from '$lib/db/sequelize';

export const Dynasty: ModelStatic<Model<DynastyAttributes, DynastyCreationAttributes>> =
	sequelize.define(
		'dynasty',
		{
			id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			name: { type: DataTypes.STRING, allowNull: false },
			UserId: { type: DataTypes.STRING, allowNull: false },
			isExtinct: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
			foundedAtTick: { type: DataTypes.INTEGER, allowNull: false },
			extinctAtTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null }
		},
		{ timestamps: true }
	);
