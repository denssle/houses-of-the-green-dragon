/**
 * Eine Versteigerung und die Gebote darauf.
 *
 * **Der Gewinner steht nicht in der Tabelle.** Er ergibt sich aus den Geboten: das
 * höchste, dessen Bieter beim Zuschlag noch zahlen kann. Dieselbe Bauart wie beim Amt
 * (4.7a) und aus demselben Grund — ein gespeicherter Gewinner könnte von der Lage
 * abweichen, eine Rechnung kann das nicht.
 */
export interface AuctionAttributes {
	id: string;
	PlotId: string;
	RegionId: string;
	openedTick: number;
	/** Ab hier wird zugeschlagen. */
	closesTick: number;
	closed: boolean;
}

export type AuctionCreationAttributes = AuctionAttributes;

export interface BidAttributes {
	AuctionId: string;
	CharacterId: string;
	amount: number;
	tick: number;
}

export type BidCreationAttributes = BidAttributes;
