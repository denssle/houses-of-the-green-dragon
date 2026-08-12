import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	DynastyRelationshipAttributes,
	DynastyRelationshipCreationAttributes
} from '$lib/db/attributes/dynastyRelationship.attributes';
import { sequelize } from '$lib/db/sequelize';

export const DynastyRelationship: ModelStatic<
	Model<DynastyRelationshipAttributes, DynastyRelationshipCreationAttributes>
> = sequelize.define(
	'dynastyRelationship',
	{
		fromDynastyId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		toDynastyId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		standing: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		lastChangedTick: { type: DataTypes.INTEGER, allowNull: false }
	},
	{ timestamps: true }
);
