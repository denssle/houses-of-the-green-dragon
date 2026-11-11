import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Region } from '$lib/db/model/region';
import { Skill } from '$lib/db/model/skill';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { Event } from '$lib/db/model/event';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import type { EventKind } from '$lib/game/chronicle.logic';
import type { IdleReason, NpcAction } from '$lib/game/npc.logic';
import * as needService from '$lib/server/service/needService';
import * as buildingService from '$lib/server/service/buildingService';
import {
	hatEmpfaenger,
	type Kassenabfluss,
	type Kassenbuch,
	type Kassenzufluss,
	kassenbuch,
	kassenbuchLeeren
} from '$lib/server/service/treasuryService';
import { tickWorld } from '$lib/server/worldTick';
import { FERTILE_FROM_AGE, FERTILE_TO_AGE } from '$lib/game/family.logic';
import { AGE_OF_MAJORITY, ageInYears } from '$lib/game/time';
import { PFAND_DECKUNG, protokollieren } from '$lib/server/service/npcService';
import * as electionService from '$lib/server/service/electionService';
import * as plotService from '$lib/server/service/plotService';
import { ledigeErwachsene } from '$lib/server/service/migrationService';
import * as auctionService from '$lib/server/service/auctionService';
import { DEVELOPMENT_SHIFTS_PER_PLOT } from '$lib/game/auction.logic';
import { Op } from 'sequelize';
import { Law } from '$lib/db/model/law';
import { CONDITION_MAX } from '$lib/game/building.logic';
import type { LawKind } from '$lib/game/law.logic';
import { ladeDump } from '$lib/server/simulation/ausDump';
import * as lawService from '$lib/server/service/lawService';

/**
 * Eine Welt laufen lassen und aufschreiben, was passiert.
 *
 * **Warum das kein Test ist.** Ein Test behauptet etwas und schlägt fehl, wenn es nicht
 * stimmt. Dieses Werkzeug behauptet nichts — es *zeigt*, und die Deutung bleibt beim
 * Menschen davor. Beides in einer Datei unterzubringen ging dreimal schief: In dieser
 * Phase entstanden drei Wegwerf-Specs, jeder mit neu erfundener Instrumentierung, und
 * jeder war beim ersten Anlauf falsch (falscher Modellpfad, ein Feld, das es nicht gibt,
 * eine Transaktion, die fehlte). Einmal richtig ist billiger als jedes Mal neu.
 *
 * **Was hier hineingehört und was nicht:** Alles, was eine Frage der Art „warum passiert
 * nichts" beantwortet. Nichts, was die Welt verändert — dieses Werkzeug beobachtet.
 */

export interface MeasureOptions {
	/** Wie viele Ticks. 50 sind ein Spieljahr. */
	ticks: number;
	/** Nach wie vielen Ticks ein Zwischenstand fällig ist. */
	every?: number;
	/** Eine frische Welt anlegen (Standard) oder auf der bestehenden weiterlaufen. */
	seed?: boolean;
	/**
	 * Der Startwert des Würfels — ohne ihn würfelt der Lauf frei (`Math.random`).
	 *
	 * **Warum das nachgereicht werden musste** (5.64): Zwei Läufe ohne Saat sind zwei
	 * verschiedene Städte. Solange das so war, ließ sich mit diesem Werkzeug ein Zustand
	 * *beschreiben*, aber keine Änderung *belegen* — der Vergleich vorher/nachher maß die
	 * Ausgangslage mit. Genau daran ist der erste Anlauf zu Punkt 86 gescheitert: Der Lauf
	 * danach zeigte etwas anderes als der davor, und niemand konnte sagen, wieviel davon
	 * die Änderung war.
	 *
	 * Gewürfelt wird beim Weltaufbau und überall im Takt — Geburt, Tod, Zuzug, Unglück.
	 * Alle bekommen **denselben** Würfel, damit ein Lauf als Ganzes wiederholbar ist.
	 *
	 * Der freie Wurf bleibt der Standard: Ob die Welt auch bei anderen Ausgangslagen lebt,
	 * beantwortet kein fester Startwert. Wer vergleichen will, setzt einen.
	 */
	saat?: number;
	/**
	 * Wessen Leben Tick für Tick mitgeschrieben wird — ein Vorname.
	 *
	 * **Für die Frage, die ein Aggregat nie beantwortet** (5.88): warum *dieser* Mensch
	 * nichts tut. Sie kam am 06.09.2026 auf, als einer mit vollen Aktionspunkten und fünf
	 * Münzen verhungerte; drei Anläufe, sie aus dem Code zu beantworten, brachten drei
	 * Vermutungen und eine falsche darunter.
	 *
	 * Ohne Namen wird nichts mitgeschrieben. Der erste Lebende, der so heißt, wird
	 * verfolgt; stirbt er, endet das Protokoll mit ihm.
	 */
	verfolge?: string;
	/**
	 * Was jeder beim Start in die Hand bekommt — testweise, um eine Sperre auszuschließen.
	 *
	 * **Kein Weltinhalt, sondern ein Werkzeug:** Wenn niemand pachtet und niemand baut,
	 * ist die erste Frage, ob es am Geld liegt. Sie lässt sich beantworten, indem man
	 * genug davon verteilt und nachsieht, ob es dann läuft — ohne die Startbedingungen der
	 * Welt (Punkt 14) anzurühren. Zuzügler bekommen denselben Betrag, sonst misst der Lauf
	 * ab dem zwanzigsten Tick wieder die alte Welt.
	 */
	startgeld?: number;
	/**
	 * **`MEASURE_FOOD=20`** legt jedem Lebenden und jedem Ankömmling so viele Laibe in die
	 * Kammer (5.95, Punkt 85).
	 *
	 * Das Gegenstück zu `startgeld`, und aus demselben Grund gebaut: Als der Kornspeicher
	 * probeweise gestrichen war (5.95, wieder zurückgenommen), verhungerte die Stadt binnen
	 * zehn Spieljahren — bei einem Lauf mit 400 Münzen je Kopf sogar etwas schneller. Geld
	 * war also nicht die Sperre. Die Frage danach lautet: Schafft es die Brotkette, wenn sie
	 * überhaupt Zeit bekommt? Dafür braucht die Gründergeneration Vorrat und keine Münzen.
	 *
	 * Ein Werkzeug, kein Weltinhalt — was eine Welt mitbekommt, ist Punkt 14.
	 */
	startvorrat?: number;
	/**
	 * **Eine Sicherung statt einer frischen Welt** (0.9.4, Punkt 122): Pfad zu einem
	 * MariaDB-Dump, gezippt oder nicht. Der Lauf setzt dort fort, wo die Sicherung stand —
	 * siehe `ausDump.ts`. `seed` gilt dann nicht.
	 */
	ausDump?: string;
	/**
	 * **Ein Gesetz festhalten** (0.9.4), etwa `{ PROPERTY_TAX: 0 }` — für den Gegenlauf
	 * „was wäre ohne die Steuer gewesen". Eingetragen als Erlass mit einem Tick, den kein
	 * echter je überholt; der Bürgermeister kann dagegen nichts ausrichten. Ein Eingriff in
	 * die Welt, und deshalb steht er im Kopf des Berichts.
	 */
	gesetze?: Partial<Record<LawKind, number>>;
	/**
	 * **Gebäude beim Start instand setzen** (0.9.4), nach Namen — etwa `['Schmiede']` für
	 * den Gegenlauf „was wäre, wenn sie nicht eingestürzt wäre". Nur private Gebäude; ein
	 * städtisches stürzt ohnehin nicht ein.
	 */
	instandsetzen?: string[];
}

/** Der Tick, den ein festgehaltenes Gesetz trägt — jünger als jeder echte Erlass. */
const FESTGEHALTEN = 2_000_000_000;

/**
 * Ab welchem Tick die Chronik zu diesem Lauf gehört (0.9.4).
 *
 * Bei einer frischen Welt ist das gleichgültig, die Chronik beginnt mit ihr. Eine geladene
 * Sicherung bringt aber ihre ganze Vorgeschichte mit, und ohne diese Grenze stünden im
 * Bericht die Brände und Ruinen der letzten Monate.
 */
let messbeginn = 0;

export interface Measurement {
	lines: string[];
}

/** Was die Stadt in der Kasse hat. */
async function stadtkasse(stadtId: string): Promise<number> {
	return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
}

/** Alles Geld in Bürgerhand — zeigt, ob die Wirtschaft wächst oder ausblutet. */
async function geldmenge(): Promise<number> {
	const leute = await Character.findAll({ where: { deathTick: null } });
	return leute.reduce((summe, person) => summe + person.dataValues.money, 0);
}

/**
 * Woher das Geld kam und wohin es ging — soweit sich das ohne Kassenbuch sagen lässt.
 *
 * **Die Identität, auf der alles beruht:** Der Geldbestand der Welt ist alles in
 * Bürgerhand plus die Stadtkasse. Er wächst nur durch Zuzug — jeder Ankömmling bringt
 * seine Ersparnisse von außerhalb mit. Wächst er um **weniger** als das, ist der Rest
 * unterwegs vernichtet worden.
 */
async function bilanzzeilen(
	stadtId: string,
	vorher: number,
	bilanz: { zuzug: number; geschenkt: number }
): Promise<string[]> {
	const buerger: number = await geldmenge();
	const kasse: number = await stadtkasse(stadtId);
	const nachher: number = buerger + kasse;
	// **Auch geschenktes Geld kommt von außen** (5.88). Das Startgeld eines Messlaufs ist
	// kein Fund in der Welt; stünde es nicht hier, meldete die Bilanz jedes Mal, es sei
	// Geld aus dem Nichts entstanden — und die eine Zahl, für die es diesen Abschnitt
	// gibt, wäre falsch.
	const vonAussen: number = bilanz.zuzug + bilanz.geschenkt;
	const vernichtet: number = vonAussen - (nachher - vorher);

	return [
		`  Bestand am Anfang ${vorher}, am Ende ${nachher} (Bürger ${buerger}, Kasse ${kasse})`,
		`  Von außen zugeflossen (Zuzug) ${bilanz.zuzug}` +
			(bilanz.geschenkt > 0 ? `, dazu Startgeld an Zugezogene ${bilanz.geschenkt}` : ''),
		`  **Vernichtet ${vernichtet}** — Geld, das die Kasse verließ, ohne dass jemand es bekam`
	];
}

/**
 * Das Kassenbuch, ausgeschrieben (5.77, Punkt 101).
 *
 * **Die Zeile, die hier bis 5.76 stand**, hieß „dazu Kornspeicher, Standgeld, Zehnt, Pacht,
 * Einzugsgeld und Grundstücksverkauf — nicht getrennt". Sie war ehrlich und nutzlos: Als
 * die Grundsteuer im Lauf nach 5.76 auf ein Viertel fiel, ließ sich nicht sagen, ob der
 * Rest der Kasse das aufgefangen hat oder mitgefallen ist (Punkt 107 — der sich später als
 * Streuung herausstellte, was ohne diese Aufschlüsselung ebenso wenig zu sagen gewesen
 * wäre).
 *
 * **Bei jeder Ausgabe steht, ob jemand das Geld bekommt.** Das ist keine Verzierung: Ihre
 * Summe war der Teil des vernichteten Geldes, den die Stadt selbst verbrennt — die Zahl,
 * um die es in Punkt 102 ging. **Seit 5.93 steht dort null**, weil es keinen Grund ohne
 * Empfänger mehr gibt; die Zeile bleibt trotzdem, denn sie ist der Wächter, der es
 * meldet, wenn wieder einer dazukommt.
 */
function kassenbuchzeilen(buch: Kassenbuch): string[] {
	const sortiert = <T extends string>(posten: Partial<Record<T, number>>): [T, number][] =>
		(Object.entries(posten) as [T, number][]).sort((a, b) => b[1] - a[1]);

	const zufluesse = sortiert<Kassenzufluss>(buch.zufluss);
	const abfluesse = sortiert<Kassenabfluss>(buch.abfluss);
	const summe = (posten: [string, number][]): number =>
		posten.reduce((zahl, [, betrag]) => zahl + betrag, 0);
	const ohneEmpfaenger: number = summe(abfluesse.filter(([grund]) => !hatEmpfaenger(grund)));

	return [
		`  Eingenommen ${summe(zufluesse)}:`,
		...zufluesse.map(([grund, betrag]) => `    ${grund} ${betrag}`),
		`  Ausgegeben ${summe(abfluesse)}, davon **${ohneEmpfaenger} an niemanden**:`,
		...abfluesse.map(
			([grund, betrag]) =>
				`    ${grund} ${betrag}${hatEmpfaenger(grund) ? ' → an Bürger' : ' → aus der Welt'}`
		)
	];
}

/** „(Alter 19, Not 12)" — leer, solange niemand gestorben ist. */
function todeNach(ursachen: Record<string, number>): string {
	const namen: Record<string, string> = { AGE: 'Alter', HUNGER: 'Not' };
	const teile = Object.entries(ursachen)
		.sort((a, b) => b[1] - a[1])
		.map(([ursache, wieoft]) => `${namen[ursache] ?? ursache} ${wieoft}`);
	return teile.length === 0 ? '' : ` (${teile.join(', ')})`;
}

function verteilung(zaehlung: Record<string, number>): string[] {
	return Object.entries(zaehlung)
		.sort((a, b) => b[1] - a[1])
		.map(([was, wieoft]) => `  ${was}: ${wieoft}`);
}

export async function measure(options: MeasureOptions): Promise<Measurement> {
	const { ticks, every = 250, seed = true, saat, verfolge, startgeld, startvorrat } = options;
	const zeilen: string[] = [];

	const wuerfel: () => number = saat === undefined ? Math.random : seededRoll(saat);

	if (options.ausDump !== undefined) {
		const geladen = await ladeDump(sequelize, options.ausDump);
		zeilen.push(
			`=== AUS DER SICHERUNG ${options.ausDump} ===`,
			`  Stand ${geladen.stand}, nachgezogen: ${geladen.nachgezogen.join(', ') || 'nichts'}`,
			''
		);
	} else {
		await sequelize.sync();
		if (seed) await seedWorld(wuerfel);
	}
	const stadtId: string = await findStartRegionId();
	const anfang: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
	messbeginn = anfang;

	const eingriffe: string[] = [];
	for (const [art, wert] of Object.entries(options.gesetze ?? {})) {
		await Law.create({
			id: `messlauf-${art}`,
			RegionId: stadtId,
			kind: art as LawKind,
			value: wert,
			enactedTick: FESTGEHALTEN,
			EnactedByCharacterId: null
		});
		eingriffe.push(`${art} festgehalten auf ${wert}`);
	}
	for (const name of options.instandsetzen ?? []) {
		const [anzahl] = await Building.update(
			{ condition: CONDITION_MAX, lastConditionTick: anfang },
			{ where: { name, ownerType: 'CHARACTER' } }
		);
		eingriffe.push(`${name} instand gesetzt (${anzahl}×)`);
	}
	if (eingriffe.length > 0) zeilen.push(`=== EINGRIFFE ===`, ...eingriffe.map((e) => `  ${e}`), '');

	const handlungen: Partial<Record<NpcAction, number>> = {};
	const fehlschlaege: Record<string, number> = {};
	const muessiggang: Partial<Record<IdleReason, number>> = {};
	// **Woran genau, und wohin das Geld der Bürger geht** (0.8.3, Punkt 101).
	const muessiggangGenau: Record<string, number> = {};
	const geldJeHandlung: Record<string, { ein: number; aus: number }> = {};
	const chronik = { geburten: 0, tode: 0, zuzug: 0, braende: 0, steuer: 0, ausgefallen: 0 };
	/** **Was die Kasse an Hungernde zurückgab** (0.11.0, Punkt 122). */
	const armenspeisung = { mahlzeiten: 0, leer: 0, ausgegeben: 0, armengeld: 0, bedacht: 0 };
	/**
	 * **Das Amt** (0.8.4). Bis hierher sagte der Bericht nichts darüber, ob überhaupt jemand
	 * regiert und was er tut — und dann ließ sich nicht unterscheiden, ob kein Bauland
	 * entsteht, weil niemand im Amt ist, oder weil der Amtsinhaber meint, es gebe noch welches.
	 */
	const amt = {
		ohneInhaber: 0,
		spieler: 0,
		npc: 0,
		wahlenEroeffnet: 0,
		wahlenOhneSieger: 0,
		wahlenMitSieger: 0
	};
	const amtshandlungen: Record<string, number> = {};
	/** **Wie sie ankamen** (0.9.0): allein, als Paar, Familie, Großfamilie — und wer. */
	const zuzugFormen: Record<string, number> = {};
	const zuzugKoepfe: Record<string, number> = {};
	/**
	 * **Der Heiratsmarkt** (0.9.0). In Grünau gab es keine einzige ledige Frau mehr, während
	 * vier Männer warteten — und davon stand im Bericht nichts. Gezählt in Ticks.
	 */
	const heiratsmarkt = { maennerTicks: 0, frauenTicks: 0, ohneFrauMitMann: 0, ohneMannMitFrau: 0 };
	/** **Der Kreditbedarf** (0.8.6, Punkt 43) — gäbe es eine Leihstube, hätte sie Kunden? */
	const kreditbedarf: Record<
		string,
		{
			faelle: number;
			mitPfand: number;
			luecke: number;
			lueckeMitPfand: number;
			koepfe: Set<string>;
		}
	> = {};
	/** Wie oft Bürger und Amt das Land verschieden sahen (0.8.4). */
	const land = {
		buergerOhneBauland: 0,
		amtSiehtFreiesLand: 0,
		beidesLeer: 0,
		erschliessungLief: 0,
		schichten: 0,
		fertig: 0
	};
	/** Schichtstand je Baustelle beim letzten Blick — für die geleisteten Schichten. */
	const schichtstand = new Map<string, number>();
	// **Woran gestorben wird** (5.71). Ohne diese Trennung stand im Bericht eine Zahl, die
	// zwei Dinge zusammenwarf: eine Stadt, die altert, und eine, die verhungert. Bei der
	// Grundsteuer aus Punkt 96 war genau das die offene Frage.
	const todesursachen: Record<string, number> = {};
	/** Welches Haus wie oft gebrannt hat — und welches am Ende zur Ruine wurde (5.85). */
	const braendeNach: Record<string, number> = {};
	/**
	 * **Die Kassenbilanz** (Punkt 100, 5.72).
	 *
	 * Sie kommt ohne Umbau der Dienste aus: Was der Takt ohnehin zurückgibt, genügt für
	 * eine Bilanz über die ganze Welt. Alles Geld der Lebenden plus die Stadtkasse ist der
	 * Bestand; von außen kommt nur der Zuzug. Was übrig bleibt, wenn man den Zuwachs des
	 * Bestands vom Zuzug abzieht, ist **vernichtetes Geld** — und dass es das gibt, sieht
	 * man dem Code an: `renovatePublicBuilding`, `buildPublicBuilding` und `developLand`
	 * senken die Kasse, ohne dass jemand etwas bekommt.
	 *
	 * **Was sie nicht trennt, trennt seit 5.77 das Kassenbuch** (Punkt 101): Kornspeicher,
	 * Standgeld und Grundstücksverkauf fließen in dieselbe Kasse, und der Tagelohn kommt
	 * aus derselben heraus.
	 *
	 * **Die beiden decken sich nicht, und das ist kein Fehler.** Diese Bilanz misst die
	 * ganze Welt, das Buch nur die Stadtkasse: Was ein Bürger beim Renovieren oder
	 * Ausbauen ins Nichts zahlt, steht hier im vernichteten Geld und dort nirgends. Der
	 * Teil, den die Stadt selbst verbrennt, ist die Zeile „an niemanden" im Buch — und
	 * die Differenz zwischen beiden ist genau das, was Punkt 102 noch offen hat.
	 */
	const bilanz = { zuzug: 0, geschenkt: 0 };

	/**
	 * **Aus welcher Stufe die Handlungen kamen** (5.88, Punkt 111). Nicht gedeutet,
	 * sondern von der Entscheidung selbst gemeldet: `decideNpcActionWithStage` ruft
	 * dieselben fünf Funktionen wie `decideNpcAction`.
	 */
	const stufen: Record<string, number> = {};
	/**
	 * **Was der Müßiggang für Leute betrifft.** Die rohen Schalter, zu Mustern gezählt —
	 * die Aufschlüsselung, nach der Punkt 93 verlangt: `CONTENT: 30206` sagt nichts,
	 * `werkstatt ohne kann_herstellen ohne pacht: 4000` sagt alles.
	 */
	const muessiggangNach: Record<string, number> = {};
	/** Das Leben eines Einzelnen, Tick für Tick — nur, wenn ein Name genannt wurde. */
	const verfolgt: string[] = [];
	let verfolgterId: string | undefined;

	protokollieren((eintrag) => {
		stufen[`${eintrag.stage} → ${eintrag.action}`] =
			(stufen[`${eintrag.stage} → ${eintrag.action}`] ?? 0) + 1;

		if (eintrag.action === 'IDLE' && !eintrag.flags.includes('kind')) {
			const muster: string = eintrag.flags.join(' ') || '(nichts)';
			muessiggangNach[muster] = (muessiggangNach[muster] ?? 0) + 1;
		}

		if (verfolge === undefined) return;
		// **Der erste, der so heißt, und dann nur noch der.** Namen sind in dieser Welt
		// nicht eindeutig (im Messlauf standen zwei Odilias nebeneinander); wer verfolgt
		// wird, entscheidet sich beim ersten Treffer und bleibt dabei.
		if (verfolgterId === undefined && eintrag.name === verfolge) verfolgterId = eintrag.npcId;
		if (eintrag.npcId !== verfolgterId) return;
		verfolgt.push(
			`  ${eintrag.tick}: ${eintrag.action}` +
				`${eintrag.failure ? ` ✗ ${eintrag.failure}` : ''}` +
				`${eintrag.idleReason ? ` (${eintrag.idleReason})` : ''}` +
				` [${eintrag.stage}] ${eintrag.money} Münzen — ${eintrag.flags.join(' ')}`
		);
	});

	// **Das Kassenbuch fängt bei null an** (5.77). Es zählt im Speicher mit, seit der
	// Prozess läuft — und der hat vor diesem Lauf schon die Welt aufgebaut, in der die
	// Gründer ihre Grundstücke bekommen haben. Ohne das Leeren stünde deren Kaufpreis im
	// Buch, und der Bericht spräche über eine andere Zeitspanne als die gemessene.
	kassenbuchLeeren();

	// **Das Startgeld, wenn eines verlangt ist** (5.88). Es geht an die Lebenden und
	// später an jeden Ankömmling; die Bilanz bekommt es als Zufluss von außen zu sehen,
	// sonst behauptete der Bericht, in dieser Welt entstehe Geld aus dem Nichts.
	let ausgestattet = 0;
	if (startgeld !== undefined) {
		const lebende = await Character.findAll({ where: { deathTick: null } });
		for (const person of lebende) {
			const dazu: number = Math.max(0, startgeld - person.dataValues.money);
			ausgestattet += dazu;
			await person.update({ money: person.dataValues.money + dazu });
		}
	}

	// **Und der Startvorrat**, wenn einer verlangt ist. Er geht nicht in die Geldbilanz:
	// Brot ist Ware, und die zählt dieser Bericht nicht — was er zeigt, ist, ob die Stadt
	// die Zeit nutzt, die ihr der Vorrat kauft.
	let versorgt = 0;
	if (startvorrat !== undefined) {
		const lebende = await Character.findAll({ where: { deathTick: null } });
		for (const person of lebende) {
			versorgt += await brotGeben(person.dataValues.id, startvorrat);
		}
	}

	/**
	 * **Woran eine Geburt scheitert** (0.6.3, Punkt 121). Empfangen kann nur, wer
	 * verheiratet, im Alter dazu, nicht schon schwanger ist und daheim Platz hat
	 * (`conceives`). Gezählt in Frauen-Ticks je Fenster, vor dem Takt — und ohne den Würfel
	 * anzufassen, sonst wäre der Lauf nicht mehr derselbe.
	 */
	const leer = () => ({ ledig: 0, schwanger: 0, ohneDach: 0, ohnePlatz: 0, mitPlatz: 0 });
	let frauenFenster = leer();
	const frauenGesamt = leer();

	const start: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
	const begonnen: number = Date.now();
	const bestandVorher: number = (await geldmenge()) + (await stadtkasse(stadtId));

	for (let i = 0; i < ticks; i++) {
		// **Der volle Takt, nicht der halbe** (5.69). Bis hierher rief diese Schleife
		// `actForNpcs` und `admitNewcomers` und sonst nichts — kein Geborenwerden, kein
		// Sterben, keine Wahl, kein Bürgermeister, keine Grundsteuer, kein Unglück. Der
		// Bericht beschrieb damit eine Stadt, die es nirgends gibt: ohne Nachwuchs und mit
		// einer Kasse, die nur ausgab. Siehe Punkt 95.
		for (const frau of await Character.findAll({
			where: { deathTick: null, gender: 'FEMALE' }
		})) {
			const alter: number = ageInYears(frau.dataValues.birthTick, start + i);
			if (alter < FERTILE_FROM_AGE || alter > FERTILE_TO_AGE) continue;
			let lage: keyof typeof frauenFenster;
			if (frau.dataValues.spouseId === null) lage = 'ledig';
			else if (frau.dataValues.pregnantSinceTick !== null) lage = 'schwanger';
			else {
				const platz = await buildingService.freierWohnraum(frau.dataValues.HomeBuildingId);
				lage = platz === null ? 'ohneDach' : platz < 1 ? 'ohnePlatz' : 'mitPlatz';
			}
			frauenFenster[lage]++;
			frauenGesamt[lage]++;
		}

		const ledig = await ledigeErwachsene(stadtId, start + i);
		heiratsmarkt.maennerTicks += ledig.maenner;
		heiratsmarkt.frauenTicks += ledig.frauen;
		if (ledig.frauen === 0 && ledig.maenner > 0) heiratsmarkt.ohneFrauMitMann++;
		if (ledig.maenner === 0 && ledig.frauen > 0) heiratsmarkt.ohneMannMitFrau++;

		const stunde = await tickWorld(start + i, { roll: wuerfel, regionId: stadtId });

		for (const [was, wieoft] of Object.entries(stunde.npcs.byAction)) {
			handlungen[was as NpcAction] = (handlungen[was as NpcAction] ?? 0) + wieoft;
		}
		for (const [was, wieoft] of Object.entries(stunde.npcs.byFailure)) {
			fehlschlaege[was] = (fehlschlaege[was] ?? 0) + wieoft;
		}
		for (const [was, wieoft] of Object.entries(stunde.npcs.byIdleReason)) {
			muessiggang[was as IdleReason] = (muessiggang[was as IdleReason] ?? 0) + wieoft;
		}
		for (const [was, wieoft] of Object.entries(stunde.npcs.byIdleDetail)) {
			muessiggangGenau[was] = (muessiggangGenau[was] ?? 0) + wieoft;
		}
		for (const [art, posten] of Object.entries(stunde.npcs.byCredit)) {
			const summe = (kreditbedarf[art] ??= {
				faelle: 0,
				mitPfand: 0,
				luecke: 0,
				lueckeMitPfand: 0,
				koepfe: new Set()
			});
			summe.faelle += posten.faelle;
			summe.mitPfand += posten.mitPfand;
			summe.luecke += posten.luecke;
			summe.lueckeMitPfand += posten.lueckeMitPfand;
			for (const kopf of posten.koepfe) summe.koepfe.add(kopf);
		}
		for (const [was, posten] of Object.entries(stunde.npcs.byMoney)) {
			const summe = (geldJeHandlung[was] ??= { ein: 0, aus: 0 });
			summe.ein += posten.ein;
			summe.aus += posten.aus;
		}

		chronik.geburten += stunde.family.births.length;
		chronik.tode += stunde.deaths.length;
		for (const fall of stunde.deaths) {
			todesursachen[fall.cause] = (todesursachen[fall.cause] ?? 0) + 1;
		}
		if (stunde.arrival) {
			// **Gezählt werden Köpfe, nicht Wagen** (0.9.0) — und je Form, wie sie kamen.
			chronik.zuzug += stunde.arrival.members.length;
			zuzugFormen[stunde.arrival.form] = (zuzugFormen[stunde.arrival.form] ?? 0) + 1;
			for (const kopf of stunde.arrival.members) {
				const gruppe: string =
					kopf.alter < AGE_OF_MAJORITY
						? 'Kinder'
						: kopf.rolle === 'GROSSVATER' || kopf.rolle === 'GROSSMUTTER'
							? 'Großeltern'
							: 'Erwachsene';
				zuzugKoepfe[gruppe] = (zuzugKoepfe[gruppe] ?? 0) + 1;
			}
			bilanz.zuzug += stunde.arrival.money;
			for (const kopf of stunde.arrival.members) {
				if (startgeld !== undefined) {
					// Derselbe Betrag für den Zugezogenen — sonst wäre die Frage nach zwanzig
					// Ticks wieder die alte, nur mit einer reicheren Gründergeneration.
					const angekommen = await Character.findByPk(kopf.characterId);
					if (angekommen) {
						const dazu: number = Math.max(0, startgeld - angekommen.dataValues.money);
						bilanz.geschenkt += dazu;
						await angekommen.update({ money: angekommen.dataValues.money + dazu });
					}
				}
				// Derselbe Vorrat für den Zugezogenen, aus demselben Grund.
				if (startvorrat !== undefined) {
					versorgt += await brotGeben(kopf.characterId, startvorrat);
				}
			}
		}
		// **Sold, Steuer und Amtsausgaben zählt seit 5.77 das Kassenbuch** — und zwar
		// vollständig: Was hier stand, war beim Bauen und Erschließen ausdrücklich nur eine
		// Untergrenze, weil diese beiden ihren Betrag nicht melden. Zwei Zählungen
		// derselben Sache laufen früher oder später auseinander, und dann glaubt man der
		// falschen.
		if (stunde.hazard) {
			chronik.braende++;
			// **Was brennt, nicht nur wie oft** (5.85, Punkte 98 und 103). Zwei Läufe zeigten
			// eine Schmiede bei Tick 1750 und keine bei Tick 2000; ob sie abbrannte oder nie
			// gebaut wurde, war aus dem Bericht nicht zu sagen.
			braendeNach[stunde.hazard.what] = (braendeNach[stunde.hazard.what] ?? 0) + 1;
		}
		chronik.steuer += stunde.tax?.collected ?? 0;
		chronik.ausgefallen += stunde.tax?.shortfall ?? 0;
		armenspeisung.mahlzeiten += stunde.alms.meals;
		armenspeisung.leer += stunde.alms.unfed;
		armenspeisung.ausgegeben += stunde.alms.spent;
		armenspeisung.armengeld += stunde.alms.paid;
		armenspeisung.bedacht += stunde.alms.relieved;

		const inhaber = await electionService.getHolder(stadtId);
		if (!inhaber) amt.ohneInhaber++;
		else {
			const person = await Character.findByPk(inhaber.characterId, { attributes: ['role'] });
			if (person?.dataValues.role === 'NPC') amt.npc++;
			else amt.spieler++;
		}
		if (stunde.election.opened) amt.wahlenEroeffnet++;
		if (stunde.election.closed) {
			if (stunde.election.closed.winner) amt.wahlenMitSieger++;
			else amt.wahlenOhneSieger++;
		}
		if (stunde.governed) {
			const was: string =
				stunde.governed.action + (stunde.governed.detail ? ` (${stunde.governed.detail})` : '');
			amtshandlungen[was] = (amtshandlungen[was] ?? 0) + 1;
		}
		// **Wie schnell erschlossen wird** (0.8.4): Schichten aus dem Zuwachs je Baustelle,
		// eine verschwundene Baustelle ist fertig geworden.
		const baustellen = await auctionService.getDevelopments(stadtId);
		if (baustellen.length > 0) land.erschliessungLief++;
		const jetzt = new Map(baustellen.map((b) => [b.id, b.shifts]));
		for (const [id, vorher] of schichtstand) {
			if (!jetzt.has(id)) {
				land.schichten += DEVELOPMENT_SHIFTS_PER_PLOT - vorher;
				land.fertig++;
			}
		}
		for (const [id, nun] of jetzt) land.schichten += nun - (schichtstand.get(id) ?? 0);
		schichtstand.clear();
		for (const [id, nun] of jetzt) schichtstand.set(id, nun);
		if (!(await plotService.hasFreeBuildingLand(stadtId))) {
			land.buergerOhneBauland++;
			if ((await buildingService.getFreeCityPlots(stadtId)).length > 0) land.amtSiehtFreiesLand++;
			else land.beidesLeer++;
		}

		await World.update({ currentTick: start + i + 1 }, { where: { id: WORLD_ID } });

		if ((i + 1) % every === 0) {
			const haeuser = await Building.findAll();
			const kasse: number = (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
			zeilen.push(
				`--- Tick ${i + 1}: ${haeuser.length} Häuser, ${await ShopOffer.count()} Angebote, ` +
					`Geld bei Leuten ${await geldmenge()}, Stadtkasse ${kasse}, ` +
					`${await Character.count({ where: { deathTick: null } })} Lebende ` +
					`(${chronik.geburten} geboren, ${chronik.tode} gestorben, ${chronik.zuzug} zugezogen)`
			);
			zeilen.push(`    Frauen-Ticks im Alter: ${frauenZeile(frauenFenster)}`);
			frauenFenster = leer();
			// **Was das Amt an den Steuern tut** (0.10.0, Punkt 122). Ohne diese Zeile ließ
			// sich nicht sagen, ob die neue Regel überhaupt senkt — nur, dass weiter gehungert
			// wurde.
			const stadt = (await Region.findByPk(stadtId))!.dataValues;
			const ausfallAnteil: string =
				stadt.lastTaxDue && stadt.lastTaxDue > 0
					? `${Math.round((100 * (stadt.lastTaxShortfall ?? 0)) / stadt.lastTaxDue)} %`
					: '–';
			zeilen.push(
				`    Grundsteuer ${await lawService.rate(stadtId, 'PROPERTY_TAX')}, ` +
					`Zehnt ${await lawService.rate(stadtId, 'TITHE')} %, ` +
					`Ausfall beim letzten Termin ${ausfallAnteil}`
			);
			zeilen.push(
				`    ${haeuser
					.map(
						(haus) =>
							// **Was noch keines ist, steht auch nicht da** (5.93): Ein Rohbau in dieser
							// Liste sah aus wie ein fertiges Haus — seit auch die Stadt so baut, ist der
							// Unterschied die halbe Auskunft.
							`${haus.dataValues.name}(${haus.dataValues.optionId}) Stufe ${haus.dataValues.level}` +
							(haus.dataValues.underConstruction ? ' [im Bau]' : '')
					)
					.sort()
					.join(', ')}`
			);
		}
	}

	// **Zusehen beenden.** Der Haken ist ein Modulzustand; bliebe er stehen, schriebe der
	// nächste Lauf in dieselben Behälter — und im Test wäre er ein Leck.
	protokollieren();

	zeilen.push(
		'',
		`=== DIE STADT (${ticks} Ticks, ${Date.now() - begonnen} ms, ` +
			`Saat ${saat === undefined ? 'frei gewürfelt' : saat}) ===`,
		`  Geburten ${chronik.geburten}, Tode ${chronik.tode}` +
			`${todeNach(todesursachen)}, Zuzug ${chronik.zuzug}, Brände ${chronik.braende}`,
		`  Frauen-Ticks im Alter: ${frauenZeile(frauenGesamt)}`,
		`  Grundsteuer eingenommen ${chronik.steuer}, nicht eintreibbar ${chronik.ausgefallen}`,
		`  Armenspeisung: ${armenspeisung.mahlzeiten} Mahlzeiten für ${armenspeisung.ausgegeben} Münzen, ` +
			`Armengeld ${armenspeisung.bedacht}× für ${armenspeisung.armengeld} Münzen, ` +
			`${armenspeisung.leer}× leer ausgegangen`,
		// **Was die Erschließung wirklich tut** (5.92, Punkt 102). Seit sie Arbeit ist statt
		// eines Preises, sagt das Kassenbuch nichts mehr über sie: Ihr Lohn steht unter
		// `WAGE`, zusammen mit jedem anderen Handschlag. Ohne diese Zeile wäre aus dem
		// Bericht nicht zu sehen, ob die Stadt beschlossen und nichts zustande gebracht hat
		// — genau der Unterschied, um den es hier geht.
		`  Bauland ausgewiesen ${await ereignissumme('LAND_DEVELOPED')} Parzellen, ` +
			`davon fertig erschlossen ${await ereignisse('LAND_SURVEYED')}, ` +
			`versteigert ${await ereignisse('AUCTION_WON')}`,
		'',
		...(startgeld === undefined
			? []
			: [
					`  Startgeld ${startgeld} je Kopf — ${ausgestattet} an die Anwesenden, ` +
						`${bilanz.geschenkt} an Zugezogene (ein Werkzeug, kein Weltinhalt)`
				]),
		...(startvorrat === undefined
			? []
			: [`  Startvorrat ${startvorrat} Laibe je Kopf — ${versorgt} verteilt (ein Werkzeug)`]),
		'',
		'=== ZUZUG UND HEIRATSMARKT ===',
		`  Ankünfte je Form: ${
			Object.entries(zuzugFormen)
				.map(([f, n]) => `${f} ${n}`)
				.join(', ') || 'keine'
		}`,
		`  Köpfe: ${
			Object.entries(zuzugKoepfe)
				.map(([g, n]) => `${g} ${n}`)
				.join(', ') || 'keine'
		}`,
		`  Ledige Erwachsene im Mittel: Männer ${(heiratsmarkt.maennerTicks / Math.max(1, ticks)).toFixed(1)}, ` +
			`Frauen ${(heiratsmarkt.frauenTicks / Math.max(1, ticks)).toFixed(1)}`,
		`  Ticks ohne ledige Frau, während ein lediger Mann wartete: ${heiratsmarkt.ohneFrauMitMann}; ` +
			`umgekehrt: ${heiratsmarkt.ohneMannMitFrau}`,
		'',
		'=== KREDITBEDARF ===',
		`  Wer aufs Geld wartete (Einwohner × Tick), davon mit Pfand ≥ ${PFAND_DECKUNG * 100} % der Lücke:`,
		...Object.entries(kreditbedarf)
			.sort(([, a], [, b]) => b.faelle - a.faelle)
			.map(
				([art, k]) =>
					`  ${art}: ${k.faelle} Fälle, ${k.koepfe.size} Köpfe, Lücke Ø ${Math.round(k.luecke / k.faelle)}` +
					` — mit Pfand ${k.mitPfand}` +
					(k.mitPfand > 0 ? ` (Lücke Ø ${Math.round(k.lueckeMitPfand / k.mitPfand)})` : '')
			),
		'',
		'=== DAS AMT ===',
		`  Ticks mit NPC im Amt ${amt.npc}, mit Spieler ${amt.spieler}, ohne Inhaber ${amt.ohneInhaber}`,
		`  Wahlen eröffnet ${amt.wahlenEroeffnet}, mit Sieger ${amt.wahlenMitSieger}, ohne ${amt.wahlenOhneSieger}`,
		`  Ticks ohne kaufbares Bauland ${land.buergerOhneBauland}: davon sah das Amt noch freies ` +
			`Land ${land.amtSiehtFreiesLand}, beides leer ${land.beidesLeer}`,
		`  Erschließung lief in ${land.erschliessungLief} Ticks, ${land.schichten} Schichten geleistet, ` +
			`${land.fertig} Parzellen fertig (je ${DEVELOPMENT_SHIFTS_PER_PLOT} Schichten)`,
		'  Amtshandlungen:',
		...Object.entries(amtshandlungen)
			.sort(([, a], [, b]) => b - a)
			.map(([was, wieoft]) => `    ${was}: ${wieoft}`),
		'',
		'=== DIE KASSE ===',
		...(await bilanzzeilen(stadtId, bestandVorher, bilanz)),
		'',
		'=== DAS KASSENBUCH ===',
		...kassenbuchzeilen(kassenbuch()),
		'',
		'=== HANDLUNGEN ==='
	);
	zeilen.push(...verteilung(handlungen as Record<string, number>));

	// **Das Herzstück.** `IDLE` ist die häufigste Handlung der Welt; ohne diese Aufschlüsselung
	// steht dort eine große Zahl, die nichts sagt.
	// **Was die Stadt an Bauten verloren hat** (5.85, Punkt 98). Ein Wohnhaus weniger ist
	// ein Schicksal; die einzige Werkstatt weniger ist eine Wirtschaft, die stehenbleibt —
	// und ohne diese beiden Zeilen war der Unterschied im Bericht nicht zu sehen.
	zeilen.push('', '=== WAS BRANNTE UND WAS VERFIEL ===');
	zeilen.push(`  Brände ${chronik.braende}, davon:`);
	zeilen.push(...verteilung(braendeNach).map((zeile) => `  ${zeile}`));
	const ruinen: Record<string, number> = {};
	for (const zeile of await Event.findAll({
		where: { kind: 'BUILDING_RUINED', tick: { [Op.gte]: messbeginn } }
	})) {
		const was: string = zeile.dataValues.detail ?? 'unbekannt';
		ruinen[was] = (ruinen[was] ?? 0) + 1;
	}
	zeilen.push(`  Zur Ruine verfallen ${Object.values(ruinen).reduce((a, b) => a + b, 0)}, davon:`);
	zeilen.push(...verteilung(ruinen).map((zeile) => `  ${zeile}`));

	zeilen.push('', '=== AUS WELCHER STUFE ===');
	// **Die Bedürfnishierarchie in Zahlen** (5.88): Wo eine Handlung herkam, sagt mehr
	// über die Lage der Stadt als die Handlung selbst. `ueberleben → WORK` ist eine Stadt,
	// die um ihr Brot arbeitet; `entfaltung → WORK` eine, die spart.
	zeilen.push(...verteilung(stufen));

	zeilen.push('', '=== WARUM MÜSSIGGANG ===');
	zeilen.push(...verteilung(muessiggang as Record<string, number>));

	zeilen.push('', '=== WORAN GENAU ===');
	zeilen.push(...verteilung(muessiggangGenau));

	zeilen.push('', '=== GELD JE HANDLUNG ===');
	// **Die Bürgerseite des Kassenbuchs** (0.8.3, Punkt 101): was jede Handlungsart den
	// Handelnden eingebracht und gekostet hat, sortiert nach dem, was sie bewegt.
	zeilen.push(
		...Object.entries(geldJeHandlung)
			.sort((a, b) => b[1].ein + b[1].aus - (a[1].ein + a[1].aus))
			.map(([was, posten]) => `  ${was}: +${posten.ein} / −${posten.aus}`)
	);

	zeilen.push('', '=== UND WEN ES BETRIFFT ===');
	// **Die Aufschlüsselung, nicht die Diagnose** (Punkt 93). Rohe Schalter, gezählt: Wer
	// hier `werkstatt` ohne `kann_herstellen` und ohne `pacht` liest, weiß, dass Betriebe
	// ohne Rohstoff dastehen — und braucht dafür niemandes Deutung. Die zwölf häufigsten
	// Muster; der Schwanz ist lang und sagt wenig.
	zeilen.push(...verteilung(muessiggangNach).slice(0, 12));

	// Gewählt heißt nicht gelungen: Hier steht, was in Wahrheit scheiterte.
	zeilen.push('', '=== WORAN ES SCHEITERTE ===');
	zeilen.push(...verteilung(fehlschlaege));

	zeilen.push('', '=== ANGEBOTE ===');
	for (const angebot of await ShopOffer.findAll()) {
		const haus = await Building.findByPk(angebot.dataValues.BuildingId);
		const wer = await Character.findByPk(angebot.dataValues.SellerCharacterId);
		zeilen.push(
			`  ${angebot.dataValues.itemId} x${angebot.dataValues.quantity} zu ` +
				`${angebot.dataValues.pricePerUnit} bei ${haus?.dataValues.name} ` +
				`(${wer?.dataValues.firstName})`
		);
	}

	zeilen.push('', '=== BETRIEBSLAGER ===');
	for (const zeile of await BuildingStock.findAll()) {
		const haus = await Building.findByPk(zeile.dataValues.BuildingId);
		zeilen.push(
			`  ${haus?.dataValues.name}: ${zeile.dataValues.itemId} x${zeile.dataValues.quantity}`
		);
	}

	if (verfolgt.length > 0) {
		zeilen.push('', `=== ${verfolge?.toUpperCase()}, TICK FÜR TICK ===`);
		zeilen.push(...verfolgt);
	} else if (verfolge !== undefined) {
		zeilen.push('', `=== ${verfolge.toUpperCase()} ===`, '  Niemand dieses Namens hat gelebt.');
	}

	zeilen.push('', '=== LEUTE ===');
	for (const person of await Character.findAll({ where: { deathTick: null } })) {
		const werte = person.dataValues;
		const kammer = await needService.getStock(werte.id);
		const eigene = await buildingService.getBuildingsOfCharacter(werte.id);
		const koennen = await Skill.findAll({ where: { CharacterId: werte.id } });
		zeilen.push(
			`  ${werte.firstName}  geld=${werte.money}  ` +
				`bauten=[${eigene.map((haus) => `${haus.optionId}@${haus.level}`).join('/') || '-'}]  ` +
				`kammer=[${kammer.map((posten) => `${posten.itemId}:${posten.quantity}`).join(' ')}]  ` +
				`kann=[${koennen
					.map((fertigkeit) => `${fertigkeit.dataValues.type}:${fertigkeit.dataValues.level}`)
					.join(' ')}]`
		);
	}

	zeilen.push(
		'',
		`Geld bei Leuten: ${await geldmenge()}`,
		`Stadtkasse: ${(await Region.findByPk(stadtId))!.dataValues.treasury}`,
		`Lebende: ${await Character.count({ where: { deathTick: null } })}`,
		`Je geboren: ${await Character.count()}`
	);

	return { lines: zeilen };
}

/**
 * Wie oft ein Ereignis in diesem Lauf vorkam.
 *
 * Gezählt wird die Chronik und nicht ein eigener Zähler: Sie ist ohnehin da, und zwei
 * Zählungen derselben Sache laufen früher oder später auseinander — dieselbe Überlegung,
 * aus der Sold und Steuer seit 5.77 nur noch im Kassenbuch stehen.
 */
async function ereignisse(kind: EventKind): Promise<number> {
	return Event.count({ where: { kind, tick: { [Op.gte]: messbeginn } } });
}

/**
 * Was dabei zusammenkam — die Summe der Beträge statt der Zahl der Ereignisse.
 *
 * Eine Erschließung weist zwei Parzellen auf einmal aus; „4 ausgewiesen, davon 6 fertig"
 * wäre keine Auskunft, sondern ein Rätsel.
 */
async function ereignissumme(kind: EventKind): Promise<number> {
	const zeilen = await Event.findAll({
		where: { kind, tick: { [Op.gte]: messbeginn } },
		attributes: ['value']
	});
	return zeilen.reduce((summe, zeile) => summe + (zeile.dataValues.value ?? 0), 0);
}

/**
 * Brot in die Kammer legen — so viel, wie hineinpasst.
 *
 * Über `needService.changeStock`, damit die Inventargrenze aus 5.33 gilt: Wer in der
 * Unterkunft wohnt, kann keine dreißig Laibe horten, und der Messlauf soll keine Welt
 * bauen, die es so nicht geben kann.
 */
async function brotGeben(characterId: string, laibe: number): Promise<number> {
	let gegeben = 0;
	await sequelize.transaction(async (t) => {
		for (let i = 0; i < laibe; i++) {
			if (!(await needService.changeStock(characterId, 'BREAD', 1, t))) break;
			gegeben++;
		}
	});
	return gegeben;
}

function frauenZeile(z: Record<string, number>): string {
	return (
		`ledig ${z.ledig}, schwanger ${z.schwanger}, ohne Dach ${z.ohneDach}, ` +
		`ohne Platz ${z.ohnePlatz}, mit Platz ${z.mitPlatz}`
	);
}
