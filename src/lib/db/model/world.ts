import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type { WorldAttributes, WorldCreationAttributes } from '$lib/db/attributes/world.attributes';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { sequelize } from '$lib/db/sequelize';

export const World: ModelStatic<Model<WorldAttributes, WorldCreationAttributes>> = sequelize.define(
	'world',
	{
		// Feste id: Die Weltzeit steht in genau einer Zeile, und ein Primärschlüssel mit
		// festem Wert macht ein versehentliches Duplikat unmöglich.
		id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, defaultValue: WORLD_ID },
		currentTick: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		lastTickAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
	},
	{ timestamps: false }
);
