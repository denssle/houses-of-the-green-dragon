import type { ActionFailureReason } from '$lib/game/actionFailure';
import {
	type BuildingTemplate,
	levelOf,
	maxLevel,
	upgradePrice
} from '$lib/model/buildingTemplate';
import { canAfford } from '$lib/game/economy';
import { costFactor } from '$lib/game/skill.logic';
import { buildingCostFactor, type Season, TICKS_PER_YEAR } from '$lib/game/time';

/**
 * Verfall, Renovierung und Ausbau — als reine Rechnung.
 *
 * Der Zustand wird **faul ausgewertet**: Er ergibt sich aus dem gespeicherten Wert und
 * den seither verstrichenen Ticks, wie Aktionsbudget und Zuneigung. Kein Durchlauf über
 * alle Gebäude je Stunde, und vor allem: Lesen ändert nichts. Wer oft nachsieht, findet
 * dasselbe vor wie wer selten nachsieht.
 *
 * Der Verfall ist bewusst **linear** und nicht exponentiell. Anders als bei der
 * Zuneigung, die sich einem Grundwert annähert, soll hier ein Ende stehen: die Ruine.
 * Eine Kurve, die sich der Null nur nähert, käme nie an — und dann gäbe die Welt kein
 * Bauland zurück.
 */

/** Der Zustand eines neuen Gebäudes. */
export const CONDITION_MAX = 100;

/**
 * Nach so vielen Spieljahren ohne jede Pflege ist ein Gebäude eine Ruine.
 *
 * Zwanzig Jahre sind vierzig Realtage. Renovieren wird damit zu einer Sache von drei,
 * vier Mal im Leben statt zur Wochenaufgabe — und ein geerbtes Haus ist ein echtes Erbe
 * und kein Sanierungsfall.
 */
export const YEARS_TO_RUIN = 20;

export const CONDITION_LOSS_PER_TICK: number = CONDITION_MAX / (YEARS_TO_RUIN * TICKS_PER_YEAR);

/** Was eine Renovierung an Kraft und Geld kostet. */
export const RENOVATION_ACTION_POINT_COST = 4;
export const RENOVATION_COST_PER_POINT = 2;

/** Was ein Ausbau an Kraft kostet — das Geld steht in der Vorlage. */
export const UPGRADE_ACTION_POINT_COST = 8;

/**
 * Der Zustand, wie er jetzt ist.
 *
 * Nie unter null: Was darunter läge, ist eine Ruine, und die hat keinen Zustand mehr.
 */
export function currentCondition(
	storedCondition: number,
	lastConditionTick: number,
	currentTick: number
): number {
	const verstrichen: number = Math.max(0, currentTick - lastConditionTick);
	return Math.max(0, storedCondition - verstrichen * CONDITION_LOSS_PER_TICK);
}

/** Am Ende des Verfalls steht die Ruine: Das Haus ist weg, das Grundstück bleibt. */
export function isRuin(condition: number): boolean {
	return condition <= 0;
}

/**
 * Wie viel ein Gebäude in seinem Zustand noch leistet.
 *
 * Ein verfallenes Haus wärmt schlecht und eine verfallene Hütte produziert weniger —
 * linear zum Zustand. Damit ist der Verfall nicht erst am Ende spürbar, sondern die
 * ganze Zeit über, und Renovieren lohnt sich, bevor es dringend wird.
 */
export function outputFactor(condition: number): number {
	return Math.max(0, Math.min(1, condition / CONDITION_MAX));
}

/** Wie viele Menschen auf dieser Stufe wohnen können — 0, wenn es kein Zuhause ist. */
export function residentsAt(template: BuildingTemplate, level: number): number {
	return levelOf(template, level).residents ?? 0;
}

/** Was der Betrieb auf dieser Stufe zahlt, gemindert um den Zustand. */
export function wageAt(template: BuildingTemplate, level: number, condition: number): number {
	const grundlohn: number = levelOf(template, level).wagePerActionPoint ?? 0;
	// Abgerundet, aber nie auf null, solange überhaupt etwas gezahlt wird: Eine Schicht,
	// die gar nichts einbringt, wäre ein verlorener Aktionspunkt ohne Ansage.
	return grundlohn === 0 ? 0 : Math.max(1, Math.floor(grundlohn * outputFactor(condition)));
}

// --- Renovieren ----------------------------------------------------------------------

export type RenovationOutcome =
	| { ok: true; actionPoints: number; money: number; spent: number; condition: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Renovieren bringt ein Gebäude auf Anfang zurück.
 *
 * Gezahlt wird nach dem, was fehlt — wer früh renoviert, zahlt wenig. Das ist die
 * Fixkostenseite des Besitzes: Ein Haus kostet laufend, auch wenn niemand es anfasst.
 *
 * Baumaterial kommt mit 4.6 dazu. Bis dahin nur Geld, sonst hinge dieser Schritt an
 * einer Produktionskette, die es noch nicht gibt.
 */
export function renovate(
	owner: { actionPoints: number; money: number; buildingSkill: number },
	condition: number,
	season: Season
): RenovationOutcome {
	if (condition >= CONDITION_MAX) {
		return { ok: false, reason: 'NOTHING_TO_DO' };
	}
	if (owner.actionPoints < RENOVATION_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}

	const fehlt: number = Math.ceil(CONDITION_MAX - condition);
	// Wer bauen kann, renoviert billiger — bis zur Hälfte. Das ist die zweite Art, wie
	// Können wirkt: nicht nur mehr verdienen, sondern weniger ausgeben.
	const kosten: number = Math.ceil(
		fehlt * RENOVATION_COST_PER_POINT * costFactor(owner.buildingSkill) * buildingCostFactor(season)
	);
	if (!canAfford(owner.money, kosten)) {
		return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	}

	return {
		ok: true,
		actionPoints: owner.actionPoints - RENOVATION_ACTION_POINT_COST,
		money: owner.money - kosten,
		spent: kosten,
		condition: CONDITION_MAX
	};
}

// --- Ausbauen ------------------------------------------------------------------------

export type UpgradeOutcome =
	| { ok: true; actionPoints: number; money: number; spent: number; level: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Eine Stufe höher: aus der Kate ein Haus, aus der Hütte eine Werkstatt.
 *
 * Der Ausbau ist die Hauptinvestition, in die ein Spieler seinen Gewinn steckt — und
 * beim Wohnhaus der einzige Weg, mehr Kinder unterzubringen, ohne ein zweites Grundstück
 * zu kaufen. Drei Stufen, dann ist Schluss; wer mehr will, braucht Boden, und der ist
 * knapp.
 *
 * Der Zustand wird dabei **nicht** zurückgesetzt: Ein Anbau macht das alte Gemäuer nicht
 * neu. Wer ein verfallenes Haus ausbaut, hat ein größeres verfallenes Haus.
 */
export function upgrade(
	owner: { actionPoints: number; money: number },
	template: BuildingTemplate,
	currentLevel: number,
	season: Season
): UpgradeOutcome {
	if (currentLevel >= maxLevel(template)) {
		return { ok: false, reason: 'MAX_LEVEL' };
	}
	const grundpreis: number | undefined = upgradePrice(template, currentLevel);
	if (grundpreis === undefined) {
		return { ok: false, reason: 'MAX_LEVEL' };
	}
	// Frost verzoegert den Bau und verteuert ihn — Renovierung wie Ausbau.
	const preis: number = Math.ceil(grundpreis * buildingCostFactor(season));
	if (owner.actionPoints < UPGRADE_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}
	if (!canAfford(owner.money, preis)) {
		return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	}

	return {
		ok: true,
		actionPoints: owner.actionPoints - UPGRADE_ACTION_POINT_COST,
		money: owner.money - preis,
		spent: preis,
		level: currentLevel + 1
	};
}

// --- Handel --------------------------------------------------------------------------

export type PurchaseOutcome =
	| { ok: true; buyerMoney: number; price: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Etwas kaufen, das jemand zum Verkauf gestellt hat.
 *
 * Festpreis statt Auktion — passend zum Prinzip aus dem Konzept und zum asynchronen
 * Spiel: Ein Orderbuch braucht Gegenparteien in derselben Stunde, ein Preisschild nicht.
 */
export function purchase(
	buyer: { id: string; money: number },
	offer: { ownerId: string | null; forSalePrice: number | null }
): PurchaseOutcome {
	if (offer.forSalePrice === null) {
		return { ok: false, reason: 'NOT_FOR_SALE' };
	}
	if (offer.ownerId === buyer.id) {
		return { ok: false, reason: 'ALREADY_OWNED' };
	}
	if (!canAfford(buyer.money, offer.forSalePrice)) {
		return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	}
	return { ok: true, buyerMoney: buyer.money - offer.forSalePrice, price: offer.forSalePrice };
}

// --- Baumaterial (4.10) --------------------------------------------------------------

/** Was an Material gebraucht wird — Ware und Menge. */
export interface MaterialNeed {
	itemId: string;
	quantity: number;
}

/**
 * Wie viel Material ein Bau verschlingt.
 *
 * **Am Preis bemessen, nicht je Vorlage aufgezählt.** Ein Großhaus für 400 Münzen braucht
 * viermal so viel wie eine Kate für 100 — das ergibt sich, statt in zehn Tabellenzeilen
 * gepflegt zu werden, und jede neue Gebäudeart bringt ihren Materialbedarf von selbst mit.
 *
 * Die Mischung ist dieselbe für alles: viel Holz, halb so viel Stein, wenig Eisen. Ein
 * Haus ist ein Haus; dass eine Mühle mehr Eisen bräuchte als eine Kate, wäre eine
 * Feinheit, die niemand nachrechnet.
 */
export const PLANKS_PER_100 = 4;
export const BLOCKS_PER_100 = 2;
export const IRON_PER_100 = 1;

/**
 * Die Waren, aus denen gebaut wird.
 *
 * Wer einen Betrieb errichtet, der genau diese herstellt, braucht selbst keine: Die erste
 * Zimmerei zimmert man sich aus dem, was im Wald liegt. Ohne diese Ausnahme stünde die
 * ganze Kette vor einem Henne-Ei-Problem — für die Zimmerei bräuchte es Bretter, und
 * Bretter gäbe es nur aus der Zimmerei. Sie löst sich von selbst auf, sobald die erste
 * steht.
 */
export const BUILDING_MATERIALS: string[] = ['PLANK', 'BLOCK', 'IRON'];

export function producesBuildingMaterial(outputItemId: string | undefined): boolean {
	return outputItemId !== undefined && BUILDING_MATERIALS.includes(outputItemId);
}

export function materialFor(price: number): MaterialNeed[] {
	if (price <= 0) return [];
	const hundert: number = price / 100;

	return [
		{ itemId: 'PLANK', quantity: Math.max(1, Math.round(hundert * PLANKS_PER_100)) },
		{ itemId: 'BLOCK', quantity: Math.max(1, Math.round(hundert * BLOCKS_PER_100)) },
		{ itemId: 'IRON', quantity: Math.max(1, Math.round(hundert * IRON_PER_100)) }
	];
}

/**
 * Was eine Renovierung an Material braucht.
 *
 * Deutlich weniger als ein Neubau, und abhängig davon, wie viel fehlt: Wer sein Haus
 * pflegt, kommt mit ein paar Brettern aus; wer es verfallen lässt, zahlt beim Herrichten
 * doppelt — einmal in Münzen, einmal in Material.
 */
export const RENOVATION_MATERIAL_DIVISOR = 25;

export function renovationMaterial(missingCondition: number): MaterialNeed[] {
	if (missingCondition <= 0) return [];
	const bretter: number = Math.max(1, Math.round(missingCondition / RENOVATION_MATERIAL_DIVISOR));
	return [{ itemId: 'PLANK', quantity: bretter }];
}

/** Fehlt etwas? Gibt zurück, was zu wenig da ist — leer heißt: es reicht. */
export function missingMaterial(
	needed: MaterialNeed[],
	stock: Map<string, number>
): MaterialNeed[] {
	return needed
		.map((posten) => ({
			itemId: posten.itemId,
			quantity: posten.quantity - (stock.get(posten.itemId) ?? 0)
		}))
		.filter((posten) => posten.quantity > 0);
}
