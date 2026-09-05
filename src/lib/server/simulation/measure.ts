import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Region } from '$lib/db/model/region';
import { Skill } from '$lib/db/model/skill';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
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
	bilanz: { zuzug: number }
): Promise<string[]> {
	const buerger: number = await geldmenge();
	const kasse: number = await stadtkasse(stadtId);
	const nachher: number = buerger + kasse;
	const vernichtet: number = bilanz.zuzug - (nachher - vorher);

	return [
		`  Bestand am Anfang ${vorher}, am Ende ${nachher} (Bürger ${buerger}, Kasse ${kasse})`,
		`  Von außen zugeflossen (Zuzug) ${bilanz.zuzug}`,
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
 * **Bei jeder Ausgabe steht, ob jemand das Geld bekommt.** Das ist keine Verzierung: Zwei
 * der vier Ausgabearten haben keinen Empfänger, und ihre Summe ist der Teil des
 * vernichteten Geldes, den die Stadt selbst verbrennt — die Zahl, um die es in Punkt 102
 * und 100 geht.
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
	const { ticks, every = 250, seed = true, saat } = options;
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
	const bilanz = { zuzug: 0 };

	// **Das Kassenbuch fängt bei null an** (5.77). Es zählt im Speicher mit, seit der
	// Prozess läuft — und der hat vor diesem Lauf schon die Welt aufgebaut, in der die
	// Gründer ihre Grundstücke bekommen haben. Ohne das Leeren stünde deren Kaufpreis im
	// Buch, und der Bericht spräche über eine andere Zeitspanne als die gemessene.
	kassenbuchLeeren();

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
		}
		// **Sold, Steuer und Amtsausgaben zählt seit 5.77 das Kassenbuch** — und zwar
		// vollständig: Was hier stand, war beim Bauen und Erschließen ausdrücklich nur eine
		// Untergrenze, weil diese beiden ihren Betrag nicht melden. Zwei Zählungen
		// derselben Sache laufen früher oder später auseinander, und dann glaubt man der
		// falschen.
		if (stunde.hazard) chronik.braende++;
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
							`${haus.dataValues.name}(${haus.dataValues.optionId}) Stufe ${haus.dataValues.level}`
					)
					.sort()
					.join(', ')}`
			);
		}
	}

	zeilen.push(
		'',
		`=== DIE STADT (${ticks} Ticks, ${Date.now() - begonnen} ms, ` +
			`Saat ${saat === undefined ? 'frei gewürfelt' : saat}) ===`,
		`  Geburten ${chronik.geburten}, Tode ${chronik.tode}` +
			`${todeNach(todesursachen)}, Zuzug ${chronik.zuzug}, Brände ${chronik.braende}`,
		`  Grundsteuer eingenommen ${chronik.steuer}, nicht eintreibbar ${chronik.ausgefallen}`,
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
	zeilen.push('', '=== WARUM MÜSSIGGANG ===');
	zeilen.push(...verteilung(muessiggang as Record<string, number>));

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
