import { AGE_OF_MAJORITY, ageInYears } from '$lib/game/time';

/**
 * Namen, die jemand selbst vergibt.
 *
 * Zwei Fälle, dieselben Schranken: Ein Spieler benennt seine Kinder, solange sie klein
 * sind, und seine Gebäude, solange sie ihm gehören. Beides ist keine Mechanik, sondern
 * Bindung — ein Haus, dessen Kinder man selbst benannt hat, ist ein anderes als eine Liste
 * erzeugter Vornamen.
 *
 * Die Prüfung liegt hier und nicht in den Diensten, weil sie eine Regel ist und keine
 * Technik: Was ein Name sein darf, soll an einer Stelle stehen und nicht an zweien
 * auseinanderlaufen.
 */

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 30;

/**
 * Vor- und Nachname zusammen — der Nachname ist der Name des Hauses (5.10).
 *
 * **Nicht überall.** Wo Menschen aus verschiedenen Häusern nebeneinanderstehen, sagt der
 * Nachname, wer zu wem gehört: in der Chronik, in der Leuteliste, im Rathaus, auf dem
 * Markt. Wo der Zusammenhang das Haus ohnehin klärt — die eigenen Kinder, der eigene
 * Stammbaum —, ist er Wiederholung und bleibt weg. Deshalb entscheidet die Anzeige und
 * nicht der Dienst, ob er dazugehört.
 *
 * Ein Haus ohne Namen kommt vor: bei gelöschten Konten (5.9). Dann steht der Vorname
 * allein, und das ist die richtige Auskunft — mehr ist über die Person nicht zu sagen.
 */
export function fullName(firstName: string, lastName: string | null | undefined): string {
	const haus: string = (lastName ?? '').trim();
	return haus ? `${firstName} ${haus}` : firstName;
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: NameProblem };

export type NameProblem = 'TOO_SHORT' | 'TOO_LONG' | 'TAKEN' | 'TOO_OLD' | 'NOT_YOURS';

/**
 * Aufräumen, bevor geprüft wird.
 *
 * Leerraum an den Rändern fällt weg, und Folgen von Leerzeichen werden zu einem: Sonst
 * ließen sich zwei Namen unterscheiden, die man nicht unterscheiden **sieht** — und in
 * einer Liste von Geschwistern wäre genau das eine Falle.
 */
export function normalizeName(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Taugt der Name?
 *
 * `taken` sind die Namen, die in demselben Zusammenhang schon vergeben sind — bei einem
 * Kind die seiner lebenden Geschwister. **Tote zählen nicht dazu**: Ein Kind nach der
 * verstorbenen Großmutter zu benennen ist genau das, was Häuser tun.
 */
export function checkName(raw: string, taken: string[] = []): NameCheck {
	const name: string = normalizeName(raw);

	if (name.length < MIN_NAME_LENGTH) return { ok: false, reason: 'TOO_SHORT' };
	if (name.length > MAX_NAME_LENGTH) return { ok: false, reason: 'TOO_LONG' };

	// Verglichen wird ohne Rücksicht auf Groß- und Kleinschreibung: „Alheid" und „alheid"
	// sind für jeden Leser derselbe Name.
	const belegt: boolean = taken.some(
		(anderer) => normalizeName(anderer).toLocaleLowerCase() === name.toLocaleLowerCase()
	);
	if (belegt) return { ok: false, reason: 'TAKEN' };

	return { ok: true, name };
}

/**
 * Darf dieses Kind noch umbenannt werden?
 *
 * Mit der Volljährigkeit steht der Name fest. Ein Erwachsener, den man umbenennen könnte,
 * wäre für alle anderen niemand, auf den man sich beziehen kann — und die Chronik hielte
 * Ereignisse fest, deren Handelnder später anders heißt.
 */
export function stillNameable(birthTick: number, currentTick: number): boolean {
	return ageInYears(birthTick, currentTick) < AGE_OF_MAJORITY;
}
