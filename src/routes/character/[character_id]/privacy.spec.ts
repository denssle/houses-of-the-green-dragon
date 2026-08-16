import { describe, expect, it } from 'vitest';
import { load } from './+page.server';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { World } from '$lib/db/model/world';
import { WORLD_ID } from '$lib/db/attributes/world.attributes';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as characterService from '$lib/server/service/characterService';
import { yearsToTicks } from '$lib/game/time';

/**
 * Was von einer fremden Person nach draußen geht (5.22).
 *
 * **Der Fehler war nicht die Anzeige, sondern die Auslieferung.** Ein `{#if data.self}`
 * verbarg Geld und Aktionspunkte im Markup — geliefert wurde der vollständige Charakter,
 * und damit stand beides in den Daten hinter der Seite. Wer die Seite eines Mitspielers
 * aufrief, konnte dessen Beutel auslesen.
 *
 * Das war zweierlei zugleich: ein gebrochenes Versprechen der Datenschutzerklärung („Nicht
 * sichtbar sind Geld, Aktionspunkte und der Zustand einer Figur") und ein Spielvorteil —
 * wer den Beutel seines Gegenübers kennt, weiß bei jeder Versteigerung, wie weit er gehen
 * kann.
 *
 * Deshalb prüft dieser Test **die Daten und nicht die Darstellung**. Ein Test, der nur
 * nachsieht, ob eine Zahl auf dem Bildschirm steht, hätte den Fehler nie gefunden.
 */

const JETZT = 10_000;

/** Ein `load`-Aufruf, wie ihn SvelteKit macht — nur mit dem, was diese Seite benutzt. */
function anfrage(characterId: string, angemeldetAls?: Awaited<ReturnType<typeof charakter>>) {
	return {
		params: { character_id: characterId },
		locals: { currentCharacter: angemeldetAls }
	} as unknown as ServerLoadEvent;
}

async function charakter(name: string, geld: number) {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'PLAYER',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		satiety: 100,
		lastNeedTick: JETZT,
		actionPoints: 42,
		money: geld,
		RegionId: await findStartRegionId()
	});
	return (await characterService.getCharacter(id))!;
}

describe('Die Seite einer fremden Person', () => {
	it('liefert deren Geld und Aktionspunkte nicht mit', async () => {
		await sequelize.sync();
		await seedWorld();
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });

		const ich = await charakter('Ich', 10);
		const andere = await charakter('Die Andere', 9999);

		const daten = await load(anfrage(andere.id, ich));

		// Der Kern: Was in der Truhe liegt, verlässt den Server nicht.
		expect(daten.purse).toBeUndefined();
		expect(JSON.stringify(daten)).not.toContain('9999');
		expect(daten.character).not.toHaveProperty('money');
		expect(daten.character).not.toHaveProperty('actionPoints');
		// Sättigung war schon vorher richtig gebunden — bleibt es hoffentlich.
		expect(daten.hunger).toBeUndefined();

		// Und was auf der Gasse sichtbar wäre, steht weiterhin da.
		expect(daten.character.firstName).toBe('Die Andere');
		expect(daten.age).toBe(30);
	});

	it('zeigt der eigenen Person alles', async () => {
		await sequelize.sync();
		await seedWorld();
		await World.update({ currentTick: JETZT }, { where: { id: WORLD_ID } });

		const ich = await charakter('Ich selbst', 777);

		const daten = await load(anfrage(ich.id, ich));

		expect(daten.purse?.money).toBe(777);
		expect(daten.purse?.actionPoints).toBe(42);
		expect(daten.hunger).toBeDefined();
	});
});
