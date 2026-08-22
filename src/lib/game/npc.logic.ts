import { votingDelay } from '$lib/game/election.logic';
import { COURT_ACTION_POINT_COST } from '$lib/game/family.logic';
import type { Personality } from '$lib/game/personality.logic';
import { SATIETY_COMFORTABLE, SATIETY_WEAKENED } from '$lib/game/need.logic';
import { RENOVATION_ACTION_POINT_COST, UPGRADE_ACTION_POINT_COST } from '$lib/game/building.logic';

/**
 * Was ein NPC als Nächstes tut.
 *
 * **Eine gewichtete Entscheidung, keine Regel je Lage.** Das ist der ganze Zweck der
 * Persönlichkeitsachsen aus 4.4a: Eine neue Handlung braucht neue Gewichte, nicht eine
 * neue Verzweigung über jeden denkbaren Charakterzug.
 *
 * **NPCs kommen so oft zum Zug wie Spielercharaktere.** Sie haben dasselbe
 * Aktionsbudget, dieselben Kosten und dieselben Regeln — deshalb braucht es hier keine
 * eigene Taktung: Wer nichts mehr hat, tut nichts mehr. Das drosselt die Schleife von
 * selbst und hält beide Hälften der Welt vergleichbar. Ein zweiter Satz Regeln für die
 * Simulation würde unweigerlich abdriften, und Balancing wäre dann nicht mehr möglich.
 *
 * Heute hängen drei der sechs Achsen an einer Handlung: Fleiß am Arbeiten, Gier am
 * Sparen, Geselligkeit am Werben. Mut, Ehrgeiz und Verträglichkeit warten auf Kampf
 * (Punkt 6) und Politik (4.7) — sie bekommen ihre Gewichte mit den Handlungen, zu denen
 * sie gehören.
 */

export const NPC_ACTIONS = [
	'EAT',
	'BUY_FOOD',
	'TAKE_JOB',
	'WORK',
	'MOVE_IN',
	'COURT',
	// Seit 4.12: Was über das Überleben hinausgeht. Ohne diese vier kaufen NPCs
	// ausschließlich Nahrung — und jeder Beruf außer dem Bäcker hätte keine Kundschaft.
	'BUY_GARMENT',
	'WEAR_GARMENT',
	'BUY_TONIC',
	'DRINK_TONIC',
	// Seit 4.13 die fünfte Stufe: etwas Eigenes aufbauen (Punkt 29).
	'BUY_PLOT',
	'BUILD',
	'LEASE',
	'HARVEST',
	'CRAFT',
	'SELL',
	// Seit 4.14: ein eigenes Dach, Instandhaltung und Leute (Punkt 30).
	'BUY_MATERIAL',
	'BUY_INPUT',
	'BUILD_HOME',
	'RENOVATE',
	'OFFER_JOB',
	// Seit 5.29: ausbauen, was steht. Zwei Handlungen und nicht eine, weil sie auf
	// verschiedenen Stufen stehen — das Haus ist Vorsorge, die Werkstatt ist Unternehmen.
	'UPGRADE_HOME',
	'UPGRADE_WORKSHOP',
	// Seit 4.16: Wählen ist eine Handlung wie jede andere.
	'VOTE',
	'IDLE'
] as const;
export type NpcAction = (typeof NPC_ACTIONS)[number];

/** Der Zustand, aus dem heraus ein NPC entscheidet. */
export interface NpcState {
	personality: Personality;
	actionPoints: number;
	money: number;
	satiety: number;
	/** Wie viele essbare Stücke im Lager liegen. */
	food: number;
	hasHome: boolean;
	/** Ist ein freier Platz in Reichweite, in den er ziehen könnte? */
	homeAvailable: boolean;
	isMarried: boolean;
	isAdult: boolean;
	/** Steht ein Arbeitsplatz offen, an dem er verdienen könnte? */
	workAvailable: boolean;
	/** Hat er eine feste Anstellung? */
	hasJob: boolean;
	/** Bietet jemand mehr als die Tagelöhnerei? */
	betterJobAvailable: boolean;
	/** Gibt es jemanden, um den er werben könnte? */
	matchAvailable: boolean;
	/** Was ein Stück Nahrung kostet. */
	foodPrice: number;

	// --- Was über das Nötigste hinausgeht (4.12) --------------------------------------
	/** Trägt er ein heiles Gewand? */
	wearsGarment: boolean;
	/** Liegt eines in der Kammer, ungetragen? */
	garmentInStock: number;
	tonicInStock: number;
	/** Was ein Gewand am Markt kostet — nichts heißt: keines zu haben. */
	garmentPrice: number | null;
	tonicPrice: number | null;

	// --- Was zum Unternehmen gehört (4.13) --------------------------------------------
	/** Gehört ihm eine Werkstatt? */
	ownsWorkshop: boolean;
	/** Hat er ein unbebautes eigenes Grundstück? */
	hasFreePlot: boolean;
	/** Pachtet er eine Abbaufläche? */
	hasLease: boolean;
	/** Steht eine Fläche zur Pacht frei? */
	leaseAvailable: boolean;
	/** Liegen im eigenen Betrieb Waren, die noch niemand anbietet? */
	ownStockToSell: number;
	/** Reichen die Zutaten für einen Durchgang? */
	canCraft: boolean;
	/**
	 * Was die fehlende Zutat je Stück kostet — nichts heißt: nicht zu kaufen.
	 *
	 * **Ohne das endet jede Produktionskette nach der ersten Stufe.** Wer Getreide erntet,
	 * kann mahlen; wer Mehl braucht, muss es kaufen — und dafür gab es bis 5.17 keine
	 * Handlung. Ein Bäcker stand deshalb sein Leben lang vor einem leeren Backhaus, denn
	 * Mehl wächst auf keinem Feld.
	 */
	inputPrice: number | null;
	/** Was ein Grundstück kostet — nichts heißt: keines zu haben. */
	plotPrice: number | null;
	/** Was die billigste Werkstatt kostet, die hier fehlt. */
	workshopPrice: number | null;
	/** Fehlt für sie das Baumaterial? */
	workshopMaterialMissing: boolean;
	leaseFee: number;

	// --- Ein eigenes Dach und was daran hängt (4.14) ----------------------------------
	/** Ist im jetzigen Zuhause noch Platz für ein Kind? */
	homeHasRoom: boolean;
	/** Gehört ihm das Haus, in dem er wohnt? */
	ownsHome: boolean;
	/** Was ein eigenes Wohnhaus kostet — nichts heißt: keines zu bauen. */
	homePrice: number | null;
	/** Fehlt Baumaterial, und ist es zu kaufen? */
	materialMissing: boolean;
	materialPrice: number | null;
	/** Steht ein eigenes Gebäude schlecht genug für eine Renovierung? */
	repairNeeded: boolean;
	repairCost: number;
	/**
	 * Was die nächste Stufe des eigenen Wohnhauses kostet — nichts heißt: keines, oder
	 * schon das Großhaus. Der Winteraufschlag steckt darin, sonst nennte die Rechnung
	 * einen Preis, den die Handlung nicht hält.
	 */
	homeUpgradePrice: number | null;
	/** Dasselbe für den eigenen Betrieb. */
	workshopUpgradePrice: number | null;
	/** Hat sein Betrieb eine freie Stelle, für die noch kein Lohn aushängt? */
	canOfferJob: boolean;

	// --- Teilhabe (4.16) --------------------------------------------------------------
	/** Läuft eine Wahl, bei der er noch nicht abgestimmt hat? */
	canVote: boolean;
	/** Wie weit der Wahlkampf fortgeschritten ist — 0 am Anfang, 1 am Ende. */
	campaignProgress: number;
}

/**
 * Ab wie vielen fehlenden Aktionspunkten sich ein Trank lohnt.
 *
 * Erst wenn kaum noch etwas übrig ist: Ein Trank auf halbem Stand verschenkt die Hälfte
 * seiner Wirkung, weil er nur auffüllt, was fehlt.
 */
export const TONIC_WORTH_IT_BELOW = 3;

/**
 * Wie viel Geld einer zurücklegen will, bevor er aufhört zu arbeiten.
 *
 * Die Gier bestimmt es: Ein Genügsamer arbeitet, bis das Nötigste gedeckt ist, ein
 * Gieriger hört nie auf. Gerechnet in Mahlzeiten, nicht in Münzen — sonst hinge die
 * Zahl an den Preisen und ginge beim ersten Balancing daneben.
 */
export function desiredReserve(personality: Personality, foodPrice: number): number {
	const mahlzeiten: number = 3 + Math.round(((personality.greed + 100) / 200) * 12);
	return mahlzeiten * foodPrice;
}

/**
 * Worauf einer gerade spart — oder nichts, wenn er nichts vorhat.
 *
 * **Das ist die Antwort auf Punkt 55.** Bis hierher arbeitete ein NPC nur, solange sein
 * Geld unter der Rücklage lag; war sie voll, hörte er auf. Für ein Grundstück braucht er
 * aber Rücklage *plus* Kaufpreis — und über die Rücklage kam er nie. Gemessen an der
 * Seed-Welt: Nach zwei Spieljahren standen die Einwohner in 508 von 800 Runden untätig
 * herum, mit 21 bis 45 Münzen in der Tasche, und kein Grundstück hatte den Besitzer
 * gewechselt. Die Stadt stand nicht still, weil ihr Geld fehlte, sondern weil niemand
 * einen Grund hatte, mehr zu verdienen als für das Brot von morgen.
 *
 * **Gespart wird auf den nächsten Schritt, nicht auf das ganze Vorhaben.** Erst das
 * Grundstück, dann das Haus darauf. Kleine Ziele halten den Fortschritt sichtbar, und
 * niemand hängt an einer Summe, die er in seinem Leben nicht erreicht.
 *
 * Die Reihenfolge entspricht der Bedürfnishierarchie: Das Dach für die Familie geht dem
 * Unternehmen vor. Wer nichts vorhat — der Genügsame ohne Ehrgeiz, der Verheiratete mit
 * eigenem Haus —, spart auch nicht; er arbeitet bis zur Rücklage und lebt sein Leben.
 */
export function savingsTarget(state: NpcState): number | null {
	if (!state.isAdult) return null;

	// Ein Dach für die Familie — dieselbe Bedingung wie in `eigenesDach`.
	if (state.isMarried && !state.ownsHome && state.homePrice !== null) {
		if (!state.materialMissing) {
			if (!state.hasFreePlot) return state.plotPrice;
			return state.homePrice;
		}
		// **Ein Ziel, das man nicht kaufen kann, ist kein Ziel.** Fehlt das Baumaterial und
		// bietet es niemand an, war das Sparen hier zu Ende: `materialPrice` ist `null`,
		// das Vorhaben also unbezifferbar — und wer nichts vorhat, arbeitet nur bis zur
		// Rücklage. Genau daran stand die Welt still (Punkt 63): Alle acht waren
		// verheiratet und ohne Haus, keiner kam je über die Rücklage, 91 von 100 Runden
		// Müßiggang bei vollem Aktionsvorrat.
		//
		// Deshalb wird hier **durchgefallen** statt aufgegeben. Wer bauen will und kein
		// Holz findet, hat immer noch einen zweiten Weg: selbst eine Werkstatt aufmachen.
		// Und das ist keine Ausweichhandlung, sondern die Lösung — die billigste fehlende
		// ist die Zimmerei, und die stellt genau die Bretter her, an denen es scheitert.
		if (state.materialPrice !== null) return state.materialPrice;
	}

	// **Und ein volles Haus spart auf den Anbau** (5.30). Dieselbe Bedingung wie in
	// `eigenesDach`: Laufen Sparen und Handeln auseinander, spart einer auf etwas, das er
	// nie tut.
	if (state.isMarried && state.ownsHome && !state.homeHasRoom) {
		if (state.homeUpgradePrice !== null) return state.homeUpgradePrice;
	}

	// Etwas Eigenes — nur, wen sein Wesen dazu drängt. Sonst spart die halbe Stadt auf eine
	// Werkstatt, und es gäbe niemanden mehr, der darin arbeitet.
	if (!state.ownsWorkshop && isEnterprising(state.personality)) {
		if (!state.hasFreePlot) return state.plotPrice;
		if (state.workshopMaterialMissing) return state.materialPrice;
		return state.workshopPrice;
	}

	// **Und der Betrieb braucht Nachschub.** Wer eine Werkstatt hat, aber keine Fläche,
	// spart auf die Pacht — dieselbe Voraussetzung, unter der `entfaltung` pachtet. Ohne
	// das war der erste Betrieb der Welt eine Sackgasse: Die Zimmerei stand nach
	// neunhundert Ticks noch immer ohne Holz da, weil ihre Besitzerin über die Rücklage
	// hinaus keinen Grund mehr zu arbeiten hatte — sie hatte ihr Ziel ja erreicht.
	//
	// Die gekaufte Zutat geht der Pacht vor: Wo es sie zu kaufen gibt, ist sie der kürzere
	// Weg — und für die zweite Stufe einer Kette der einzige, weil Mehl auf keinem Feld
	// wächst.
	if (state.ownsWorkshop && !state.canCraft) {
		if (state.inputPrice !== null) return state.inputPrice;
		if (!state.hasLease && state.leaseAvailable) return state.leaseFee;
	}

	// **Und wer sie zu nutzen weiß, spart auf die größere** (5.30). Der letzte Punkt der
	// Liste, weil er der teuerste und der am wenigsten dringliche ist: Eine Werkstatt, die
	// läuft, ernährt ihren Mann auch auf der ersten Stufe.
	//
	// **Dass das hier stehen darf, hängt an `hatEigeneArbeit`.** Ohne jene Prüfung war
	// dieses Ziel verheerend — es schickte den Werkstattbesitzer zum Tagelohn und ließ
	// seinen Betrieb stillstehen. Mit ihr sagt es nur noch, was es sagen soll: Arbeite
	// weiter, du hast noch etwas vor. Die Reihenfolge der beiden Änderungen ist deshalb
	// keine Laune — die zweite ohne die erste ist ein Rückschritt, und ein gemessener.
	if (state.ownsWorkshop && state.canCraft && isEnterprising(state.personality)) {
		if (state.workshopUpgradePrice !== null) return state.workshopUpgradePrice;
	}

	return null;
}

/**
 * Ab welcher Sättigung einer sich ums Essen kümmert.
 *
 * Der Fleißige sorgt früher vor, der Träge wartet, bis es zwickt. Die Spanne liegt
 * bewusst über der Schwelle, ab der Not weh tut — auch der Trägste soll sich rühren,
 * bevor er geschwächt ist.
 */
export function eatingThreshold(personality: Personality): number {
	const spanne: number = SATIETY_COMFORTABLE - SATIETY_WEAKENED;
	return SATIETY_WEAKENED + Math.round(((personality.diligence + 100) / 200) * spanne);
}

/**
 * Die Entscheidung.
 *
 * **Die Rangfolge ist eine Bedürfnishierarchie**, keine Willkür — wer hungert, denkt nicht
 * an ein Gewand, und wer kein Dach hat, gründet keinen Betrieb. Die Stufen sind an Maslow
 * angelehnt, und sie leisten hier mehr als eine Ordnung: Sie beantworten die Frage, die
 * jede neue NPC-Handlung sonst einzeln aufwerfen würde — **wann tut er das?** Antwort:
 * wenn alles Darunterliegende gedeckt ist.
 *
 * Innerhalb einer Stufe entscheidet die Persönlichkeit, **ob** und **wie früh** — nicht,
 * was zuerst kommt. Ein Träger stirbt nicht am Hunger, weil er faul ist; er kümmert sich
 * nur später darum.
 */
export function decideNpcAction(state: NpcState): NpcAction {
	return (
		ueberleben(state) ??
		sicherheit(state) ??
		zugehoerigkeit(state) ??
		ansehen(state) ??
		entfaltung(state) ??
		'IDLE'
	);
}

/**
 * Warum einer nichts tut.
 *
 * **`IDLE` ist die häufigste Handlung der Welt und sagt für sich genommen nichts.** In
 * einem Messlauf über 2000 Ticks standen 11357 von 16000 Runden auf Müßiggang — und ob
 * dahinter Zufriedenheit steckte, ein leerer Aktionsvorrat oder ein Ziel, das niemand je
 * erreichen kann, war daraus nicht zu erkennen. Der schwerste Befund dieser Phase
 * (Punkt 63: ein Sparziel, das mangels Angebot `null` wurde, und damit jeder Grund zu
 * arbeiten) kam deshalb aus dem Lesen des Codes, nicht aus dem Messen. Das soll nicht
 * wieder vorkommen.
 *
 * **Eine Diagnose, keine zweite Entscheidung.** Sie wird gestellt, _nachdem_
 * `decideNpcAction` auf `IDLE` erkannt hat, und benennt die naheliegendste Blockade — sie
 * bildet nicht jede Verzweigung der Hierarchie nach. Wer sie erweitert, sollte das im
 * Blick behalten: Eine Diagnose, die von der Entscheidung abweicht, ist schlimmer als
 * keine, weil man ihr glaubt.
 */
export const IDLE_REASONS = [
	/** Ein Kind: Werben, bauen und pachten stehen ihm noch nicht offen. */
	'TOO_YOUNG',
	/** Kein Aktionspunkt übrig — er hat seinen Tag verbraucht. */
	'EXHAUSTED',
	/** Er hätte etwas vor, aber nirgends ist Arbeit zu bekommen. */
	'NO_WORK',
	/** Er spart auf etwas und ist noch nicht so weit. Der gesunde Fall. */
	'STILL_SAVING',
	/**
	 * Sein Vorhaben ist unbezifferbar: Was er bräuchte, bietet niemand an. Genau hier
	 * stand die Welt still, und genau das war von außen nicht zu sehen.
	 */
	'GOAL_UNREACHABLE',
	/** Er hat alles, was er braucht, und nichts vor. Auch das ist ein gültiges Leben. */
	'CONTENT'
] as const;
export type IdleReason = (typeof IDLE_REASONS)[number];

export function idleReason(state: NpcState): IdleReason {
	if (!state.isAdult) return 'TOO_YOUNG';
	if (state.actionPoints <= 0) return 'EXHAUSTED';

	// **Ein Ziel, das man nicht kaufen kann.** Wer ein Vorhaben hat, dem aber der Preis
	// fehlt, weil es das Nötige nirgends gibt, spart auf nichts — und arbeitet deshalb
	// nur bis zur Rücklage. Von außen sieht das aus wie Zufriedenheit.
	const willBauen: boolean =
		(state.isMarried && !state.ownsHome && state.homePrice !== null) ||
		(!state.ownsWorkshop && isEnterprising(state.personality));
	if (willBauen && savingsTarget(state) === null) return 'GOAL_UNREACHABLE';

	if (savingsTarget(state) !== null) {
		return state.workAvailable && !state.hasJob ? 'STILL_SAVING' : 'NO_WORK';
	}
	return 'CONTENT';
}

/**
 * Was ein Charakter tun darf, den gerade niemand spielt.
 *
 * **Erhalten ja, entscheiden nein.** Wer lange nicht hereinschaut, soll nicht verhungern
 * und sein Haus nicht verfallen sehen — aber er soll auch nicht heiraten, bauen oder
 * Grundstücke erwerben. Das legte fest, was der Spieler bei seiner Rückkehr vorfindet, und
 * genau davon soll ihm nichts abgenommen werden.
 *
 * Essen, arbeiten, unter ein Dach ziehen, Material kaufen und renovieren bleiben. Das
 * Dach gehört dazu, weil ein Obdachloser sich nicht erholt und keine Kinder bekommt —
 * ihn draußen stehen zu lassen wäre keine Zurückhaltung, sondern Vernachlässigung.
 */
/**
 * Ab wann ein Charakter als verwaist gilt.
 *
 * Dieselbe Spanne wie der Deckel der Aktionspunkte, und aus demselben Grund: Nach
 * achtundvierzig Ticks steht das Budget an, und jede weitere Stunde verfällt ungenutzt.
 * Genau das ist Abwesenheit — nicht, dass jemand offline wäre, sondern dass Zeit brachliegt.
 *
 * Wer nie gesehen wurde, gilt als abwesend. Das trifft NPCs (richtig) und Spieler nach
 * einem Serverstart, bis sie das erste Mal hereinschauen (ebenfalls richtig: In der
 * Zwischenzeit soll ihr Charakter essen).
 */
export const ABSENCE_AFTER_TICKS = 48;

export function isUnattended(
	lastSeenTick: number | null,
	currentTick: number,
	after: number = ABSENCE_AFTER_TICKS
): boolean {
	if (lastSeenTick === null) return true;
	return currentTick - lastSeenTick >= after;
}

export const CARETAKER_ACTIONS: readonly NpcAction[] = [
	'EAT',
	'BUY_FOOD',
	'WORK',
	'MOVE_IN',
	'BUY_MATERIAL',
	'RENOVATE'
] as const;

export function decideCaretakerAction(state: NpcState): NpcAction {
	const gewuenscht: NpcAction = decideNpcAction(state);
	if (CARETAKER_ACTIONS.includes(gewuenscht)) return gewuenscht;

	// Was die Hierarchie sonst vorschlägt, ist eine Entscheidung — und die steht dem
	// Verwalter nicht zu. Statt untätig zu bleiben, wird gearbeitet: Wer abwesend ist, soll
	// wenigstens nicht ärmer werden, und Zeit, die am Deckel der Aktionspunkte verfällt,
	// ist ohnehin verloren.
	if (state.workAvailable && state.actionPoints > 0) return 'WORK';
	return 'IDLE';
}

/**
 * Stufe 1 — **Überleben**: essen, und wenn nichts da ist, welches besorgen.
 *
 * Essen kostet keinen Aktionspunkt: Wer erst dafür arbeiten müsste, verhungerte
 * ausgerechnet dann, wenn er schon geschwächt ist.
 */
function ueberleben(state: NpcState): NpcAction | undefined {
	const hungrig: boolean = state.satiety < eatingThreshold(state.personality);
	if (!hungrig) return undefined;

	if (state.food > 0) return 'EAT';
	if (state.money >= state.foodPrice) return 'BUY_FOOD';
	// Wer hungert und nichts hat, arbeitet — unabhängig von seinem Fleiß. Sonst
	// verhungerte der Träge zuverlässig, und Faulheit wäre keine Eigenart mehr, sondern
	// ein Todesurteil.
	if (state.workAvailable && state.actionPoints > 0) return 'WORK';
	return undefined;
}

/**
 * Bis wohin sich Arbeiten lohnt: die Rücklage, und darüber das, was der nächste Schritt
 * kostet. Ohne Vorhaben bleibt es bei der Rücklage — die Zahl von vor Punkt 55.
 */
function sparziel(state: NpcState): number {
	const ruecklage: number = desiredReserve(state.personality, state.foodPrice);
	return ruecklage + (savingsTarget(state) ?? 0);
}

/**
 * Stufe 2 — **Sicherheit**: ein Dach, ein Auskommen, eine Rücklage.
 *
 * Was hier steht, schützt vor der Stufe darunter: Die Anstellung sichert das Essen von
 * morgen, das Dach die Kinder von übermorgen (ohne Wohnraum keine Geburt, siehe 4.4).
 */
function sicherheit(state: NpcState): NpcAction | undefined {
	// Eine feste Stelle nehmen, wenn sie mehr bringt als die Tagelöhnerei. Kostet nichts
	// und wirkt ab der nächsten Schicht — deshalb vor dem Arbeiten.
	if (!state.hasJob && state.betterJobAvailable && state.isAdult) return 'TAKE_JOB';

	// Wieder zu Kräften kommen, wenn Arbeit wartet. Der Trank füllt nur auf, was fehlt;
	// im Müßiggang wäre er ein teures Getränk.
	if (
		state.actionPoints < TONIC_WORTH_IT_BELOW &&
		state.tonicInStock > 0 &&
		(state.hasJob || state.workAvailable)
	) {
		return 'DRINK_TONIC';
	}

	// Verdienen, bis die Rücklage steht. Wie hoch sie ist, sagt die Gier — und wer etwas
	// vorhat, arbeitet darüber hinaus, bis der nächste Schritt bezahlt ist (Punkt 55).
	//
	// **Aber nicht, wer eigene Arbeit liegen hat** (5.30). Tagelohn steht hier, eine
	// ganze Stufe über der Entfaltung, und griff deshalb bei jedem, der ein Sparziel
	// hatte — auch bei dem, der eine Werkstatt voller Zutaten und eine reife Pacht besaß.
	// Gemessen an zwei Läufen mit Ausbau-Sparzielen: `WORK` fast verdoppelt, `HARVEST`
	// um dreiundneunzig Prozent eingebrochen. Die Bäuerin ließ Hof und Zimmerei liegen
	// und richtete fremde Häuser her.
	//
	// Das war nie gemeint. Der Tagelohn ist der Weg dessen, der **keinen anderen hat** —
	// wer nichts besitzt, kommt an ein Grundstück nur über Lohn, und dafür wurde das
	// Sparziel erfunden. Wer erntet, verarbeitet und verkauft, hat einen besseren Weg und
	// verdient daran mehr; sich daneben zu verdingen, ist die schlechtere Wahl und wäre
	// es auch für einen Menschen.
	//
	// Geprüft wird auf **jetzt** verfügbare eigene Arbeit, nicht auf Besitz: Wem die
	// Zutaten ausgegangen sind und wer keine Fläche hat, für den ist der Tagelohn wieder
	// der richtige Weg — und genau so kommt er an das Geld für Nachschub.
	if (
		state.workAvailable &&
		state.actionPoints > 0 &&
		state.money < sparziel(state) &&
		!hatEigeneArbeit(state)
	) {
		return 'WORK';
	}

	if (!state.hasHome && state.homeAvailable) return 'MOVE_IN';

	// Ein eigenes Dach für die Familie — und die Instandhaltung dessen, was steht.
	const dach = eigenesDach(state);
	if (dach) return dach;

	// Was verfällt, verliert Wohnraum und Ertrag. Wer nicht renoviert, steht in zwanzig
	// Spieljahren vor einer Ruine.
	// **Genug Punkte für die ganze Reparatur, nicht nur für einen.** Sie kostet vier;
	// geprüft wurde auf mehr als null — derselbe Fehler wie einst beim Werben, und mit
	// derselben Folge: Der Entschluss fiel, `renovateBuilding` scheiterte an
	// `NOT_ENOUGH_ACTION_POINTS`, und in der Statistik stand `RENOVATE`, als wäre
	// hergerichtet worden. Weil ein NPC bei jedem einzelnen Punkt arbeiten geht, solange
	// er unter seinem Sparziel liegt, traf das praktisch jeden Versuch: Kein NPC hat je
	// ein eigenes Haus instand gesetzt.
	if (state.repairNeeded) {
		const uebrig: number = state.money - desiredReserve(state.personality, state.foodPrice);
		if (state.materialMissing) {
			// Material besorgen kostet Geld, aber keine Kraft — es liegt bereit, wenn die
			// Punkte zusammen sind. Deshalb steht der Kauf vor der Schwelle, nicht dahinter.
			if (state.materialPrice !== null && uebrig >= state.materialPrice) return 'BUY_MATERIAL';
		} else if (state.actionPoints >= RENOVATION_ACTION_POINT_COST && uebrig >= state.repairCost) {
			return 'RENOVATE';
		}
	}

	return undefined;
}

/**
 * Stufe 3 — **Zugehörigkeit**: eine Familie gründen.
 *
 * Der Gesellige wirbt, der Eigenbrötler seltener — aber auch er kommt irgendwann dazu,
 * sonst stürbe seine Linie an seinem Wesen.
 */
function zugehoerigkeit(state: NpcState): NpcAction | undefined {
	// **Wählen kostet keine Aktionspunkte** — wie Essen. Wer erst dafür arbeiten müsste,
	// verzichtete ausgerechnet dann darauf, wenn es ihm schlecht geht; die Ärmsten gingen
	// nie zur Wahl, und das wäre eine Aussage über diese Welt, die wir nicht treffen
	// wollen.
	//
	// **Wann** einer geht, sagt sein Wesen (siehe `votingDelay`): Der Fleißige und
	// Ehrgeizige am ersten Tag, der Träge kurz vor Schluss — und wer vorher stirbt, hat
	// eben nicht gewählt.
	if (state.canVote && state.campaignProgress >= votingDelay(state.personality)) {
		return 'VOTE';
	}

	// **Genug Punkte für das ganze Werben, nicht nur für einen.** Es kostet zwei; geprüft
	// wurde auf mehr als null. Wer genau einen übrig hatte, wählte also das Werben und
	// scheiterte daran — im ersten Messlauf mit Fehlschlagzählung waren das 19 von 36
	// Versuchen, und vorher hatte es nie jemand gesehen: In der Statistik stand `COURT`,
	// als wäre geworben worden.
	if (
		!state.isMarried &&
		state.isAdult &&
		state.matchAvailable &&
		state.actionPoints >= COURT_ACTION_POINT_COST &&
		state.personality.sociability > -80
	) {
		return 'COURT';
	}
	return undefined;
}

/**
 * Stufe 4 — **Ansehen**: wie man dasteht.
 *
 * Gekauft wird nur über der Rücklage. Ein NPC, der sein letztes Geld für ein Gewand
 * ausgibt, verhungert darin — und die Rücklage hängt an der Gier: Der Genügsame kauft
 * früher, der Raffende später.
 */
function ansehen(state: NpcState): NpcAction | undefined {
	// Anziehen kostet nichts und wirkt bei jedem Umgang — deshalb vor dem Kaufen.
	if (!state.wearsGarment && state.garmentInStock > 0) return 'WEAR_GARMENT';

	const uebrig: number = state.money - desiredReserve(state.personality, state.foodPrice);

	// Kleidung nur, wer überhaupt unter Leute geht. Dem Eigenbrötler ist gleich, wie er
	// aussieht.
	if (
		!state.wearsGarment &&
		state.garmentInStock === 0 &&
		state.garmentPrice !== null &&
		uebrig >= state.garmentPrice &&
		state.personality.sociability > -50
	) {
		return 'BUY_GARMENT';
	}

	// Einen Trank auf Vorrat nimmt nur mit, wer arbeitet.
	if (
		state.tonicInStock === 0 &&
		state.tonicPrice !== null &&
		uebrig >= state.tonicPrice &&
		(state.hasJob || state.workAvailable)
	) {
		return 'BUY_TONIC';
	}

	return undefined;
}

/**
 * Stufe 5 — **Entfaltung**: etwas Eigenes aufbauen.
 *
 * Hier wird aus einem Einwohner ein Unternehmer: ein Grundstück kaufen, eine Werkstatt
 * darauf stellen, Rohstoff pachten, herstellen, verkaufen. Alles davon konnten bisher nur
 * Spieler — und solange das so war, gehörte jeder Betrieb der Welt einem Menschen am
 * Bildschirm. Fiel der letzte weg, stellte niemand mehr etwas her.
 *
 * **Dass es ganz oben steht, ist die Antwort auf die Balancing-Frage.** Ein NPC, der bei
 * jeder Gelegenheit baut, verwandelt die Stadt in eine Fabriklandschaft. Hier baut nur,
 * wer satt ist, ein Dach hat, versorgt ist und Geld übrig hat — und selbst dann nur, wenn
 * sein Wesen dazu drängt.
 *
 * Die Reihenfolge innerhalb der Stufe geht **vom Vorhandenen zum Neuen**: erst
 * verwerten, was da ist (verkaufen, herstellen, ernten), dann erweitern (pachten,
 * bauen, kaufen). Sonst häufte einer Grundstücke an, während in seiner Werkstatt die
 * Ware verdirbt.
 */
function entfaltung(state: NpcState): NpcAction | undefined {
	if (!state.isAdult || state.actionPoints <= 0) return undefined;

	// Verkaufen: Was im eigenen Betrieb liegt, bringt erst als Angebot Geld. Ohne diesen
	// Schritt wäre die ganze Stufe eine Beschäftigungstherapie.
	if (state.ownStockToSell > 0) return 'SELL';

	// Leute suchen. Kostet nichts und macht aus der Einmannsache einen Betrieb — die
	// Angestellten stellen her, während der Eigentümer anderes tut.
	if (state.canOfferJob) return 'OFFER_JOB';

	// **Die Werkstatt ertüchtigen, ehe man in ihr arbeitet** (5.29).
	//
	// Die Stelle ist keine Bequemlichkeit, sondern die einzige, die je erreicht wird: Wer
	// Zutaten hat, kehrt bei `CRAFT` um, und wer eine Pacht hat, bei `HARVEST`. Alles,
	// was danach steht, sieht ein laufender Betrieb nie. Genau deshalb baut hier niemand
	// eine zweite Werkstatt — was für `BUILD` gewollt ist (`!state.ownsWorkshop`), wäre
	// für den Ausbau das Ende gewesen.
	//
	// `canCraft` als Bedingung, nicht bloß als Reihenfolge: Wer nichts zu verarbeiten
	// hat, braucht keine größere Werkstatt — dem fehlt Rohstoff, und dafür gibt es
	// `BUY_INPUT` und `LEASE` weiter unten. Es kostet ihn einen Durchgang, und den ist
	// es wert.
	if (state.ownsWorkshop && state.canCraft && isEnterprising(state.personality)) {
		const uebrigFuerAusbau: number =
			state.money - desiredReserve(state.personality, state.foodPrice);
		if (
			state.workshopUpgradePrice !== null &&
			uebrigFuerAusbau >= state.workshopUpgradePrice &&
			state.actionPoints >= UPGRADE_ACTION_POINT_COST
		) {
			return 'UPGRADE_WORKSHOP';
		}
	}

	// Herstellen, solange Zutaten da sind.
	if (state.canCraft) return 'CRAFT';

	// Ernten, was die gepachtete Fläche hergibt.
	if (state.hasLease) return 'HARVEST';

	const uebrig: number = state.money - desiredReserve(state.personality, state.foodPrice);

	// **Zutaten kaufen, was nicht aus dem Boden kommt.** Die zweite Stufe jeder Kette hat
	// keine Fläche: Mehl wächst nicht, es wird gemahlen. Wer einen Betrieb hat, dem die
	// Zutat fehlt, und sie am Markt findet, holt sie sich dort — das ist zugleich die
	// Nachfrage, von der die Stufe davor lebt.
	if (state.ownsWorkshop && !state.canCraft && state.inputPrice !== null) {
		if (uebrig >= state.inputPrice) return 'BUY_INPUT';
	}

	// Eine Fläche pachten, wenn der eigene Betrieb Rohstoff braucht.
	if (state.ownsWorkshop && !state.hasLease && state.leaseAvailable && uebrig >= state.leaseFee) {
		return 'LEASE';
	}

	// **Bauen ist die teuerste Entscheidung und steht deshalb hinten.** Wer nichts
	// unternimmt, verliert nichts; wer zu früh baut, hat kein Geld mehr für Brot.
	//
	// Geprüft wird auch das Material: Ein NPC, der es nicht hat, versuchte es sonst in
	// **jedem** Tick aufs Neue und käme nie dazu, etwas anderes zu tun. Genau das war im
	// Selbsterhaltungstest zu sehen — sieben von acht standen Tick für Tick vor demselben
	// leeren Bauplatz.
	if (
		!state.ownsWorkshop &&
		state.hasFreePlot &&
		state.workshopPrice !== null &&
		!state.workshopMaterialMissing &&
		uebrig >= state.workshopPrice &&
		isEnterprising(state.personality)
	) {
		return 'BUILD';
	}

	// Ein Grundstück, um darauf zu bauen. Erst danach lohnt der Blick auf die Werkstatt.
	if (
		!state.ownsWorkshop &&
		!state.hasFreePlot &&
		state.plotPrice !== null &&
		uebrig >= state.plotPrice &&
		isEnterprising(state.personality)
	) {
		return 'BUY_PLOT';
	}

	return undefined;
}

/**
 * Hat er Arbeit, die auf ihn wartet?
 *
 * Die drei Handlungen der Entfaltung, die Geld einbringen: verkaufen, was im Lager liegt,
 * verarbeiten, was an Zutaten da ist, ernten, was die Pacht hergibt. Wer eines davon
 * kann, verdingt sich nicht für Tagelohn.
 *
 * **Volljährig muss er sein**, denn nur dann kommt die Entfaltung überhaupt zum Zug — ein
 * Kind, dem man hier den Tagelohn nähme, stünde untätig da.
 */
function hatEigeneArbeit(state: NpcState): boolean {
	return state.isAdult && (state.ownStockToSell > 0 || state.canCraft || state.hasLease);
}

/**
 * Ab wann einer etwas Eigenes wagt.
 *
 * Ehrgeiz treibt, Trägheit bremst, und beides zusammen ergibt die Neigung. Die Schwelle
 * liegt über der Mitte: Ein Betrieb ist Arbeit, und die meisten Leute begnügen sich mit
 * einer Anstellung — sonst stünde nach zwei Generationen in jeder Gasse eine Werkstatt,
 * und niemand wäre mehr da, der darin arbeitet.
 */
export const ENTERPRISE_THRESHOLD = 20;

export function isEnterprising(personality: Personality): boolean {
	return (personality.ambition + personality.diligence) / 2 >= ENTERPRISE_THRESHOLD;
}

/**
 * Ab welchem Zustand ein NPC sein eigenes Haus herrichtet.
 *
 * Dieselbe Schwelle wie beim Bürgermeister und den öffentlichen Bauten (4.7c): bei der
 * Hälfte. Früher wäre Verschwendung, später verliert das Haus schon Wohnraum — und wer
 * nicht renoviert, dessen Werk fällt nach zwanzig Spieljahren zur Ruine.
 */
export const REPAIR_BELOW = 50;

/**
 * Ein eigenes Dach — die Stufe, an der die Bevölkerung hängt.
 *
 * **Ohne Platz keine Kinder** (4.4), und die städtische Unterkunft ist ein Auffangnetz,
 * kein Zuhause: Sie fasst zwanzig, und wenn sie voll ist, wächst niemand mehr nach. Wer
 * eine Familie gründet, baut deshalb sein eigenes Haus, **auch wenn in der Unterkunft
 * noch ein Bett frei wäre** — die freie Pritsche ist kein Grund, keine Kinder zu bekommen.
 *
 * Deshalb steht der Hausbau in der **Sicherheitsstufe** und nicht bei der Entfaltung: Er
 * ist kein Unternehmen, sondern Vorsorge.
 *
 * Die drei Schritte in ihrer natürlichen Folge — erst das Material, dann der Boden, dann
 * das Haus. Jeder einzelne ist eine Handlung, und jede kann daran scheitern, dass das
 * Geld nicht reicht; dann wartet er eben und arbeitet weiter.
 */
function eigenesDach(state: NpcState): NpcAction | undefined {
	// **Ist das eigene Haus voll, wird angebaut** (5.29). Derselbe Beweggrund, der es
	// hat bauen lassen: ohne Platz keine Kinder. Und dieselbe Zurückhaltung — geprüft
	// wird, ob wirklich kein Bett mehr frei ist, sonst baute jeder Verheiratete sein Haus
	// bis zum Großhaus aus, bloß weil er es sich leisten kann.
	//
	// Der Kraftvorrat, den die höhere Stufe trägt, kommt dabei mit heraus, ist aber nicht
	// der Grund: Ein NPC, der ausbaut, um mehr Aktionspunkte anzusammeln, rechnet — und
	// diese Welt entscheidet aus Bedürfnissen.
	if (state.isMarried && state.ownsHome && !state.homeHasRoom) {
		const uebrig: number = state.money - desiredReserve(state.personality, state.foodPrice);
		if (
			state.homeUpgradePrice !== null &&
			uebrig >= state.homeUpgradePrice &&
			state.actionPoints >= UPGRADE_ACTION_POINT_COST
		) {
			return 'UPGRADE_HOME';
		}
	}

	// Nur wer eine Familie hat, braucht ein Haus. Ein Alleinstehender ist in der
	// Unterkunft versorgt — und wer schon eines besitzt, baut kein zweites.
	if (!state.isMarried || state.ownsHome) return undefined;
	if (state.homePrice === null) return undefined;

	const uebrig: number = state.money - desiredReserve(state.personality, state.foodPrice);
	if (uebrig < state.homePrice) return undefined;

	if (state.materialMissing) {
		return state.materialPrice !== null && uebrig >= state.materialPrice
			? 'BUY_MATERIAL'
			: undefined;
	}
	if (!state.hasFreePlot) {
		return state.plotPrice !== null && uebrig >= state.plotPrice ? 'BUY_PLOT' : undefined;
	}
	return 'BUILD_HOME';
}
