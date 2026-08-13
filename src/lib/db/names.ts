/**
 * Namen für Neugeborene.
 *
 * Bewusst im Code und nicht in der Datenbank: Das ist Weltinhalt wie die Gebäudevorlagen,
 * er wächst mit dem Spiel und niemand soll ihn zur Laufzeit ändern. Der Vorrat darf klein
 * sein — Namensgleichheit ist mittelalterlich der Normalfall, und Charaktere werden über
 * ihre Herkunft unterschieden, nicht über einen eindeutigen Namen.
 *
 * Erweitern gehört zu Punkt 15 der offenen Punkte (Weltinhalte).
 */
export const NEUGEBORENE = {
	FEMALE: [
		'Adelheid',
		'Bertrada',
		'Cunigunde',
		'Dietlinde',
		'Ermgard',
		'Frideswid',
		'Gisela',
		'Hedwig',
		'Irmintrud',
		'Kunigunde',
		'Liutgard',
		'Mechthild',
		'Nortrud',
		'Odilia',
		'Richinza',
		'Sibylla',
		'Thiedrada',
		'Uta',
		'Walburga'
	],
	MALE: [
		'Anselm',
		'Baldemar',
		'Conrad',
		'Dietmar',
		'Eckhart',
		'Folkmar',
		'Gerwin',
		'Hartmut',
		'Ingram',
		'Konrad',
		'Ludolf',
		'Meinhard',
		'Norbert',
		'Otfried',
		'Reimar',
		'Sigward',
		'Thankmar',
		'Ulrich',
		'Wigbert'
	]
} as const satisfies Record<'FEMALE' | 'MALE', readonly string[]>;
