/**
 * Welche Version gerade läuft — für den Bereitschaftscheck und für die Fußzeile.
 *
 * **Eine Quelle für beide**: Zeigte die Seite eine andere Zahl als `/api/health`, wüsste
 * niemand, welcher er glauben soll. Gesetzt wird sie von npm, sobald der Server über ein
 * npm-Skript startet (`npm run start-server`, `npm run dev`) — aus `package.json`, die nach
 * `CLAUDE.md` in jedem Commit mit einer Änderung mitzieht.
 */
export function appVersion(): string | undefined {
	return process.env.npm_package_version;
}
