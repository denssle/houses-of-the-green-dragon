/**
 * Ein Pachtverhältnis über eine Abbaufläche.
 *
 * Abbauflächen gehören **der Stadt** und werden verpachtet, nicht verkauft — das ist der
 * Unterschied, an dem die Politik ab 4.7 hängt: Wer den Acker bekommt, ist eine
 * Entscheidung, keine Frage des Geldbeutels von vorgestern.
 *
 * Eine Fläche, ein Pächter: `PlotId` ist der Schlüssel. Mehrere Pächter auf einem Acker
 * wären ein zweites System (Untervergabe), und das ist keins, das gebraucht wird.
 */
export interface LeaseAttributes {
	PlotId: string;
	CharacterId: string;
	sinceTick: number;
}

export type LeaseCreationAttributes = LeaseAttributes;
