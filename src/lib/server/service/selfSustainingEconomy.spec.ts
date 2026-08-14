import { beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Building } from '$lib/db/model/building';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { seedWorld } from '$lib/db/seed';
import * as npcService from '$lib/server/service/npcService';

/**
 * Trägt sich auch die **Wirtschaft** selbst?
 *
 * Bis 4.12 war die Antwort nein: NPCs arbeiteten, aßen und kauften, aber jeder Betrieb
 * gehörte einem Spieler. Fiel der letzte weg, stellte niemand mehr etwas her. Seit 4.13
 * können sie selbst unternehmen — Grundstück kaufen, Werkstatt bauen, pachten, ernten,
 * herstellen, verkaufen.
 *
 * **Eine eigene Datei, keine zweite Beschreibung in `selfSustaining.spec.ts`.** Beide
 * teilten sich sonst dieselbe Datenbank: Der zweite Block erbte eine Welt, die schon fünf
 * Jahre gelaufen war — mit alten, verheirateten, mittellosen Einwohnern. Der Test schlug
 * fehl, und zwar aus einem Grund, der nichts mit seiner Frage zu tun hatte.
 */
describe('Die Wirtschaft trägt sich selbst', () => {
	let vorher = 0;

	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();

		// Startkapital **und** Unternehmergeist, beides ausdrücklich gesetzt: Die Anlagen
		// der Gründer würfelt `seedWorld` mit `Math.random`, und ob zufällig jemand
		// ehrgeizig genug ist, wäre die Frage nicht wert — geprüft wird, ob ein
		// Unternehmungslustiger auch unternimmt, nicht ob der Würfel einen hervorbringt.
		await Character.update({ money: 400, ambition: 60, diligence: 60 }, { where: { role: 'NPC' } });

		vorher = await Building.count({ where: { ownerType: 'CHARACTER' } });

		// Zwanzig Ticks genügen: Jede Handlung ist einer, und die ersten gehen fürs
		// Einziehen und Werben drauf.
		const start: number = (await World.findByPk(WORLD_ID))!.dataValues.currentTick;
		for (let i = 0; i < 20; i++) {
			await npcService.actForNpcs(start + i);
			await World.update({ currentTick: start + i + 1 }, { where: { id: WORLD_ID } });
		}
	}, 180_000);

	it('bringt aus eigener Kraft einen Betrieb hervor', async () => {
		expect(vorher).toBe(0);
		expect(await Building.count({ where: { ownerType: 'CHARACTER' } })).toBeGreaterThan(0);
	});

	it('und das Grundstück darunter', async () => {
		expect(await Plot.count({ where: { ownerType: 'CHARACTER' } })).toBeGreaterThan(0);
	});

	it('lässt darin auch arbeiten', async () => {
		// Ein Betrieb, in dem nichts geschieht, wäre ein teures Denkmal.
		const lager: number = await BuildingStock.count();
		const angebote: number = await ShopOffer.count();

		expect(lager + angebote).toBeGreaterThan(0);
	});
});
