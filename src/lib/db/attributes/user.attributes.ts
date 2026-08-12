import type { Optional } from 'sequelize';
import type { User } from '$lib/model/user';
import type { BackendUser } from '$lib/model/backendUser';

export interface UserAttributes {
	id: string;
	nickname: string;
	email: string | null;
	password: string;
}

export type UserCreationAttributes = Optional<UserAttributes, 'email'>;

/**
 * In die Sicht der Oberfläche — **ohne Passwort**. Der einzige Weg aus der Datenbank
 * heraus, den Routen und Layouts benutzen dürfen.
 */
export function convertToUser(attributes: UserAttributes): User {
	return {
		id: attributes.id,
		nickname: attributes.nickname,
		email: attributes.email ?? undefined
	};
}

/** Mit Passwort — nur für die Anmeldung innerhalb der Service-Schicht. */
export function convertToBackendUser(attributes: UserAttributes): BackendUser {
	return { ...convertToUser(attributes), password: attributes.password };
}
