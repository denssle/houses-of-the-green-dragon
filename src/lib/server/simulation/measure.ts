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
import { protokollieren } from '$lib/server/service/npcService';

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
}

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
	const { ticks, every = 250, seed = true, saat, verfolge, startgeld } = options;
	const zeilen: string[] = [];

	const wuerfel: () => number = saat === undefined ? Math.random : seededRoll(saat);

	await sequelize.sync();
	if (seed) await seedWorld(wuerfel);
	const stadtId: string = await findStartRegionId();

	const handlungen: Partial<Record<NpcAction, number>> = {};
	const fehlschlaege: Record<string, number> = {};
	const muessiggang: Partial<Record<IdleReason, number>> = {};
	const chronik = { geburten: 0, tode: 0, zuzug: 0, braende: 0, steuer: 0, ausgefallen: 0 };
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

	const start: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
	const begonnen: number = Date.now();
	const bestandVorher: number = (await geldmenge()) + (await stadtkasse(stadtId));

	for (let i = 0; i < ticks; i++) {
		// **Der volle Takt, nicht der halbe** (5.69). Bis hierher rief diese Schleife
		// `actForNpcs` und `admitNewcomers` und sonst nichts — kein Geborenwerden, kein
		// Sterben, keine Wahl, kein Bürgermeister, keine Grundsteuer, kein Unglück. Der
		// Bericht beschrieb damit eine Stadt, die es nirgends gibt: ohne Nachwuchs und mit
		// einer Kasse, die nur ausgab. Siehe Punkt 95.
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

		chronik.geburten += stunde.family.births.length;
		chronik.tode += stunde.deaths.length;
		for (const fall of stunde.deaths) {
			todesursachen[fall.cause] = (todesursachen[fall.cause] ?? 0) + 1;
		}
		if (stunde.arrival) {
			chronik.zuzug++;
			bilanz.zuzug += stunde.arrival.money;
			if (startgeld !== undefined) {
				// Derselbe Betrag für den Zugezogenen — sonst wäre die Frage nach zwanzig
				// Ticks wieder die alte, nur mit einer reicheren Gründergeneration.
				const angekommen = await Character.findByPk(stunde.arrival.characterId);
				if (angekommen) {
					const dazu: number = Math.max(0, startgeld - angekommen.dataValues.money);
					bilanz.geschenkt += dazu;
					await angekommen.update({ money: angekommen.dataValues.money + dazu });
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
		`  Grundsteuer eingenommen ${chronik.steuer}, nicht eintreibbar ${chronik.ausgefallen}`,
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
	for (const zeile of await Event.findAll({ where: { kind: 'BUILDING_RUINED' } })) {
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
	return Event.count({ where: { kind } });
}

/**
 * Was dabei zusammenkam — die Summe der Beträge statt der Zahl der Ereignisse.
 *
 * Eine Erschließung weist zwei Parzellen auf einmal aus; „4 ausgewiesen, davon 6 fertig"
 * wäre keine Auskunft, sondern ein Rätsel.
 */
async function ereignissumme(kind: EventKind): Promise<number> {
	const zeilen = await Event.findAll({ where: { kind }, attributes: ['value'] });
	return zeilen.reduce((summe, zeile) => summe + (zeile.dataValues.value ?? 0), 0);
}
