import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type { PlotAttributes, PlotCreationAttributes } from '$lib/db/attributes/plot.attributes';
import { OWNER_TYPES, PLOT_TYPES, RESOURCE_TYPES } from '$lib/db/attributes/enums';
import { sequelize } from '$lib/db/sequelize';

export const Plot: ModelStatic<Model<PlotAttributes, PlotCreationAttributes>> = sequelize.define(
	'plot',
	{
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		// Die Lage als sprechender Name — „Am Markt 3“ statt einer Koordinate.
		address: { type: DataTypes.STRING, allowNull: false },
		type: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [[...PLOT_TYPES]] } },
		// Nur bei Abbauflächen gesetzt.
		resourceType: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: null,
			validate: { isIn: [[...RESOURCE_TYPES]] }
		},
		RegionId: { type: DataTypes.STRING, allowNull: false },
		// Ausdrücklich statt aus einem leeren Fremdschlüssel erschlossen: Ein Grundstück
		// ohne `OwnerCharacterId` kann Gemeingut der Stadt oder nie vergeben sein.
		ownerType: {
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: 'NONE',
			validate: { isIn: [[...OWNER_TYPES]] }
		},
		OwnerCharacterId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		// Gesetzt heißt: steht zum Verkauf. Verkaufen ist ein Preis, kein Auktionsobjekt.
		forSalePrice: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null }
	},
	{ timestamps: true }
);
