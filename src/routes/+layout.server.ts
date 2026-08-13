import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.currentUser) {
		return {
			sections: [
				// Die Chronik steht auch Gästen offen — sie ist das Schaufenster der Welt.
				{ slug: 'chronicle', title: 'Chronik' },
				{ slug: 'register', title: 'Registrieren' },
				{ slug: 'login', title: 'Anmelden' }
			]
		};
	}

	const character = locals.currentCharacter;
	return {
		sections: [
			{ slug: '', title: 'Übersicht' },
			character
				? { slug: `character/${character.id}`, title: character.firstName }
				: { slug: 'character/new', title: 'Neuer Charakter' },
			{ slug: 'dynasty', title: 'Dynastie' },
			{ slug: 'logout', title: 'Abmelden' }
		]
	};
};
