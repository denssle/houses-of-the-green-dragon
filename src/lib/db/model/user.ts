import { DataTypes, type Model, type ModelStatic } from 'sequelize';
import type { UserAttributes, UserCreationAttributes } from '$lib/db/attributes/user.attributes';
import { sequelize } from '$lib/db/sequelize';

export const User: ModelStatic<Model<UserAttributes, UserCreationAttributes>> = sequelize.define(
	'user',
	{
		id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		// unique: Eindeutigkeit muss die Datenbank erzwingen — eine Prüfung im Service
		// davor ist bei parallelen Registrierungen eine Race Condition.
		nickname: { type: DataTypes.STRING, allowNull: false, unique: true },
		// `defaultValue: null` steht hier und bei allen weiteren nullbaren Spalten mit
		// Absicht: Ohne sie fehlt der Schlüssel auf der Instanz, die `create()`
		// zurückgibt, ganz — sie ist dann `undefined`, während dieselbe Zeile aus der
		// Datenbank gelesen `null` liefert. Eine Prüfung wie `deathTick === null` wäre
		// damit je nach Herkunft des Objekts falsch.
		email: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		password: { type: DataTypes.STRING, allowNull: false }
	},
	{ timestamps: true }
);
