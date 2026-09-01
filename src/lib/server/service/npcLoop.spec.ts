import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { seedWorld } from '$lib/db/seed';
import { seededRoll } from '$lib/game/testRoll';
import * as npcService from '$lib/server/service/npcService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Was geschieht, wenn ein einzelner Einwohner stolpert (Punkt 91)?
 *
 * **Der Takt ist nicht atomar**, und das war seine gefährlichste Stelle: `ausfuehren` hatte
 * keinen eigenen Schutz, also lief die Ausnahme eines Einzelnen bis in das `try` von
 * `schlagen()`. Mit ihr fiel alles aus, was danach kommt — die übrigen Einwohner, der
 * Zuzug, die Wahl, die Amtshandlungen, die Grundsteuer, der Sold, das Unglück und das
 * Sterben. Und weil die Zugreihenfolge in jedem Tick dieselbe ist (Punkt 88), wäre es
 * nicht eine verlorene Stunde geblieben, sondern dieselbe Stunde, Stunde um Stunde.
 *
 * **Warum der Schritt als Parameter hereinkommt:** Ein kaputter Charakter lässt sich nicht
 * herstellen. Beide Versuche scheiterten an der Datenbank — `RegionId` darf nicht `null`
 * sein, und ein Verweis ins Leere bricht am Fremdschlüssel. Das ist gut so; für den Test
 * bleibt derselbe Weg, den `reapTheDead` mit dem Würfel geht.
 */
describe('Die Einwohnerschleife', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld(seededRoll(91));
	});

	async function jemand(name: string): Promise<string> {
		const alle = await Character.findAll({ where: { role: 'NPC' } });
		const vorhanden = alle.find((person) => person.dataValues.firstName === name);
		if (vorhanden) return vorhanden.dataValues.id;

		const id = randomUUID();
		await Character.create({
			id,
			firstName: name,
			role: 'NPC',
			gender: 'FEMALE',
			birthTick: 10_000 - yearsToTicks(30),
			lastTickProcessed: 10_000,
			satiety: 100,
			lastNeedTick: 10_000,
			actionPoints: 48,
			money: 50,
			RegionId: alle[0].dataValues.RegionId
		});
		return id;
	}

	it('lässt die übrigen weiterhandeln, wenn einer stolpert', async () => {
		const stolperer: string = await jemand('Stolperer');
		const lebende: number = await Character.count({ where: { deathTick: null, role: 'NPC' } });

		const lauf = await npcService.actForNpcs(10_000, async (characterId, tick, unattended) => {
			if (characterId === stolperer) throw new Error('kaputter Datensatz');
			return npcService.ausfuehren(characterId, tick, unattended);
		});

		// Der Stolperer steht unter den Fehlschlägen — und nur dort.
		expect(lauf.byFailure[npcService.AUSNAHME]).toBe(1);

		// **Die Probe aufs Exempel:** Alle anderen sind trotzdem drangekommen. Vorher wäre
		// die Schleife beim Stolperer abgebrochen und mit ihr der Rest der Stunde.
		const gezaehlt: number = Object.values(lauf.byAction).reduce((summe, oft) => summe + oft, 0);
		expect(gezaehlt).toBe(lebende - 1);
	});

	it('bucht den Abgestürzten in keiner Handlungszählung', async () => {
		// Sonst stünde er als Müßiggänger ohne Grund da und bräche die Zusicherung, dass zu
		// jedem `IDLE` ein Grund gehört.
		const stolperer: string = await jemand('Stolperer');

		const lauf = await npcService.actForNpcs(10_001, async (characterId, tick, unattended) => {
			if (characterId === stolperer) throw new Error('kaputter Datensatz');
			return npcService.ausfuehren(characterId, tick, unattended);
		});

		const muessig: number = lauf.byAction.IDLE ?? 0;
		const gruende: number = Object.values(lauf.byIdleReason).reduce((summe, oft) => summe + oft, 0);
		expect(gruende).toBe(muessig);
	});
});
