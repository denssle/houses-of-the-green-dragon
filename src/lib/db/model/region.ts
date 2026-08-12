import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	RegionAttributes,
	RegionCreationAttributes
} from '$lib/db/attributes/region.attributes';
import { REGION_TYPES } from '$lib/db/attributes/enums';
import { sequelize } from '$lib/db/sequelize';

export const Region: ModelStatic<Model<RegionAttributes, RegionCreationAttributes>> =
	sequelize.define(
		'region',
		{
			id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			name: { type: DataTypes.STRING, allowNull: false },
			type: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [[...REGION_TYPES]] } },
			// Nur Städte führen eine Kasse; bei Umlandflächen bleibt das Feld leer.
			treasury: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null }
		},
		{ timestamps: true }
	);
