/** Das langlebige Spielerobjekt: ein Haus, das seine Charaktere überdauert. */
export interface Dynasty {
	id: string;
	name: string;
	foundedBy: string;
	isExtinct: boolean;
}
