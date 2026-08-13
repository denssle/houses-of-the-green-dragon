import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	CandidacyAttributes,
	CandidacyCreationAttributes,
	ElectionAttributes,
	ElectionCreationAttributes,
	VoteAttributes,
	VoteCreationAttributes
} from '$lib/db/attributes/election.attributes';
import { OFFICES } from '$lib/game/election.logic';
import { sequelize } from '$lib/db/sequelize';

export const Election: ModelStatic<Model<ElectionAttributes, ElectionCreationAttributes>> =
	sequelize.define(
		'election',
		{
			id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			RegionId: { type: DataTypes.STRING, allowNull: false },
			office: {
				type: DataTypes.STRING,
				allowNull: false,
				validate: { isIn: [[...OFFICES]] }
			},
			openedTick: { type: DataTypes.INTEGER, allowNull: false },
			closesTick: { type: DataTypes.INTEGER, allowNull: false },
			termEndsTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
			closed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
		},
		{ timestamps: true }
	);

export const Candidacy: ModelStatic<Model<CandidacyAttributes, CandidacyCreationAttributes>> =
	sequelize.define(
		'candidacy',
		{
			ElectionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			CharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			// Entscheidet bei Gleichstand: Wer sich zuerst aufstellen ließ, steht vorn.
			standingSinceTick: { type: DataTypes.INTEGER, allowNull: false }
		},
		{ timestamps: true }
	);

export const Vote: ModelStatic<Model<VoteAttributes, VoteCreationAttributes>> = sequelize.define(
	'vote',
	{
		// Ein Wähler, eine Wahl, eine Stimme — der Schlüssel erzwingt es, nicht der Code.
		ElectionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		VoterCharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		CandidateCharacterId: { type: DataTypes.STRING, allowNull: false }
	},
	{ timestamps: true }
);
