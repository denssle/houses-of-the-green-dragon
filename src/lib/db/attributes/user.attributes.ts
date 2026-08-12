import type { Optional } from 'sequelize';
import type { User } from '$lib/model/user';

export interface UserAttributes {
	id: string;
	nickname: string;
	email: string | null;
	password: string;
}

export type UserCreationAttributes = Optional<UserAttributes, 'email'>;

/**
 * In die Sicht der Oberfläche — **ohne Passwort**, und seit Phase 2.1 der einzige Weg
 * aus der Datenbank heraus. Ein Gegenstück „mit Passwort“ gibt es bewusst nicht mehr:
 * Der Hash wird dort verglichen, wo die Zeile gelesen wird, und verlässt den Service
 * nicht.
 */
export function convertToUser(attributes: UserAttributes): User {
	return {
		id: attributes.id,
		nickname: attributes.nickname,
		email: attributes.email ?? undefined
	};
}
