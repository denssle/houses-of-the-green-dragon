import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	InventoryAttributes,
	InventoryCreationAttributes
} from '$lib/db/attributes/inventory.attributes';
import { sequelize } from '$lib/db/sequelize';

export const Inventory: ModelStatic<Model<InventoryAttributes, InventoryCreationAttributes>> =
	sequelize.define(
		'inventory',
		{
			// Besitzer und Ware bilden zusammen den Schlüssel: eine Zeile je Sorte.
			CharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			itemId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
		},
		{ timestamps: true }
	);
