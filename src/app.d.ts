import type { User } from '$lib/model/user';
import type { Character } from '$lib/model/character';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			currentUser: User | undefined;
			currentCharacter: Character | undefined;
		} // interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
