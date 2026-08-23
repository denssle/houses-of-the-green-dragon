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
import * as npcService from '$lib/server/service/npcService';
import * as needService from '$lib/server/service/needService';
import * as migrationService from '$lib/server/service/migrationService';
import * as buildingService from '$lib/server/service/buildingService';

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
	 * Gewürfelt wird an zwei Stellen — beim Weltaufbau und beim Zuzug. Beide bekommen
	 * **denselben** Würfel, damit ein Lauf als Ganzes wiederholbar ist.
	 *
	 * Der freie Wurf bleibt der Standard: Ob die Welt auch bei anderen Ausgangslagen lebt,
	 * beantwortet kein fester Startwert. Wer vergleichen will, setzt einen.
	 */
	saat?: number;
}

export interface Measurement {
	lines: string[];
}

/** Alles Geld in Bürgerhand — zeigt, ob die Wirtschaft wächst oder ausblutet. */
async function geldmenge(): Promise<number> {
	const leute = await Character.findAll({ where: { deathTick: null } });
	return leute.reduce((summe, person) => summe + person.dataValues.money, 0);
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

	const start: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
	const begonnen: number = Date.now();

	for (let i = 0; i < ticks; i++) {
		const lauf = await npcService.actForNpcs(start + i);
		await migrationService.admitNewcomers(stadtId, start + i, wuerfel);
		for (const [was, wieoft] of Object.entries(lauf.byAction)) {
			handlungen[was as NpcAction] = (handlungen[was as NpcAction] ?? 0) + wieoft;
		}
		for (const [was, wieoft] of Object.entries(lauf.byFailure)) {
			fehlschlaege[was] = (fehlschlaege[was] ?? 0) + wieoft;
		}
		for (const [was, wieoft] of Object.entries(lauf.byIdleReason)) {
			muessiggang[was as IdleReason] = (muessiggang[was as IdleReason] ?? 0) + wieoft;
		}
		await World.update({ currentTick: start + i + 1 }, { where: { id: WORLD_ID } });

		if ((i + 1) % every === 0) {
			const haeuser = await Building.findAll();
			const kasse: number = (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
			zeilen.push(
				`--- Tick ${i + 1}: ${haeuser.length} Häuser, ${await ShopOffer.count()} Angebote, ` +
					`Geld bei Leuten ${await geldmenge()}, Stadtkasse ${kasse}, ` +
					`${await Character.count({ where: { deathTick: null } })} Lebende`
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
		`=== HANDLUNGEN (${ticks} Ticks, ${Date.now() - begonnen} ms, ` +
			`Saat ${saat === undefined ? 'frei gewürfelt' : saat}) ===`
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
