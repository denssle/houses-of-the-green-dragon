import { randomUUID } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { compare, hash } from 'bcrypt-ts';
import type { User } from '$lib/model/user';
import { User as UserModel } from '$lib/db/model/user';
import { SessionToken } from '$lib/db/model/sessionToken';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { convertToUser } from '$lib/db/attributes/user.attributes';
import { mode } from '$lib/db/sequelize';
import * as characterService from '$lib/server/service/characterService';

/** Name des Sitzungs-Cookies. Sein Inhalt ist ein opaker Zufallswert, sonst nichts. */
export const SESSION_COOKIE = 'session';

/**
 * Wie lange eine Anmeldung gilt: dreißig Tage, absolut ab Ausstellung — nicht gleitend.
 * Ein Spiel, das man einmal die Woche aufruft, soll nicht jedes Mal nach dem Passwort
 * fragen; ein gestohlenes Cookie soll aber auch nicht ewig taugen.
 */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Kostenfaktor für bcrypt. Zehn Runden kosten in dieser reinen JS-Umsetzung rund 290 ms
 * auf dem Entwicklungsrechner — hoch genug, um Wörterbuchangriffe teuer zu machen, und
 * niedrig genug, dass eine Anmeldung nicht spürbar hängt.
 */
const BCRYPT_ROUNDS = 10;

/**
 * Ein gültiger Hash, der zu keinem Passwort gehört. Er wird verglichen, wenn es den
 * Nickname gar nicht gibt: Sonst antwortete die Anmeldung bei unbekannten Namen sofort
 * und bei bekannten erst nach dem Hashen — aus dieser Zeitdifferenz ließe sich ablesen,
 * welche Namen vergeben sind.
 */
const DUMMY_HASH = '$2b$10$VBrxqXf9uPQwMn/D5Ict1.VCXhDlWwwqxyYWqbOdZeHDh0K3nyiPu';

// --- Anmeldung -----------------------------------------------------------------------

/**
 * Prüft Nickname und Passwort gegen den gespeicherten Hash.
 *
 * Bewusst asynchron: bcrypt kostet ~290 ms, und die App läuft in einem einzigen
 * Node-Prozess — `hashSync`/`compareSync` legten für diese Zeit jeden parallelen Request
 * still.
 */
export async function loginWithCredentials(
	nickname: string,
	password: string
): Promise<User | undefined> {
	const gefunden = await UserModel.findOne({ where: { nickname } });
	if (!gefunden) {
		await compare(password, DUMMY_HASH);
		return undefined;
	}
	const stimmt: boolean = await compare(password, gefunden.dataValues.password);
	return stimmt ? convertToUser(gefunden.dataValues) : undefined;
}

// --- Sitzungen -----------------------------------------------------------------------

/**
 * Legt eine Sitzung an und setzt das Cookie.
 *
 * Der Schlüssel der Tabelle ist die Benutzer-ID: Wer sich neu anmeldet, überschreibt
 * damit seine vorige Sitzung. Eine Anmeldung auf dem Telefon beendet also die am
 * Rechner — für ein Spiel, in dem Mehrfachaccounts ohnehin unerwünscht sind, ist das die
 * gewollte Richtung.
 */
export async function startSession(user: User, cookies: Cookies): Promise<void> {
	const token: string = randomUUID();
	await SessionToken.upsert({
		UserId: user.id,
		token,
		expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS)
	});
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		// Lokal läuft der Dev-Server über http; ein `secure`-Cookie käme dort nie an.
		secure: mode === 'PRODUCTION',
		maxAge: SESSION_MAX_AGE_MS / 1000
	});
}

/**
 * Löst das Cookie zur Identität auf — der einzige Weg, wie ein Request zu einem Benutzer
 * kommt. Ein selbst geschriebenes Cookie führt hier ins Leere, weil der Wert nur als
 * Nachschlagschlüssel dient und nichts über den Benutzer aussagt.
 *
 * Abgelaufene Sitzungen werden dabei gelöscht: Der Zugriff ist die Gelegenheit, bei der
 * die Zeile ohnehin in der Hand liegt.
 */
export async function getCurrentUserBySessionToken(
	token: string | undefined
): Promise<User | undefined> {
	if (!token) return undefined;

	const sitzung = await SessionToken.findOne({ where: { token } });
	if (!sitzung) return undefined;

	// Die Frist steht fest, seit die Sitzung angelegt wurde: Beim Auflösen wird sie nicht
	// verschoben. Weiterspielen verlängert also nichts — nach dreißig Tagen ist eine
	// Neuanmeldung fällig.
	if (isSessionExpired(sitzung.dataValues.expiresAt)) {
		await sitzung.destroy();
		return undefined;
	}

	const benutzer = await UserModel.findByPk(sitzung.dataValues.UserId);
	if (!benutzer) {
		// Der Benutzer ist weg, die Sitzung war es noch nicht: aufräumen.
		await sitzung.destroy();
		return undefined;
	}
	return convertToUser(benutzer.dataValues);
}

/**
 * Reine Rechnung, damit die Frist ohne Datenbank und ohne Warten prüfbar ist. Eine
 * fehlende oder unlesbare Frist gilt als abgelaufen: Im Zweifel lieber eine
 * Neuanmeldung verlangen, als eine Sitzung ohne Ende stehenzulassen.
 */
export function isSessionExpired(expiresAt: Date | undefined, now: Date = new Date()): boolean {
	if (!expiresAt) return true;
	const frist: number = expiresAt.getTime();
	if (Number.isNaN(frist)) return true;
	return now.getTime() > frist;
}

export async function login(locals: App.Locals, currentUser: User): Promise<void> {
	locals.currentUser = currentUser;
	locals.currentCharacter = await characterService.getCharacterForUser(currentUser.id);
}

/**
 * Beendet die Sitzung — im Browser und in der Datenbank. Nur das Cookie zu löschen
 * genügte nicht: Wer den Wert vorher kopiert hat, käme damit weiter herein.
 */
export async function logout(locals: App.Locals, cookies: Cookies): Promise<void> {
	const token: string | undefined = cookies.get(SESSION_COOKIE);
	if (token) {
		await SessionToken.destroy({ where: { token } });
	}
	locals.currentUser = undefined;
	locals.currentCharacter = undefined;
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

// --- Benutzer ------------------------------------------------------------------------

export async function nickNameAlreadyUsed(nickname: string): Promise<boolean> {
	return (await UserModel.count({ where: { nickname } })) > 0;
}

export async function emailAlreadyUsed(email: string): Promise<boolean> {
	if (!email) return false;
	return (await UserModel.count({ where: { email } })) > 0;
}

export async function create(
	nickname: string,
	email: string | undefined,
	password: string
): Promise<User | undefined> {
	const angelegt = await UserModel.create({
		id: randomUUID(),
		nickname,
		email: email ?? null,
		password: await hash(password, BCRYPT_ROUNDS)
	});
	return convertToUser(angelegt.dataValues);
}

export async function getUser(userId: string): Promise<User | undefined> {
	const gefunden = await UserModel.findByPk(userId);
	return gefunden ? convertToUser(gefunden.dataValues) : undefined;
}

/**
 * Ein Konto löschen — als Anonymisierung (Punkt 28).
 *
 * **Die Welt kann eine Dynastie nicht einfach vergessen.** An ihr hängen Gebäude, Verträge,
 * Ämter, Chronikeinträge und die Vorfahren anderer Spieler. Ein `DELETE` risse Löcher in
 * fremde Stammbäume und machte Ereignisse ungeschehen, an denen andere beteiligt waren.
 *
 * Also verschwindet, was **personenbezogen** ist, und was zur Welt gehört, bleibt:
 *
 * - Nickname und E-Mail fallen weg, das Passwort wird unbrauchbar. Eine Anmeldung ist
 *   danach unmöglich — auch mit dem alten Passwort, denn der Hash gehört zu keinem
 *   Passwort mehr.
 * - Alle Sitzungen enden sofort.
 * - Die Namen der Figuren werden zu „Namenlos", der des Hauses zu „Ein vergessenes Haus".
 *   Die Chronik zeigt damit rückwirkend keinen Namen mehr — sie speichert Kennungen, und
 *   der Satz entsteht beim Lesen.
 * - **Der gespielte Charakter wird zum NPC.** Er bleibt in der Welt, wohnt, arbeitet und
 *   stirbt irgendwann wie jeder andere. Das ist die ehrlichere Lösung, als ihn sterben zu
 *   lassen: Seine Nachbarn hätten sonst von einem Tag auf den anderen einen Toten und ein
 *   herrenloses Haus, weil jemand anderes ein Formular abgeschickt hat.
 *
 * Was bleibt, ist damit ein Einwohner ohne Namen und ohne Menschen dahinter — und genau so
 * steht es im Konzept.
 */
export async function anonymizeAccount(userId: string): Promise<boolean> {
	const benutzer = await UserModel.findByPk(userId);
	if (!benutzer) return false;

	await SessionToken.destroy({ where: { UserId: userId } });

	// Der Nickname muss eindeutig bleiben — die Spalte verlangt es, und ein zweiter
	// „gelöscht" ließe die nächste Löschung scheitern.
	await benutzer.update({
		nickname: `geloescht-${userId.slice(0, 8)}`,
		email: null,
		// Kein gültiger bcrypt-Hash: `compare` gibt dagegen immer false zurück, ohne dass
		// es dafür eine Sonderprüfung im Anmeldeweg bräuchte.
		password: 'geloescht'
	});

	const haeuser = await Dynasty.findAll({ where: { UserId: userId } });
	for (const haus of haeuser) {
		await haus.update({ name: 'Ein vergessenes Haus' });
		await Character.update({ firstName: 'Namenlos' }, { where: { DynastyId: haus.dataValues.id } });
		// Aus dem gespielten Charakter wird ein Einwohner wie jeder andere.
		await Character.update(
			{ role: 'NPC' },
			{ where: { DynastyId: haus.dataValues.id, role: 'PLAYER' } }
		);
	}

	return true;
}
