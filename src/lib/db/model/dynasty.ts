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
			// **Nullbar seit 5.10:** Ein Haus ohne Benutzer ist eine Familie, die niemand
			// spielt — die Fremd-NPCs der Startwelt, und ein Haus, dessen Konto gelöscht
			// wurde (5.9). Damit gehört jeder Charakter zu einem Haus und trägt dessen Namen.
			UserId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			isExtinct: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
			foundedAtTick: { type: DataTypes.INTEGER, allowNull: false },
			extinctAtTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null }
		},
		{ timestamps: true }
	);
