/** Der Benutzer, wie ihn die Oberfläche sehen darf — ohne Passwort. */
export interface User {
	id: string;
	nickname: string;
	email: string | undefined;
}
