import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.currentUser) {
		return {
			// Die Fußzeile zeigt „Konto" nur, wenn es eines gibt — ein Link, der auf die
			// Anmeldung führt, ist ein Versprechen, das die Seite bricht.
			loggedIn: false,
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
		loggedIn: true,
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
