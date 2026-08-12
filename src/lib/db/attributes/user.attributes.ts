import type { Optional } from 'sequelize';

export interface UserAttributes {
	id: string;
	nickname: string;
	email: string | null;
	password: string;
}

export type UserCreationAttributes = Optional<UserAttributes, 'email'>;
