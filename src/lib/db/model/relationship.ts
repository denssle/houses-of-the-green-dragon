import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	RelationshipAttributes,
	RelationshipCreationAttributes
} from '$lib/db/attributes/relationship.attributes';
import { sequelize } from '$lib/db/sequelize';

export const Relationship: ModelStatic<
	Model<RelationshipAttributes, RelationshipCreationAttributes>
> = sequelize.define(
	'relationship',
	{
		// Das Paar ist der Schlüssel, und die Richtung zählt: A kann B schätzen, ohne
		// dass es erwidert wird.
		fromCharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		toCharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		// Abweichung vom Grundwert, nicht die Zuneigung selbst — darf negativ werden.
		affection: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		lastChangedTick: { type: DataTypes.INTEGER, allowNull: false }
	},
	{ timestamps: true }
);
