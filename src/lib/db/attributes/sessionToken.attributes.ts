/**
 * Ausdrücklicher Name für den Index auf `token` — sonst leiten Modell (`sync()`) und
 * Migration ihn unterschiedlich ab, und der Abgleich in `migrations.spec.ts` schlägt an
 * einer Stelle fehl, an der inhaltlich nichts auseinanderläuft.
 */
export const SESSION_TOKEN_INDEX = 'sessionTokens_token_unique';

export interface SessionTokenAttributes {
	UserId: string;
	token: string;
	/**
	 * Wann die Sitzung endet — eine eigene Spalte und nicht aus `updatedAt` erschlossen.
	 * Der Zeitstempel gehört Sequelize: Jeder spätere Schreibzugriff auf die Zeile
	 * verlängerte die Sitzung sonst stillschweigend, und ausdrücklich setzen lässt er
	 * sich nicht (Sequelize verwirft den Wert). Die Frist steht damit dort, wo sie
	 * hingehört: als Datum, gegen das die Abfrage vergleichen kann.
	 */
	expiresAt: Date;
}

export type SessionTokenCreationAttributes = SessionTokenAttributes;
