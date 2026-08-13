import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	AuctionAttributes,
	AuctionCreationAttributes,
	BidAttributes,
	BidCreationAttributes
} from '$lib/db/attributes/auction.attributes';
import { sequelize } from '$lib/db/sequelize';

export const Auction: ModelStatic<Model<AuctionAttributes, AuctionCreationAttributes>> =
	sequelize.define(
		'auction',
		{
			id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			PlotId: { type: DataTypes.STRING, allowNull: false },
			RegionId: { type: DataTypes.STRING, allowNull: false },
			openedTick: { type: DataTypes.INTEGER, allowNull: false },
			closesTick: { type: DataTypes.INTEGER, allowNull: false },
			closed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
		},
		{ timestamps: true }
	);

export const Bid: ModelStatic<Model<BidAttributes, BidCreationAttributes>> = sequelize.define(
	'bid',
	{
		// Ein Bieter, eine Zeile je Versteigerung: Ein neues Gebot ersetzt das alte. Wer
		// dreimal bietet, steht sonst dreimal in der Reihe und rückt hinter sich selbst nach.
		AuctionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		CharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		amount: { type: DataTypes.INTEGER, allowNull: false },
		tick: { type: DataTypes.INTEGER, allowNull: false }
	},
	{ timestamps: true }
);
