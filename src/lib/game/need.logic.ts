/**
 * Bedürfnisse — die Nachfrageseite der Wirtschaft.
 *
 * Ohne sie wäre der Markt ein Zahlenkreislauf: Waren, die man kauft, um sie zu
 * verkaufen. Erst wenn Nahrung fehlt und das spürbar ist, entsteht echte Nachfrage —
 * und zwar bei Spielern **und** NPCs, durch dieselbe Rechnung.
 *
 * Die Sättigung wird **faul ausgewertet**, wie Aktionsbudget, Zuneigung und
 * Gebäudeverfall: aus dem gespeicherten Stand und den seither verstrichenen Ticks. Kein
 * Durchlauf über alle Einwohner je Stunde, und Lesen ändert nichts.
 *
 * Der Verfall ist **linear**, wie beim Gebäude und aus demselben Grund: Es soll ein Ende
 * geben. Eine Kurve, die sich der Null nur nähert, ließe niemanden je verhungern.
 */

/** Ein satter Mensch. */
export const SATIETY_MAX = 100;

/**
 * Nach so vielen Ticks ohne einen Bissen ist die Sättigung aufgebraucht.
 *
 * Hundert Ticks sind zwei Spieljahre und gut vier Realtage. Essen ist damit etwas, das
 * man alle paar Tage regelt, nicht täglich — wer übers Wochenende nicht hereinschaut,
 * kommt nicht hungernd zurück. Das passt zum Aktionsbudget, das über zwei Tage
 * anwächst: Beide Uhren laufen in derselben Größenordnung.
 */
export const TICKS_TO_STARVE = 100;

export const SATIETY_LOSS_PER_TICK: number = SATIETY_MAX / TICKS_TO_STARVE;

/**
 * Die Schwellen, an denen Not spürbar wird.
 *
 * **Gestaffelt: erst Leistung, dann Leben.** Wer hungert, schafft zuerst weniger; erst
 * bei anhaltender Not steigt das Sterberisiko. Das gibt eine Vorwarnung, die der Spieler
 * selbst verschuldet hat — statt ihn ohne Ansage zu töten. Bei Permadeath ist das der
 * Unterschied zwischen einer harten Regel und einer unfairen.
 */
export const SATIETY_COMFORTABLE = 50;
export const SATIETY_WEAKENED = 30;
export const SATIETY_STARVING = 10;

/** Die Sättigung, wie sie jetzt ist. */
export function currentSatiety(
	storedSatiety: number,
	lastNeedTick: number,
	currentTick: number
): number {
	const verstrichen: number = Math.max(0, currentTick - lastNeedTick);
	return Math.max(0, Math.min(SATIETY_MAX, storedSatiety - verstrichen * SATIETY_LOSS_PER_TICK));
}

/**
 * Wie viel Kraft einem Hungernden noch bleibt.
 *
 * Wirkt auf die **Obergrenze** des Aktionsbudgets, nicht auf den Zufluss. Zwei Gründe:
 * Die Rechnung bleibt über beliebige Tick-Abstände exakt — bei einem gedrosselten
 * Zufluss müsste man wissen, wie satt jemand in der Zwischenzeit war —, und niemandem
 * wird genommen, was er sich satt erarbeitet hat. Hunger hält den Vorrat klein, er
 * plündert ihn nicht.
 */
export function actionPointFactor(satiety: number): number {
	if (satiety >= SATIETY_WEAKENED) return 1;
	if (satiety >= SATIETY_STARVING) return 0.75;
	return 0.5;
}

/**
 * Das Sterberisiko der Not — **eigenständig, kein Faktor auf das Altersrisiko.**
 *
 * Ein Faktor wäre der naheliegende Weg und wäre falsch: Vor vierzig ist das Altersrisiko
 * null, und das Zehnfache von null ist null. Ein Zwanzigjähriger könnte dann nicht
 * verhungern — ausgerechnet der, den es am ehesten trifft, weil er nichts besitzt.
 *
 * Deshalb addiert sich die Not zum Alter, statt es zu vervielfachen. Wer bei null
 * angekommen ist, stirbt binnen etwa eines Spieltages, wenn er nichts findet.
 */
export function starvationRiskPerYear(satiety: number): number {
	// Ein fehlender Wert darf nicht in die höchste Gefahr laufen: `NaN` fällt durch jeden
	// Vergleich hindurch und käme sonst unten bei 0,9 heraus — einmal passiert, weil eine
	// Abfrage die Spalte nicht mitlud, und aus einem vergessenen Feld wurde ein Massensterben.
	if (!Number.isFinite(satiety)) return 0;
	// Dieselbe Grenze wie bei `actionPointFactor`, und mit demselben Vergleich: Sonst
	// wäre einer bei genau zehn noch bei Kräften und schon in Lebensgefahr.
	if (satiety >= SATIETY_STARVING) return 0;
	if (satiety > 0) return 0.05;
	return 0.9;
}

/**
 * Ab so vielen Ticks ohne Mahlzeit **kann** jemand überhaupt am Verhungern sein.
 *
 * Nur eine Vorauswahl für die Datenbank: Wer kürzlich gegessen hat, ist selbst mit dem
 * niedrigsten denkbaren Stand noch nicht in Gefahr. Die genaue Rechnung folgt danach —
 * die Abfrage soll bloß nicht die halbe Stadt laden.
 */
export const TICKS_BEFORE_STARVATION_POSSIBLE: number = Math.floor(
	(SATIETY_MAX - SATIETY_STARVING) / SATIETY_LOSS_PER_TICK
);

/** Ein Wort für den Zustand — die Zahl allein sagt niemandem, wann es ernst wird. */
export function satietyLabel(satiety: number): string {
	if (satiety >= SATIETY_COMFORTABLE) return 'satt';
	if (satiety >= SATIETY_WEAKENED) return 'hungrig';
	if (satiety >= SATIETY_STARVING) return 'ausgezehrt';
	if (satiety > 0) return 'am Verhungern';
	return 'verhungert';
}

/**
 * Essen.
 *
 * Was über die Sättigung hinausginge, verfällt: Man kann sich keinen Vorrat anfuttern.
 * Wer vorsorgen will, legt Brot ins Lager, nicht in den Magen — und genau das erzeugt
 * die Lagerhaltung, von der die Wirtschaft lebt.
 */
export function eat(satiety: number, nourishment: number): number {
	return Math.min(SATIETY_MAX, satiety + nourishment);
}

/** Lohnt sich das Essen überhaupt noch? */
export function wouldBeWasted(satiety: number): boolean {
	return satiety >= SATIETY_MAX;
}
