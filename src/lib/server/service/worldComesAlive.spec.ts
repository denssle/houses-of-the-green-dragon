import { beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { seedWorld } from '$lib/db/seed';
import * as npcService from '$lib/server/service/npcService';
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
		await seedWorld();

		const start: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
		for (let i = 0; i < TICKS; i++) {
			const lauf = await npcService.actForNpcs(start + i);
			for (const [handlung, anzahl] of Object.entries(lauf.byAction)) {
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

	it('bringt niemanden um vor Hunger', async () => {
		const lebende: number = await Character.count({ where: { role: 'NPC', deathTick: null } });
		expect(lebende).toBe(8);
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
