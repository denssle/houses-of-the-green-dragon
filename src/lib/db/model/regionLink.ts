import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	RegionLinkAttributes,
	RegionLinkCreationAttributes
} from '$lib/db/attributes/regionLink.attributes';
import { sequelize } from '$lib/db/sequelize';

export const RegionLink: ModelStatic<Model<RegionLinkAttributes, RegionLinkCreationAttributes>> =
	sequelize.define(
		'regionLink',
		{
			fromRegionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			toRegionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			distanceInTicks: { type: DataTypes.INTEGER, allowNull: false }
		},
		{ timestamps: true }
	);
