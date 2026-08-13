import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type { SkillAttributes, SkillCreationAttributes } from '$lib/db/attributes/skill.attributes';
import { SKILL_TYPES } from '$lib/game/skill.logic';
import { sequelize } from '$lib/db/sequelize';

export const Skill: ModelStatic<Model<SkillAttributes, SkillCreationAttributes>> = sequelize.define(
	'skill',
	{
		// Charakter und Art bilden zusammen den Schlüssel: Jeder kann jede Fertigkeit
		// genau einmal haben.
		CharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		type: {
			type: DataTypes.STRING,
			primaryKey: true,
			allowNull: false,
			validate: { isIn: [[...SKILL_TYPES]] }
		},
		level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
		// Übung innerhalb der aktuellen Stufe. Nicht aus der Zeit ableitbar — deshalb
		// wird sie bei jeder Handlung geschrieben.
		progress: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
	},
	{ timestamps: true }
);
