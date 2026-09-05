import type { BuildingTemplate } from '$lib/model/buildingTemplate';
import { CONDITION_MAX } from '$lib/game/building.logic';
import { skillFactor } from '$lib/game/skill.logic';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { canAfford, TAGELOHN } from '$lib/game/economy';

/**
 * Die Regeln hinter den Gebäudehandlungen — als reine Funktionen, ohne Datenbank.
 *
 * Sie bekommen den Zustand hereingereicht und geben zurück, wie er danach aussieht; wer
 * das Ergebnis schreibt, entscheidet der Service. Diese Trennung ist hier besonders viel
 * wert, weil sich an genau diesen Zahlen das Balancing abspielt: Sie lassen sich prüfen,
 * ohne eine Welt aufzubauen.
 *
 * Fehlschläge tragen einen Grund als Code aus `actionFailure.ts`, keinen fertigen Satz.
 */

// --- Arbeiten ------------------------------------------------------------------------

/**
 * Was eine Schicht Instandsetzung kostet — an Aktionspunkten des Arbeiters.
 *
 * Weniger als eine Renovierung auf eigene Rechnung (die kostet vier und bringt das Haus
 * auf einen Schlag in Ordnung): Hier arbeitet einer für Lohn und schafft ein Stück, nicht
 * das Ganze. So kann eine Stadt mehrere Leute an einem Bau beschäftigen, und ein
 * Tagelöhner muss nicht einen halben Tag am Stück aufbringen, um überhaupt anzufangen.
 */
export const REPAIR_ACTION_POINT_COST = 1;

/**
 * Wie viele Zustandspunkte eine Schicht einbringt.
 *
 * Bei einem Verfall von hundert Punkten über fünfundzwanzig Spieljahre ist ein Bau nach
 * gut zwanzig Schichten wieder heil — genug Arbeit, dass sie sich lohnt, und wenig genug,
 * dass die Stadt nicht ewig daran zahlt.
 */
export const REPAIR_PER_SHIFT = 5;

export type RepairForHireOutcome =
	| {
			ok: true;
			actionPoints: number;
			money: number;
			earned: number;
			employerMoney: number;
			condition: number;
	  }
	| { ok: false; reason: ActionFailureReason };

/**
 * Für Lohn an einem fremden Haus arbeiten (5.26).
 *
 * **Arbeit, die etwas hinterlässt** — der Ersatz für die Tagelöhnerei, bei der drei Münzen
 * den Besitzer wechselten und sonst nichts geschah. Der Arbeiter setzt instand, der
 * Eigentümer zahlt, und beide haben etwas davon: Das ist dieselbe Deckung, die für die
 * Anstellung längst gilt.
 *
 * **Der Lohn steigt mit dem Können**, wie bei jeder Arbeit: Wer bauen kann, schafft mehr
 * und bekommt mehr. Anders als beim Renovieren auf eigene Rechnung senkt Können hier
 * nicht die Kosten — es hebt den Verdienst, denn den Preis bestimmt der, der zahlt.
 */
/**
 * Was eine Schicht wirklich einbringt — Aushang mal Können (5.82, Punkt 106).
 *
 * **Steht hier, damit niemand sie nachbaut.** Genau das ist mit 5.81 passiert: Die
 * Arbeitsplatzsuche prüfte, ob der Bauherr den **ausgehängten** Lohn aufbringt, gezahlt
 * wurde aber der könnensgewichtete — und weil seit dem Rohbau fast jeder bauen kann, war
 * das kein Randfall, sondern 1689 vergebliche Schichten je Messlauf. Wer die Deckung
 * prüfen will, muss dieselbe Zahl ausrechnen wie der, der zahlt; also gibt es sie nur
 * einmal.
 */
export function repairWage(offeredWage: number, buildingSkill: number): number {
	return Math.max(1, Math.round(offeredWage * skillFactor(buildingSkill)));
}

export function repairForHire(
	worker: { actionPoints: number; money: number; buildingSkill: number },
	employer: { money: number },
	condition: number,
	/**
	 * Was der Auftraggeber bietet (5.27). Bei städtischen Bauten ist es der Tagelohn — den
	 * setzt niemand aus, er ist der Satz, den die Stadt für einen Handschlag zahlt. Bei
	 * einem privaten Auftrag steht hier, was der Eigentümer geboten hat.
	 */
	offeredWage: number = TAGELOHN
): RepairForHireOutcome {
	if (condition >= CONDITION_MAX) return { ok: false, reason: 'NOTHING_TO_DO' };
	if (worker.actionPoints < REPAIR_ACTION_POINT_COST) {
		return { ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' };
	}

	const lohn: number = repairWage(offeredWage, worker.buildingSkill);
	if (!canAfford(employer.money, lohn)) return { ok: false, reason: 'EMPLOYER_BROKE' };

	return {
		ok: true,
		actionPoints: worker.actionPoints - REPAIR_ACTION_POINT_COST,
		money: worker.money + lohn,
		earned: lohn,
		employerMoney: employer.money - lohn,
		// Nie über die volle Güte hinaus — der letzte Handschlag richtet nur, was fehlt.
		condition: Math.min(CONDITION_MAX, condition + REPAIR_PER_SHIFT)
	};
}

// --- Bauen ---------------------------------------------------------------------------

/** Das Grundstück, auf dem gebaut werden soll — so, wie das Bauen es sieht. */
export interface BuildSite {
	ownerCharacterId: string | null;
	regionId: string;
	hasBuilding: boolean;
}

export type BuildOutcome = { ok: true } | { ok: false; reason: ActionFailureReason };

/**
 * Ob gebaut werden darf.
 *
 * Die Reihenfolge der Prüfungen ist die der Ursachen: Erst muss der Platz einem gehören,
 * dann frei sein, dann darf das Gebäude überhaupt noch einmal gebaut werden. So nennt die
 * Rückmeldung immer den ersten wirklichen Grund.
 *
 * **Vom Geld ist hier seit 5.76 nicht mehr die Rede** (Punkt 102). Ein Bau kostet, was er
 * an Material und Arbeit kostet — und beides hat einen Empfänger. Der Münzpreis hatte
 * keinen: Er wurde abgezogen und war aus der Welt, im Messlauf über 2000 Ticks rund 2100
 * von 6034 vernichteten Münzen. Was hier entsteht, ist deshalb ein Rohbau; fertig macht
 * ihn `buildShift` oder ein bezahlter Handwerker.
 */
export function build(
	builder: { id: string },
	site: BuildSite,
	template: BuildingTemplate,
	limitReached: boolean
): BuildOutcome {
	if (site.ownerCharacterId !== builder.id) {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}
	if (site.hasBuilding) {
		return { ok: false, reason: 'PLOT_ALREADY_BUILT' };
	}
	if (limitReached) {
		return { ok: false, reason: 'LIMIT_REACHED' };
	}
	return { ok: true };
}

// --- Grundstück kaufen ---------------------------------------------------------------

export type BuyPlotOutcome =
	| { ok: true; money: number; spent: number }
	| { ok: false; reason: ActionFailureReason };

/**
 * Nie vergebenes Stadtland kaufen. Das Geld geht an die Stadt — sie ist es, die den
 * Boden hergibt, und ihre Kasse ist ab 4.7 der politische Hebel.
 */
export function buyPlot(
	buyer: { money: number; regionId: string },
	plot: { ownerCharacterId: string | null; ownerType: string; regionId: string },
	price: number
): BuyPlotOutcome {
	if (plot.ownerType !== 'NONE') {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}
	if (buyer.regionId !== plot.regionId) {
		return { ok: false, reason: 'WRONG_REGION' };
	}
	if (!canAfford(buyer.money, price)) {
		return { ok: false, reason: 'NOT_ENOUGH_MONEY' };
	}
	return { ok: true, money: buyer.money - price, spent: price };
}
