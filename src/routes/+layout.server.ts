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
			...(character
				? [
						{ slug: `character/${character.id}`, title: character.firstName },
						// **Neben den Charakter, nicht in die Übersicht.** Das Inventar ist der eigene
						// Vorrat: Man sieht dort nach, während man etwas anderes tut — beim Kaufen,
						// beim Einlagern, wenn der Hunger drückt. Ein Weg dorthin, der jedesmal über
						// die Übersicht führt, ist ein Umweg auf einem Pfad, den man am häufigsten
						// geht.
						{ slug: 'inventory', title: 'Inventar' }
					]
				: [{ slug: 'character/new', title: 'Neuer Charakter' }]),
			{ slug: 'dynasty', title: 'Dynastie' },
			// **Die Chronik gehört nach oben**, nicht nur in die Übersicht: Sie ist das, was
			// man liest, wenn man nach einer Weile wiederkommt — und das tut man von jeder
			// Seite aus, nicht nur von der Übersicht. Für Gäste steht sie schon länger hier.
			{ slug: 'chronicle', title: 'Chronik' },
			{ slug: 'logout', title: 'Abmelden' }
		]
	};
};
