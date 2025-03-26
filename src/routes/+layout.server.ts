import type { LayoutLoad } from './$types';
import type { Character } from '$lib/model/character';

export const load: LayoutLoad = ({ locals }): { sections: { slug: string; title: string }[] } => {
	if (locals.currentUser) {
		const sections: { slug: string; title: string }[] = [{ slug: '', title: 'Übersicht' }];
		const character: Character | undefined = locals.currentCharacter;
		if (character) {
			sections.push({
				slug: 'character/' + character.id,
				title: character.firstName
			});
		} else {
			sections.push({ slug: 'character/new', title: 'Neuer Charakter' });
		}
		sections.push({ slug: 'dynasty', title: 'Dynastie' });
		sections.push({ slug: 'logout', title: 'Abmelden' });
		return {
			sections: sections
		};
	}
	return {
		sections: [
			{ slug: 'register', title: 'Registrieren' },
			{ slug: 'login', title: 'Anmelden' }
		]
	};
};
