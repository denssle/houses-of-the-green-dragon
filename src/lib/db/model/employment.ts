import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	EmploymentAttributes,
	EmploymentCreationAttributes
} from '$lib/db/attributes/employment.attributes';
import { sequelize } from '$lib/db/sequelize';

export const Employment: ModelStatic<Model<EmploymentAttributes, EmploymentCreationAttributes>> =
	sequelize.define(
		'employment',
		{
			// Ein Charakter, eine Stelle.
			EmployeeCharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			BuildingId: { type: DataTypes.STRING, allowNull: false },
			wagePerActionPoint: { type: DataTypes.INTEGER, allowNull: false },
			sinceTick: { type: DataTypes.INTEGER, allowNull: false }
		},
		{ timestamps: true }
	);
