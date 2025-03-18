import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ locals }): { sections: { slug: string; title: string }[] } => {
	if (locals.currentUser) {
		const sections: { slug: string; title: string }[] = [{ slug: '', title: 'Übersicht' }];
		if (locals.currentCharacter) {
			sections.push({
				slug: 'character/' + locals.currentCharacter.id,
				title: locals.currentCharacter.name
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
