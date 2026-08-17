import type { SkillType } from '$lib/game/skill.logic';
import type { Recipe } from '$lib/game/production.logic';

/**
 * Eine Ausbaustufe.
 *
 * Aus der Kate wird ein Haus, aus der Hütte eine Werkstatt: Jede Stufe hat ihren eigenen
 * Namen, ihren Preis und ihre Wirkung. Die erste Stufe ist der Neubau — ihr Preis ist
 * das, was das Gebäude überhaupt kostet.
 */
export interface BuildingLevel {
	/** Was es kostet, diese Stufe zu erreichen. Bei Stufe 1: der Neubau. */
	price: number;
	/** Wie diese Stufe heißt — „Kate", „Haus", „Großhaus". */
	name: string;
	/**
	 * Wie viele Menschen hier wohnen können. Fehlt der Wert, ist das Gebäude kein
	 * Zuhause. Die Zahl ist die Bremse der Bevölkerung: Kinder kommen nur, wo Platz ist
	 * (siehe `family.logic.ts`) — wer wachsen will, muss ausbauen.
	 */
	residents?: number;
	/**
	 * Was der Betrieb je eingesetztem Aktionspunkt zahlt. Fehlt der Wert, ist das
	 * Gebäude kein Arbeitsplatz.
	 */
	wagePerActionPoint?: number;
}

export interface BuildingTemplate {
	optionId: number;
	initialName: string;
	description: string;
	/**
	 * `EXTRACTION` ist der Hof einer Pacht (5.15) und **bewusst kein `CRAFT`**: Wer einen
	 * Hof hat, hat noch keinen Betrieb. Zählte er als Werkstatt, hielte sich jeder Pächter
	 * für einen Unternehmer — ein NPC baute nie eine echte, weil er ja schon eine zu haben
	 * glaubt, und in der Bauliste des Spielers stünde ein Haus, das man nicht baut.
	 */
	type: 'PUBLIC' | 'RESIDENCE' | 'CRAFT' | 'EXTRACTION';
	limited: boolean;
	limitedTo: number;
	/**
	 * Die Ausbaustufen, aufsteigend. Steht hier und nicht in der Datenbank: Sonst fröre
	 * jedes Gebäude beim Bau die damaligen Werte ein, und eine Balancing-Änderung
	 * erreichte den Bestand nie.
	 */
	levels: BuildingLevel[];
	/**
	 * Welche Fertigkeit eine Schicht hier schult — und die den Lohn hebt. Fehlt sie, ist
	 * die Arbeit ungelernt und Koennen aendert nichts daran.
	 */
	skill?: SkillType;
	/** Was sich hier herstellen laesst — leer bei Wohnhaus und Rathaus. */
	/**
	 * Was hier hergestellt werden kann.
	 *
	 * **Mehrere**, seit es den Alchemisten gibt: Seine Küche macht Duftwasser und
	 * Stärkungstrank aus denselben Kräutern. Ein Feld für genau ein Rezept hätte dafür
	 * zwei Gebäude verlangt, die sich nur im Erzeugnis unterscheiden — eine Trennung, die
	 * niemand erklären könnte. Wo nur eines steht, ist die Liste eben einelementig.
	 */
	recipes?: Recipe[];
}

/**
 * Die Stufe eines Gebäudes — eins-basiert, wie sie in der Datenbank steht.
 *
 * Begrenzt auf das, was die Vorlage hergibt: Ein Gebäude mit einer Stufe, die es nicht
 * mehr gibt (weil jemand die Vorlage gekürzt hat), fällt auf die höchste vorhandene
 * zurück, statt die Anzeige zu sprengen.
 */
export function levelOf(template: BuildingTemplate, level: number): BuildingLevel {
	const index: number = Math.min(Math.max(1, level), template.levels.length) - 1;
	return template.levels[index];
}

export function maxLevel(template: BuildingTemplate): number {
	return template.levels.length;
}

/** Was der Neubau kostet. */
export function buildPrice(template: BuildingTemplate): number {
	return template.levels[0].price;
}

/** Was der nächste Ausbau kostet — `undefined`, wenn die Höchststufe erreicht ist. */
export function upgradePrice(template: BuildingTemplate, currentLevel: number): number | undefined {
	return template.levels[currentLevel]?.price;
}

/** Ein Posten, wie ihn Kostenliste und Kammer führen. */
export interface Posten {
	quantity: number;
	name: string;
}

/**
 * Eine Aufzählung von Posten: „8 Bretter, 4 Quader, 2 Eisen".
 *
 * **Als Funktion und nicht im Template**, weil Svelte an den Grenzen von `{#each}` und
 * `{#if}` die Leerzeichen verschluckt — auf dem Server stand deshalb „190 Münzenund 8
 * Bretter,4 Quader". Ein Satz, den man aus Textbausteinen zusammenklebt, gehört dorthin,
 * wo man die Fugen sieht.
 */
export function itemLine(items: Posten[]): string {
	return items.map((posten) => `${posten.quantity} ${posten.name}`).join(', ');
}

/** Was ein Bau kostet, als ganzer Satz: „190 Münzen und 8 Bretter, 4 Quader". */
export function costLine(price: number, material: Posten[]): string {
	const stoff: string = itemLine(material);
	return stoff ? `${price} Münzen und ${stoff}` : `${price} Münzen`;
}
