import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type { EventAttributes, EventCreationAttributes } from '$lib/db/attributes/event.attributes';
import { EVENT_KINDS } from '$lib/game/chronicle.logic';
import { sequelize } from '$lib/db/sequelize';

export const Event: ModelStatic<Model<EventAttributes, EventCreationAttributes>> = sequelize.define(
	'event',
	{
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		RegionId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		kind: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [[...EVENT_KINDS]] } },
		tick: { type: DataTypes.INTEGER, allowNull: false },
		subjectId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		objectId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		buildingId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		dynastyId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		value: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		detail: { type: DataTypes.STRING, allowNull: true, defaultValue: null }
	},
	{
		timestamps: true,
		// Gelesen wird fast immer „das Neueste zuerst", gefiltert nach Ort oder Person.
		indexes: [{ fields: ['RegionId', 'tick'] }, { fields: ['subjectId'] }]
	}
);
