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

/**
 * Hausnamen für Zugezogene (5.24).
 *
 * **Nach der Herkunft, nicht nach dem Handwerk.** Die Gründer heißen Müller, Schmied und
 * Weber — sie sind, was sie tun. Wer von auswärts kommt, ist in Grünau zuerst einmal der
 * Fremde von irgendwoher, und genau so entstanden Herkunftsnamen. Nebenbei erkennt man
 * einen Zugezogenen dadurch am Namen, und die Chronik erzählt von selbst, wer wann kam.
 *
 * Die Orte gibt es in dieser Welt nicht — sie liegen hinter dem Rand der Karte. Sobald es
 * eine zweite Stadt gibt (Punkt 31), sollten hier deren Namen stehen.
 */
export const HERKUNFT = [
	'von Ahlen',
	'von Bergheim',
	'von Dornbach',
	'von Elmstein',
	'von Falkenau',
	'von Hagen',
	'von Kirchdorf',
	'von Lindau',
	'von Moorbach',
	'von Nesselberg',
	'von Rodach',
	'von Steinfurt',
	'von Talheim',
	'von Wehrbach'
] as const;
