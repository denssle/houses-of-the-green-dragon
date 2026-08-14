/** Das langlebige Spielerobjekt: ein Haus, das seine Charaktere überdauert. */
export interface Dynasty {
	id: string;
	name: string;
	/** Wer es gegründet hat — `null` bei Häusern, die niemand spielt (5.10). */
	foundedBy: string | null;
	isExtinct: boolean;
}
