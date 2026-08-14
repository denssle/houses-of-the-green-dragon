import { Op } from 'sequelize';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { fullName } from '$lib/game/naming.logic';

/**
 * Namen zum Anzeigen — Vorname und Hausname zusammen.
 *
 * **Seit 5.10 gehört jeder Mensch zu einem Haus**, und der Hausname *ist* der Nachname.
 * Damit steht dieselbe Aufgabe an vielen Stellen gleich da: Aus einer Handvoll Kennungen
 * sollen Namen werden, und zwar in zwei Abfragen statt in zweimal so vielen wie Personen.
 * Vorher stand diese Schleife im chronicleService; sie hier zu wissen, spart sie überall
 * sonst.
 *
 * Der Zuschnitt ist bewusst schmal: Dieses Modul kennt nur Charaktere und Häuser und darf
 * deshalb von jedem anderen Dienst benutzt werden, ohne einen Zyklus zu erzeugen.
 *
 * **Wo der volle Name hingehört** und wo der Vorname genügt, steht bei `fullName` in
 * `naming.logic.ts`: voll, wo Menschen verschiedener Häuser nebeneinanderstehen — Chronik,
 * Leuteliste, Rathaus, Markt, Angestellte. Vorname allein, wo der Zusammenhang das Haus
 * schon geklärt hat: eigene Kinder, eigener Stammbaum.
 */

/**
 * Löst mehrere Kennungen auf einmal auf. Unbekannte Kennungen fehlen in der Antwort —
 * wer nach einem Toten oder einem Gelöschten fragt, bekommt keinen Platzhalter, sondern
 * die Gelegenheit, selbst zu entscheiden, was dann dasteht.
 */
export async function displayNames(ids: Iterable<string>): Promise<Map<string, string>> {
	const gesucht: string[] = [...new Set(ids)];
	const namen = new Map<string, string>();
	if (gesucht.length === 0) return namen;

	const gefunden = await Character.findAll({
		where: { id: { [Op.in]: gesucht } },
		attributes: ['id', 'firstName', 'DynastyId']
	});
	return await mitHausnamen(gefunden);
}

/**
 * Dieselbe Auflösung für bereits geladene Charaktere. Wer die Zeilen ohnehin in der Hand
 * hält — die Nachbarliste, die Belegschaft eines Betriebs — soll sie nicht ein zweites
 * Mal holen müssen.
 *
 * Erwartet wird alles, was `id`, `firstName` und `DynastyId` trägt; damit passen sowohl
 * Sequelize-Instanzen (über `dataValues`) als auch einfache Objekte.
 */
export async function namesFor(
	leute: { id: string; firstName: string; DynastyId: string | null }[]
): Promise<Map<string, string>> {
	return await hausNamenAnhaengen(leute);
}

async function mitHausnamen(
	gefunden: { dataValues: { id: string; firstName: string; DynastyId: string | null } }[]
): Promise<Map<string, string>> {
	return await hausNamenAnhaengen(gefunden.map((person) => person.dataValues));
}

async function hausNamenAnhaengen(
	leute: { id: string; firstName: string; DynastyId: string | null }[]
): Promise<Map<string, string>> {
	const namen = new Map<string, string>();
	if (leute.length === 0) return namen;

	// Zweiter Rutsch statt Verbund: Bei fünfzig Personen sind das zwei Abfragen, und die
	// Häuser wiederholen sich ohnehin — eine Familie hat viele Mitglieder.
	const haeuser = new Map<string, string>();
	const gebraucht: string[] = [
		...new Set(leute.map((person) => person.DynastyId).filter((id): id is string => Boolean(id)))
	];
	if (gebraucht.length > 0) {
		const gefunden = await Dynasty.findAll({
			where: { id: { [Op.in]: gebraucht } },
			attributes: ['id', 'name']
		});
		for (const haus of gefunden) haeuser.set(haus.dataValues.id, haus.dataValues.name);
	}

	for (const person of leute) {
		const haus: string | undefined = person.DynastyId ? haeuser.get(person.DynastyId) : undefined;
		namen.set(person.id, fullName(person.firstName, haus));
	}
	return namen;
}

/**
 * Ein einzelner Name. Bequemlichkeit für die Stellen, an denen genau eine Person zu
 * benennen ist — der Käufer eines Grundstücks, der Urheber eines Gesetzes.
 */
export async function displayName(id: string | null | undefined): Promise<string | undefined> {
	if (!id) return undefined;
	return (await displayNames([id])).get(id);
}
