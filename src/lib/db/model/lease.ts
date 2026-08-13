import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type { LeaseAttributes, LeaseCreationAttributes } from '$lib/db/attributes/lease.attributes';
import { sequelize } from '$lib/db/sequelize';

export const Lease: ModelStatic<Model<LeaseAttributes, LeaseCreationAttributes>> = sequelize.define(
	'lease',
	{
		// Eine Fläche, ein Pächter.
		PlotId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		CharacterId: { type: DataTypes.STRING, allowNull: false },
		sinceTick: { type: DataTypes.INTEGER, allowNull: false }
	},
	{ timestamps: true }
);
