import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type {
	SessionTokenAttributes,
	SessionTokenCreationAttributes
} from '$lib/db/attributes/sessionToken.attributes';
import { sequelize } from '$lib/db/sequelize';

export const SessionToken: ModelStatic<
	Model<SessionTokenAttributes, SessionTokenCreationAttributes>
> = sequelize.define(
	'sessionToken',
	{
		UserId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		// Der Cookie enthält nur diesen opaken Zufallswert; die Identität kommt aus der
		// Tabelle. Ein selbst geschriebenes Cookie nützt damit niemandem etwas.
		token: { type: DataTypes.STRING, allowNull: false }
	},
	{ timestamps: true }
);
