import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import {
	SESSION_TOKEN_INDEX,
	type SessionTokenAttributes,
	type SessionTokenCreationAttributes
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
		token: { type: DataTypes.STRING, allowNull: false },
		expiresAt: { type: DataTypes.DATE, allowNull: false }
	},
	{
		timestamps: true,
		// Jeder Request schlägt über den Token nach — der Weg braucht einen Index, sonst
		// ist die Anmeldung ein Tabellenscan. Eindeutig, weil zwei Sitzungen mit
		// demselben Wert sonst auf verschiedene Benutzer zeigten.
		indexes: [{ name: SESSION_TOKEN_INDEX, unique: true, fields: ['token'] }]
	}
);
