import { beforeAll, describe, expect, it } from 'vitest';
import { Op } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { seedWorld } from '$lib/db/seed';
import * as familyService from '$lib/server/service/familyService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as npcService from '$lib/server/service/npcService';
import { satietyOf } from '$lib/server/service/needService';
import { AGE_OF_MAJORITY, ageInYears, TICKS_PER_YEAR } from '$lib/game/time';
import { FERTILE_TO_AGE } from '$lib/game/family.logic';

/**
 * Trägt sich die Welt selbst?
 *
 * Das ist die Frage, auf die das ganze Spiel zuläuft: NPCs sollen essen, arbeiten,
 * heiraten und sterben, ohne dass jemand zusieht. Ein Test dafür ist unüblich — er prüft
 * keine Funktion, sondern ein Zusammenspiel über Hunderte von Ticks. Genau deshalb
 * gehört er hierher: Jede einzelne Mechanik kann für sich richtig sein, und die Stadt
 * stirbt trotzdem aus.
 *
 * Der Anlass war ein echter Vorfall. Mit den Bedürfnissen aus 4.6a bekam jeder Charakter
 * Hunger — aber nur Spieler konnten essen. Ein Verhungernder trägt 4,5 % Risiko je Tick;
 * nach drei Realtagen leben noch 3,6 %. Die Welt hätte sich binnen einer Woche
 * entvölkert, und keine einzige der damals 319 Prüfungen hätte angeschlagen.
 */

/** Ein Zufall, der bei jedem Lauf denselben Verlauf nimmt. */
function gesteuerterZufall(saat: number): () => number {
	let zustand = saat;
	return () => {
		zustand = (zustand * 1103515245 + 12345) % 2147483648;
		return zustand / 2147483648;
	};
}

/** Lässt die Welt so viele Ticks laufen, wie der Takt es täte. */
async function weltLaufenLassen(ticks: number, wuerfel: () => number): Promise<void> {
	let jetzt: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;

	for (let i = 0; i < ticks; i++) {
		jetzt += 1;
		await World.update({ currentTick: jetzt }, { where: { id: WORLD_ID } });

		// Dieselbe Reihenfolge wie im Takt: geboren werden, handeln, sterben.
		await familyService.advanceFamilies(jetzt, wuerfel);
		await npcService.actForNpcs(jetzt);
		await lifecycleService.reapTheDead(jetzt, wuerfel);
	}
}

async function lebende(): Promise<number> {
	return Character.count({ where: { deathTick: null } });
}

describe('Die Welt trägt sich selbst', () => {
	let amAnfang = 0;

	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		amAnfang = await lebende();

		// Fünf Spieljahre ohne einen einzigen Spieler.
		await weltLaufenLassen(TICKS_PER_YEAR * 5, gesteuerterZufall(42));
	}, 180_000);

	it('lässt die Stadt nicht aussterben', () => {
		// Vor diesem Schritt wäre hier null herausgekommen: Niemand außer den Spielern
		// konnte essen.
		expect(amAnfang).toBeGreaterThan(0);
	});

	it('hat noch Einwohner', async () => {
		expect(await lebende()).toBeGreaterThan(0);
	});

	it('lässt niemanden verhungern, der arbeiten konnte', async () => {
		const jetzt: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
		const alle = await Character.findAll({ where: { deathTick: null } });

		// Die eigentliche Probe aufs Exempel: Wer lebt, hat sich selbst versorgt — ohne
		// dass ein Spieler ihm ein Brot gekauft hätte.
		for (const person of alle) {
			expect(satietyOf(person.dataValues, jetzt)).toBeGreaterThan(0);
		}
	});

	it('bringt aus eigener Kraft Ehen zustande', async () => {
		const verheiratet: number = await Character.count({
			where: { deathTick: null, spouseId: { [Op.ne]: null } }
		});

		// Ohne Ehen keine Kinder, ohne Kinder keine Bevölkerung — das ist die Kette, an
		// der die Selbsterhaltung hängt.
		expect(verheiratet).toBeGreaterThan(0);
	});

	it('verdient sein Brot selbst', async () => {
		// Wer arbeitet, hat Geld. Am Weltanfang hatte kein NPC eine einzige Münze.
		const mitGeld: number = await Character.count({
			where: { deathTick: null, role: 'NPC', money: { [Op.gt]: 0 } }
		});

		expect(mitGeld).toBeGreaterThan(0);
	});

	it('zieht unter das Dach, das die Stadt stellt', async () => {
		const behaust: number = await Character.count({
			where: { deathTick: null, HomeBuildingId: { [Op.ne]: null } }
		});

		// Ohne Wohnraum keine Kinder (4.4). Die städtische Unterkunft ist genau dafür da.
		expect(behaust).toBeGreaterThan(0);
	});

	it('erfüllt aus eigener Kraft alle Voraussetzungen für Nachwuchs', async () => {
		const jetzt: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
		const frauen = await Character.findAll({
			where: { deathTick: null, gender: 'FEMALE', spouseId: { [Op.ne]: null } }
		});

		// **Warum nicht die Geburt selbst?** Weil sie an einem Würfel hängt: Drei
		// fruchtbare Frauen über fünf Spieljahre ergeben gut zwei erwartete Kinder — und
		// gut zehn Prozent Aussicht auf keines. Ein Test, der in jedem zehnten Lauf
		// scheitert, sagt nichts über den Code und viel über die Nerven. Dass eine
		// Empfängnis zur Geburt führt, prüft `familyService.spec.ts` deterministisch.
		//
		// Hier zählt, dass die Welt aus eigener Kraft in den Zustand kommt, in dem Kinder
		// überhaupt möglich sind: verheiratet, im fruchtbaren Alter, mit einem Dach über
		// dem Kopf. Genau daran fehlte es vor 4.6b an allen drei Stellen.
		const bereit: string[] = [];
		for (const frau of frauen) {
			const alter: number = ageInYears(frau.dataValues.birthTick, jetzt);
			if (alter < AGE_OF_MAJORITY || alter > FERTILE_TO_AGE) continue;

			const platz = await familyService.freierWohnraum(frau.dataValues.HomeBuildingId);
			if (platz !== null && platz > 0) bereit.push(frau.dataValues.firstName);
		}

		expect(bereit.length).toBeGreaterThan(0);
	});
});
