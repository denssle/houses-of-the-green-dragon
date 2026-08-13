import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	BuildingStockAttributes,
	BuildingStockCreationAttributes,
	ShopOfferAttributes,
	ShopOfferCreationAttributes
} from '$lib/db/attributes/shop.attributes';
import { sequelize } from '$lib/db/sequelize';

export const BuildingStock: ModelStatic<
	Model<BuildingStockAttributes, BuildingStockCreationAttributes>
> = sequelize.define(
	'buildingStock',
	{
		// Gebäude und Ware bilden zusammen den Schlüssel: eine Zeile je Sorte.
		BuildingId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		itemId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
	},
	{ timestamps: true }
);

export const ShopOffer: ModelStatic<Model<ShopOfferAttributes, ShopOfferCreationAttributes>> =
	sequelize.define(
		'shopOffer',
		{
			// Eigene Kennung statt eines zusammengesetzten Schlüssels: Am Marktplatz bieten
			// mehrere dieselbe Ware an, und derselbe Verkäufer darf zwei Preise für zwei
			// Mengen führen.
			id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
			BuildingId: { type: DataTypes.STRING, allowNull: false },
			SellerCharacterId: { type: DataTypes.STRING, allowNull: false },
			itemId: { type: DataTypes.STRING, allowNull: false },
			quantity: { type: DataTypes.INTEGER, allowNull: false },
			pricePerUnit: { type: DataTypes.INTEGER, allowNull: false }
		},
		{ timestamps: true }
	);
