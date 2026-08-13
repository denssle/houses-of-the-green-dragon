import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	CharacterAttributes,
	CharacterCreationAttributes
} from '$lib/db/attributes/character.attributes';
import { CHARACTER_ROLES, GENDERS } from '$lib/db/attributes/enums';
import { sequelize } from '$lib/db/sequelize';

export const Character: ModelStatic<Model<CharacterAttributes, CharacterCreationAttributes>> =
	sequelize.define(
		'character',
		{
			id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			firstName: { type: DataTypes.STRING, allowNull: false },
			title: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Neuling' },
			role: {
				type: DataTypes.STRING,
				allowNull: false,
				validate: { isIn: [[...CHARACTER_ROLES]] }
			},
			gender: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [[...GENDERS]] } },
			actionPoints: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			lastTickProcessed: { type: DataTypes.INTEGER, allowNull: false },
			// INTEGER und nicht BIGINT: MariaDB deckt damit gut zwei Milliarden Münzen ab,
			// was für ein Mittelalterspiel reicht — und BIGINT gäbe Sequelize als String
			// zurück, womit genau das Problem zurückkäme, dessentwegen dieser Umbau läuft.
			money: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			birthTick: { type: DataTypes.INTEGER, allowNull: false },
			// Leer, solange der Charakter lebt. Bewusst kein zusätzliches `isAlive`: zwei
			// Felder für denselben Sachverhalt geraten unweigerlich auseinander.
			deathTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
			RegionId: { type: DataTypes.STRING, allowNull: false },
			// Leer bei den Fremd-NPCs, die die Welt zum Start bevölkern — sie gehören zu
			// keinem Haus.
			DynastyId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			motherId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			fatherId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			spouseId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			// Der benannte Erbe. Leer heisst nicht erblos, sondern unbenannt — dann greift
			// die gesetzliche Reihenfolge (siehe inheritance.logic.ts).
			heirId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			// Schwangerschaft: seit wann und von wem. Zwei Spalten statt einer Tabelle, weil
			// es je Frau hoechstens eine zugleich gibt — und weil die Geburt sie wieder leert.
			pregnantSinceTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
			pregnantByFatherId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			// Ein offener Heiratsantrag. NPCs brauchen ihn nicht — sie entscheiden sofort —,
			// aber zwei Spieler sind selten zugleich online.
			proposedToId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			HomeBuildingId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			// Die Grundpersoenlichkeit: sechs Achsen, festgelegt bei der Geburt, nie wieder
			// geaendert. Direkt am Charakter statt in einer eigenen Tabelle — jeder hat genau
			// einen Satz, und die Kandidatensuche ab 4.7 will danach sortieren koennen.
			courage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			diligence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			greed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			sociability: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			ambition: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			agreeableness: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			// Saettigung und Stichtag gehoeren zusammen wie condition und lastConditionTick
			// beim Gebaeude: gerechnet beim Lesen, geschrieben nur beim Essen.
			satiety: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
			lastNeedTick: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
		},
		{ timestamps: true }
	);
