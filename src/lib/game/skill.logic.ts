import type { ActionFailureReason } from '$lib/game/actionFailure';

/**
 * Können: Übung, Stufen und Lehre.
 *
 * Ein Charakter ist nicht nur, was er besitzt, sondern was er kann. Fertigkeiten greifen
 * überall dort ein, wo bisher eine Pauschale stand — allen voran beim Lohn: Eine Schicht
 * in der Schmiede bringt nicht mehr jedem gleich viel, sondern hängt daran, wer am
 * Amboss steht.
 *
 * **Spezialisierung entsteht aus Aufwand, nicht aus einer Regel.** Jede Stufe kostet
 * doppelt so viel Übung wie die vorige. Damit kann jeder alles ein bisschen, aber
 * niemand alles gut — ohne eine Obergrenze, die von außen vorschreibt, was zu wählen
 * ist.
 *
 * **Können wird nicht vererbt, sondern gelehrt.** Wer will, dass sein Handwerk das Haus
 * überdauert, muss zu Lebzeiten ausbilden. Wer plötzlich stirbt, hinterlässt eine
 * Werkstatt, die niemand bedienen kann — genau die Dramatik, die Permadeath tragen soll.
 */

/**
 * Die Fertigkeiten, die es gibt.
 *
 * Jede mit einer Wirkung, die es heute schon gibt: Schmieden hebt den Lohn, Bauen senkt
 * die Renovierungskosten, Ackerbau und Backen den Ertrag ihrer Rezepte. Handel (4.6d),
 * Redekunst (4.7) und Kämpfen (offener Punkt 6) kommen mit den Handlungen, zu denen sie
 * gehören — eine Fertigkeit ohne Wirkung wäre eine Zahl, die niemand liest.
 */
export const SKILL_TYPES = [
	'SMITHING',
	'CONSTRUCTION',
	'FARMING',
	'BAKING',
	// Mit der Baukette (4.10): Wer Holz schlägt, ist kein Bauer, und wer Stein bricht,
	// kein Schmied. Beide Fertigkeiten wirken wie die anderen — auf Ertrag und Kosten.
	'FORESTRY',
	'MINING',
	// Mit Schneider und Alchemist (4.11).
	'TAILORING',
	'ALCHEMY'
] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

export const SKILL_NAMES: Record<SkillType, string> = {
	ALCHEMY: 'Alchemie',
	FORESTRY: 'Holzarbeit',
	MINING: 'Bergbau',
	SMITHING: 'Schmieden',
	TAILORING: 'Schneiderei',
	CONSTRUCTION: 'Bauen',
	FARMING: 'Ackerbau',
	BAKING: 'Backen'
};

/** Die höchste erreichbare Stufe. */
export const MAX_SKILL_LEVEL = 10;

/**
 * Was die zweite Stufe kostet. Jede weitere kostet das Doppelte der vorigen.
 *
 * Die Zahlen sind gegen ein Leben gerechnet: Ein Charakter sammelt von der
 * Volljährigkeit bis zum mittleren Sterbealter rund 2.600 Aktionspunkte. Stufe 10 kostet
 * insgesamt 2.555 Übungen — buchstäblich alles, was ein Leben hergibt. Stufe 6 kostet
 * 155 und läuft nebenbei mit.
 */
export const PRACTICE_FOR_SECOND_LEVEL = 5;

/**
 * Wie viel Übung die nächste Stufe kostet.
 *
 * `undefined` auf der Höchststufe — dort gibt es nichts mehr zu erreichen.
 */
export function practiceForNextLevel(currentLevel: number): number | undefined {
	if (currentLevel >= MAX_SKILL_LEVEL) return undefined;
	if (currentLevel < 1) return PRACTICE_FOR_SECOND_LEVEL;
	return PRACTICE_FOR_SECOND_LEVEL * Math.pow(2, currentLevel - 1);
}

/** Was es insgesamt kostet, von null auf diese Stufe zu kommen — für das Balancing. */
export function totalPracticeFor(level: number): number {
	let summe = 0;
	for (let stufe = 1; stufe < level; stufe++) {
		summe += practiceForNextLevel(stufe) ?? 0;
	}
	return summe;
}

/** Ein Stand: erreichte Stufe und Übung innerhalb dieser Stufe. */
export interface SkillState {
	level: number;
	progress: number;
}

/**
 * Übung eintragen — und dabei so viele Stufen steigen, wie hineinpassen.
 *
 * Die Schleife ist nicht Zierde: Eine Lehrstunde bringt zwanzig Übungen auf einmal, und
 * auf den unteren Stufen reicht das für mehrere Sprünge. Wer stattdessen nur eine Stufe
 * je Aufruf zuließe, verschenkte den Rest.
 */
export function practice(state: SkillState, amount: number): SkillState {
	let { level, progress } = state;
	progress += amount;

	for (;;) {
		const noetig: number | undefined = practiceForNextLevel(level);
		if (noetig === undefined) {
			// Höchststufe: Übung darüber hinaus verfällt. Sie ließe sich sonst horten und
			// beim nächsten Anheben der Obergrenze schlagartig einlösen.
			return { level, progress: 0 };
		}
		if (progress < noetig) return { level, progress };

		progress -= noetig;
		level += 1;
	}
}

/**
 * Was eine Stufe bringt.
 *
 * Zehn Prozent je Stufe auf den Grundwert: Ein Meister der zehnten Stufe leistet das
 * Doppelte eines Ungelernten. Zusammen mit den Ausbaustufen des Betriebs (3 bis 8 Münzen
 * je Aktionspunkt) ergibt das eine Spanne von 3 bis 16 — genug, dass sich Spezialisierung
 * lohnt, wenig genug, dass ein Neuling nicht chancenlos ist.
 */
export function skillFactor(level: number): number {
	return 1 + 0.1 * Math.max(0, level);
}

/**
 * Wie stark eine Fertigkeit Kosten senkt — für das Bauen.
 *
 * Fünf Prozent je Stufe, gedeckelt bei der Hälfte. Ohne Deckel käme ein Meister der
 * zehnten Stufe bei null heraus, und Renovieren wäre für ihn umsonst.
 */
export function costFactor(level: number): number {
	return Math.max(0.5, 1 - 0.05 * Math.max(0, level));
}

// --- Lehre ---------------------------------------------------------------------------

/** Wie viele Übungen eine Lehrstunde bringt. */
export const TEACHING_PRACTICE = 20;

/** Was eine Lehrstunde beide kostet. */
export const TEACHING_ACTION_POINT_COST = 2;

/** Das Lehrgeld je Stufe des Meisters. */
export const TEACHING_FEE_PER_LEVEL = 5;

/**
 * Wie weit der Schüler hinter dem Meister zurückbleibt.
 *
 * Zwei Stufen. Damit gibt ein Meister sein Können weiter, ohne es ganz aus der Hand zu
 * geben — und über Generationen wächst ein Handwerkerhaus trotzdem, weil der Schüler den
 * Rest selbst erübt und dann seinerseits höher lehren kann.
 */
export const TEACHING_GAP = 2;

/** Bis zu welcher Stufe dieser Meister überhaupt lehren kann. */
export function teachableUpTo(teacherLevel: number): number {
	return Math.max(0, teacherLevel - TEACHING_GAP);
}

export function teachingFee(teacherLevel: number): number {
	return teacherLevel * TEACHING_FEE_PER_LEVEL;
}

export type TeachingOutcome =
	| { ok: true; teacherActionPoints: number; studentActionPoints: number; fee: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Lehrstunde.
 *
 * Beide zahlen mit Zeit, der Schüler zusätzlich mit Geld — und das Geld geht an den
 * Meister. Damit hat Meisterschaft ein Einkommen jenseits der Werkbank, und aus
 * Fertigkeiten wird ein Markt.
 *
 * Hier stand einmal, die Zunft entstehe daraus von selbst und brauche kein eigenes
 * System. Das galt, solange es nur um Wissensweitergabe ging. Inzwischen soll sie die
 * Meisterwürde verleihen, Preise setzen und den Zutritt begrenzen (`KONZEPT.md`,
 * Abschnitt 17) — und das kann kein Markt, das braucht jemanden, der vergibt.
 *
 * Gelehrt wird nicht nur den eigenen Kindern. Ein Neuling ohne Familie hätte sonst
 * keinen Zugang zu Können — und die Startbedingungen (Punkt 14) sind ohnehin die
 * empfindlichste Stelle des Spiels.
 */
export function teach(
	teacher: { actionPoints: number; level: number },
	student: { actionPoints: number; money: number; level: number }
): TeachingOutcome {
	if (student.level >= teachableUpTo(teacher.level)) {
		return { ok: false, reason: 'NOTHING_TO_LEARN' };
	}
	if (teacher.actionPoints < TEACHING_ACTION_POINT_COST) {
		return { ok: false, reason: 'TEACHER_TOO_TIRED' };
	}
	if (student.actionPoints < TEACHING_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}

	const lehrgeld: number = teachingFee(teacher.level);
	if (student.money < lehrgeld) {
		return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	}

	return {
		ok: true,
		teacherActionPoints: teacher.actionPoints - TEACHING_ACTION_POINT_COST,
		studentActionPoints: student.actionPoints - TEACHING_ACTION_POINT_COST,
		fee: lehrgeld
	};
}
