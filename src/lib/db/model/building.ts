import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	BuildingAttributes,
	BuildingCreationAttributes
} from '$lib/db/attributes/building.attributes';
import { OWNER_TYPES } from '$lib/db/attributes/enums';
import { sequelize } from '$lib/db/sequelize';

/** Ein frisch errichtetes Gebäude ist tadellos; von hier aus geht es abwärts. */
export const CONDITION_PERFECT = 100;

export const Building: ModelStatic<Model<BuildingAttributes, BuildingCreationAttributes>> =
	sequelize.define(
		'building',
		{
			id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			name: { type: DataTypes.STRING, allowNull: false },
			// Verweis auf die Vorlage im Code — dort stehen Preis, Aktionen und Grenzen,
			// damit Balancing-Änderungen auch den Bestand erreichen.
			optionId: { type: DataTypes.INTEGER, allowNull: false },
			level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
			condition: {
				type: DataTypes.INTEGER,
				allowNull: false,
				defaultValue: CONDITION_PERFECT
			},
			lastConditionTick: { type: DataTypes.INTEGER, allowNull: false },
			// Nullbar: Schule und Brunnen belegen ein Grundstück, eine Stadtmauer
			// umschließt die ganze Region.
			PlotId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			ownerType: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: 'CHARACTER',
				validate: { isIn: [[...OWNER_TYPES]] }
			},
			OwnerCharacterId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			forSalePrice: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null }
		},
		{ timestamps: true }
	);
