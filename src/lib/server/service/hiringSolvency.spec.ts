import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { Skill } from '$lib/db/model/skill';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import * as npcService from '$lib/server/service/npcService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Der Bauauftrag, den niemand bezahlen kann (5.81, Punkt 106).
 *
 * **Der teuerste Fehlschlag der Welt.** `WORK/EMPLOYER_BROKE` wuchs über drei Schritte von
 * 781 auf 5602 und war zuletzt mit Abstand die häufigste vergebliche Handlung: Die
 * Arbeitsplatzsuche fragte nach dem **Aushang**, nie nach dem Beutel dahinter. Seit jeder
 * Rohbau beim Anlegen einen Bauauftrag aushängt (5.76) — auch der eines mittellosen
 * Bauherrn — lief ein Tagelöhner Tick für Tick zu derselben Baustelle, ließ eine
 * Transaktion scheitern und stand am nächsten Tag wieder davor.
 *
 * **Geprüft wird deshalb am Takt und nicht an der Suchfunktion.** Die Zusicherung, um die
 * es geht, ist eine über den Verlauf: Wer arbeiten geht, soll dabei etwas verdienen — und
 * wo nichts zu verdienen ist, soll er es gar nicht erst versuchen. Genau das steht in der
 * Fehlschlagzählung des Ticks, und genau die hat den Befund geliefert.
 */

const JETZT = 20_000;
let stadtId: string;

async function person(name: string, geld: number): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 48,
		money: geld,
		RegionId: stadtId
	});
	return id;
}

/** Eine Baustelle mit ausgehängtem Lohn — so, wie `build()` sie seit 5.76 anlegt. */
async function baustelle(besitzerId: string, lohn: number): Promise<string> {
	const plotId = randomUUID();
	await Plot.create({
		id: plotId,
		address: `Baugasse ${plotId.slice(0, 4)}`,
		type: 'BUILDING_LAND',
		RegionId: stadtId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	const id = randomUUID();
	await Building.create({
		id,
		name: 'Rohbau',
		optionId: 1,
		condition: 0,
		underConstruction: true,
		repairWage: lohn,
		lastConditionTick: JETZT,
		PlotId: plotId,
		ownerType: 'CHARACTER',
		OwnerCharacterId: besitzerId
	});
	return id;
}

describe('Wer Lohn bietet, muss ihn haben', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld(seededRoll(106));
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		// Allein in der Stadt: Die Gründer würfen sonst mit — sie nähmen dieselbe Arbeit
		// und verschöben die Entscheidung, um die es hier geht.
		await Character.destroy({ where: { role: 'NPC' } });
		await Skill.destroy({ where: {} });
		await Building.destroy({ where: { ownerType: 'CHARACTER' } });
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });
		// Eine leere Stadtkasse, damit auch die öffentlichen Bauten keine Arbeit bieten:
		// Geprüft wird der private Auftrag.
		await Region.update({ treasury: 0 }, { where: { id: stadtId } });
	});

	it('schickt niemanden zu einer Baustelle, deren Herr nichts hat', async () => {
		const mittellos = await person('Mittellos', 0);
		await baustelle(mittellos, 3);
		await person('Tagelöhnerin', 20);

		const stunde = await npcService.actForNpcs(JETZT);

		// **Der Kern von 5.81**: kein Versuch, also kein Fehlschlag. Vorher stand hier
		// Tick für Tick ein `WORK/EMPLOYER_BROKE`.
		expect(stunde.byFailure['WORK/EMPLOYER_BROKE']).toBeUndefined();
	});

	it('schickt sie hin, sobald er zahlen kann', async () => {
		// Die Gegenprobe — sonst prüfte der Test oben nur, dass niemand arbeitet.
		const zahlungsfähig = await person('Bauherrin', 100);
		await baustelle(zahlungsfähig, 3);
		const arbeiterin = await person('Tagelöhnerin', 20);

		const stunde = await npcService.actForNpcs(JETZT);

		expect(stunde.byAction.WORK).toBeGreaterThan(0);
		expect(stunde.byFailure['WORK/EMPLOYER_BROKE']).toBeUndefined();
		expect((await Character.findByPk(arbeiterin))!.dataValues.money).toBeGreaterThan(20);
	});

	it('rechnet das Können des Suchenden mit, nicht nur den Aushang', async () => {
		// **Der Rest, den 5.81 übrig ließ** (Punkt 106): Gezahlt wird Aushang mal Können.
		// Bei Können 5 werden aus drei ausgehängten Münzen fünf — ein Bauherr mit vier
		// besteht die Prüfung auf den Aushang und scheitert an der Zahlung. Im Messlauf
		// nach 5.81 blieben so 1689 vergebliche Schichten stehen, weil seit dem Rohbau
		// fast jeder bauen kann.
		const knapp = await person('Knapp', 4);
		await Character.update({ actionPoints: 0 }, { where: { id: knapp } });
		await baustelle(knapp, 3);
		const meisterin = await person('Meisterin', 20);
		await Skill.create({ CharacterId: meisterin, type: 'CONSTRUCTION', level: 5, progress: 0 });

		const stunde = await npcService.actForNpcs(JETZT);

		expect(stunde.byFailure['WORK/EMPLOYER_BROKE']).toBeUndefined();
	});

	it('nimmt den zahlbaren Auftrag, nicht den bestbezahlten', async () => {
		// **Die Sortierung war die Falle**: Gesucht wird nach dem besten Lohn, und der
		// teuerste Aushang stammt gern von dem, der ihn nicht zahlen kann.
		//
		// **Beide Bauherren bleiben untätig** (keine Aktionspunkte): Sonst brächte jeder
		// seine eigene Baustelle selbst voran, und der Test bestünde, ohne dass die
		// Tagelöhnerin etwas getan hätte — so ist er beim ersten Anlauf durchgegangen.
		const prahler = await person('Prahler', 2);
		await Character.update({ actionPoints: 0 }, { where: { id: prahler } });
		await baustelle(prahler, 20);
		const solide = await person('Solide', 100);
		await Character.update({ actionPoints: 0 }, { where: { id: solide } });
		const echteArbeit = await baustelle(solide, 3);
		const arbeiterin = await person('Tagelöhnerin', 20);

		await npcService.actForNpcs(JETZT);

		// Sie hat verdient — also war sie an der zahlbaren Baustelle und nicht an der
		// teuren, an der sie leer ausgegangen wäre.
		expect((await Character.findByPk(arbeiterin))!.dataValues.money).toBeGreaterThan(20);
		expect((await Building.findByPk(echteArbeit))!.dataValues.condition).toBeGreaterThan(0);
	});
});
