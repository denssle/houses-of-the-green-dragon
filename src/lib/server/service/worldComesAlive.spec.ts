import { beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import { tickWorld } from '$lib/server/worldTick';
import { satietyOf } from '$lib/server/service/needService';
import type { NpcAction } from '$lib/game/npc.logic';

/**
 * Kommt die Welt aus eigener Kraft in Gang?
 *
 * **Der Unterschied zu `selfSustainingEconomy.spec.ts` ist, was hier _nicht_ steht.** Der
 * andere Test setzt vor dem Lauf `money: 400, ambition: 60, diligence: 60` für alle und
 * fragt dann, ob ein Unternehmungslustiger unternimmt. Diese Frage ist berechtigt — nur
 * beantwortet sie nicht, ob die Stadt lebt, die der Weltaufbau wirklich erzeugt.
 *
 * Hier wird **nichts nachgesetzt**: die Bevölkerung, wie `seedWorld()` sie anlegt, und
 * dann Zeit. Genau das lief auf dem Server 96 Jahre lang und brachte kein einziges
 * privates Gebäude hervor (Punkt 55).
 */

/**
 * Vier Spieljahre. Lang genug, dass aus Arbeit Besitz werden kann — die Tagelöhnerei
 * bringt drei Münzen je Aktionspunkt, ein Grundstück kostet vierzig.
 *
 * **Der Satz „in einer halben Minute durch" stimmte einmal** und stammt aus 5.11. Ein
 * Block von vierzig Ticks braucht heute rund fünfundzwanzig Sekunden, vierhundert also
 * gut vier Minuten — gemessen mit und ohne die Änderungen aus 5.18, mit demselben
 * Ergebnis. Die Last ist über viele Schritte gewachsen: `lageAufnehmen` nimmt für jede
 * einzelne Entscheidung die halbe Welt auf. Das gehört angegangen (Punkt 67), aber nicht
 * dadurch, dass ein Zeitlimit den Befund verdeckt.
 */
const TICKS = 400;

describe('Die Welt aus eigener Kraft', () => {
	const handlungen: Partial<Record<NpcAction, number>> = {};
	let geldNachher: number[] = [];

	beforeAll(async () => {
		await sequelize.sync();
		// **Fest gewürfelt** (Punkt 54), und das verdient eine Erklärung: Dieser Test prüft
		// ausdrücklich die Welt, „wie `seedWorld` sie anlegt" — mit `Math.random` prüfte er
		// jedes Mal eine andere und konnte deshalb gelegentlich rot sein, ohne dass sich
		// etwas geändert hätte. Er prüft jetzt **eine bestimmte** Stadt, dafür verlässlich.
		// Ob die Welt auch bei anderen Ausgangslagen lebt, beantwortet kein Test, sondern
		// ein Messlauf (`measure`), der weiter frei würfelt.
		await seedWorld(seededRoll(96));

		// **Der volle Takt** (5.69): derselbe Würfel wie oben, damit der Lauf wiederholbar
		// bleibt. Vorher lief hier `actForNpcs` allein — eine Stadt ohne Geburt, ohne Tod
		// und ohne Stadtkasse, und damit nicht die, die „auf dem Server 96 Jahre lang lief".
		const wuerfel: () => number = seededRoll(96);
		const stadtId: string = await findStartRegionId();
		const start: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
		for (let i = 0; i < TICKS; i++) {
			const stunde = await tickWorld(start + i, { roll: wuerfel, regionId: stadtId });
			for (const [handlung, anzahl] of Object.entries(stunde.npcs.byAction)) {
				handlungen[handlung as NpcAction] = (handlungen[handlung as NpcAction] ?? 0) + anzahl;
			}
			await World.update({ currentTick: start + i + 1 }, { where: { id: WORLD_ID } });
		}

		const leute = await Character.findAll({ where: { role: 'NPC' } });
		geldNachher = leute.map((person) => person.dataValues.money);
		console.info(
			'Wesen und Stand:',
			leute.map((p) => ({
				name: p.dataValues.firstName,
				geld: p.dataValues.money,
				ap: p.dataValues.actionPoints,
				ehrgeiz: p.dataValues.ambition,
				fleiss: p.dataValues.diligence,
				gier: p.dataValues.greed,
				unternehmend: (p.dataValues.ambition + p.dataValues.diligence) / 2 >= 20
			}))
		);
	}, 600_000);

	// Die Grundlage: Wer nicht arbeitet, kann nichts weiter tun. Schlägt dieser Test fehl,
	// sind alle folgenden Aussagen wertlos.
	it('lässt die Einwohner überhaupt arbeiten', () => {
		console.info('Handlungen über %d Ticks:', TICKS, handlungen);
		console.info(
			'Geld danach:',
			geldNachher.sort((a, b) => b - a)
		);
		expect(handlungen.WORK ?? 0).toBeGreaterThan(0);
	});

	/**
	 * **Nicht mehr „genau acht"** (5.69). Solange hier `actForNpcs` allein lief, war die
	 * Bevölkerung geschlossen, und die Zahl der Gründer war die Probe. Mit dem vollen Takt
	 * kommen Kinder zur Welt, ziehen Leute zu und sterben Alte — eine feste Zahl prüfte
	 * dann nicht mehr den Hunger, sondern den Würfel.
	 *
	 * Geprüft wird deshalb, was gemeint war: **niemand geht mit leerem Magen ins Bett.**
	 */
	it('bringt niemanden um vor Hunger', async () => {
		const jetzt: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
		const lebende = await Character.findAll({ where: { role: 'NPC', deathTick: null } });

		expect(lebende.length).toBeGreaterThan(0);
		for (const person of lebende) {
			expect(satietyOf(person.dataValues, jetzt)).toBeGreaterThan(0);
		}
	});

	/**
	 * **Der Kern der Sache.**
	 *
	 * Gemessen wird am **Ergebnis**, nicht an der Betriebsamkeit: Ein Einwohner, der satt
	 * ist, ein Dach hat und nichts vorhat, soll ruhig herumstehen — Müßiggang ist hier
	 * kein Fehler, sondern eine Aussage über einen Menschen, den nichts treibt. Ein
	 * Kassenbestand taugt aus demselben Grund nicht: Wer sein Ziel erreicht, gibt das Geld
	 * noch im selben Zug aus.
	 *
	 * Was zählt, ist, ob aus Arbeit Eigentum wird.
	 */
	it('lässt jemanden etwas unternehmen', () => {
		const unternommen: number =
			(handlungen.BUY_PLOT ?? 0) +
			(handlungen.BUILD ?? 0) +
			(handlungen.BUILD_HOME ?? 0) +
			(handlungen.LEASE ?? 0);

		expect(unternommen).toBeGreaterThan(0);
	});

	it('bringt aus eigener Kraft Eigentum hervor', async () => {
		const grundstuecke: number = await Plot.count({ where: { ownerType: 'CHARACTER' } });
		const gebaeude: number = await Building.count({ where: { ownerType: 'CHARACTER' } });

		expect(grundstuecke + gebaeude).toBeGreaterThan(0);
	});
});
