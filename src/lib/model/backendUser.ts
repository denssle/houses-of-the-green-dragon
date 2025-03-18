import type { User } from '$lib/model/user';

export interface BackendUser extends User {
	password: string;
}
