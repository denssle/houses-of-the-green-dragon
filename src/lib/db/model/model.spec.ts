import { beforeAll, describe, expect, it } from 'vitest';
import { UniqueConstraintError, ValidationError } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Building, CONDITION_PERFECT } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { DynastyRelationship } from '$lib/db/model/dynastyRelationship';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { RegionLink } from '$lib/db/model/regionLink';
import { Relationship } from '$lib/db/model/relationship';
import { SessionToken } from '$lib/db/model/sessionToken';
import { User } from '$lib/db/model/user';
import { World } from '$lib/db/model/world';

/**
 * Prüft das Schema aus Phase 1.3 gegen eine echte Datenbank: Was die Modelle
 * beschreiben, muss sich anlegen, schreiben und in den Grenzen ablehnen lassen, die das
 * Konzept vorsieht. Die Assoziationen kommen erst mit 1.4 dazu.
 */
describe('Schema', () => {
	beforeAll(async () => {
		await sequelize.sync();
	});

	it('legt alle elf Tabellen an', async () => {
		const tabellen = (await sequelize.getQueryInterface().showAllTables()).map(String);

		expect(tabellen).toEqual(
			expect.arrayContaining([
				'users',
				'sessionTokens',
				'dynasties',
				'characters',
				'relationships',
				'dynastyRelationships',
				'regions',
				'regionLinks',
				'plots',
				'buildings',
				'worlds'
			])
		);
	});
});

describe('Zusicherungen der Datenbank', () => {
	beforeAll(async () => {
		await sequelize.sync();
	});

	// Die Prüfung im Service davor genügt nicht: Zwei gleichzeitige Registrierungen
	// kämen beide durch, weil beide vor dem Schreiben des anderen nachsehen.
	it('lässt denselben Nickname kein zweites Mal zu', async () => {
		await User.create({ id: 'u1', nickname: 'drache', password: 'x' });

		await expect(User.create({ id: 'u2', nickname: 'drache', password: 'y' })).rejects.toThrow(
			UniqueConstraintError
		);
	});

	it('weist eine unbekannte Rolle ab', async () => {
		await Region.create({ id: 'r-rolle', name: 'Grünau', type: 'CITY', treasury: 0 });

		await expect(
			Character.create({
				id: 'c-rolle',
				firstName: 'Hein',
				// @ts-expect-error — genau das soll die Validierung verhindern
				role: 'KOENIG',
				gender: 'MALE',
				lastTickProcessed: 0,
				birthTick: 0,
				RegionId: 'r-rolle'
			})
		).rejects.toThrow(ValidationError);
	});

	// Die Zuneigung ist gerichtet: Dass A B schätzt, sagt nichts darüber, was B von A
	// hält. Beide Zeilen müssen deshalb nebeneinander bestehen können.
	it('erlaubt beide Richtungen einer Beziehung, aber jede nur einmal', async () => {
		await Relationship.create({
			fromCharacterId: 'a',
			toCharacterId: 'b',
			affection: 20,
			lastChangedTick: 0
		});
		await Relationship.create({
			fromCharacterId: 'b',
			toCharacterId: 'a',
			affection: -40,
			lastChangedTick: 0
		});

		await expect(
			Relationship.create({
				fromCharacterId: 'a',
				toCharacterId: 'b',
				affection: 0,
				lastChangedTick: 0
			})
		).rejects.toThrow(UniqueConstraintError);
	});

	it('nimmt negative Zuneigung an — Verwandtschaft ist keine Untergrenze', async () => {
		const hass = await DynastyRelationship.create({
			fromDynastyId: 'haus-drache',
			toDynastyId: 'haus-falke',
			standing: -80,
			lastChangedTick: 0
		});

		expect(hass.dataValues.standing).toBe(-80);
	});
});

describe('Vorgaben beim Anlegen', () => {
	beforeAll(async () => {
		await sequelize.sync();
	});

	it('gibt einem neuen Charakter Titel, leere Kasse und kein Sterbedatum', async () => {
		await Region.create({ id: 'r-neu', name: 'Grünau', type: 'CITY', treasury: 0 });

		const kind = await Character.create({
			id: 'c-neu',
			firstName: 'Mette',
			role: 'NPC',
			gender: 'FEMALE',
			lastTickProcessed: 0,
			birthTick: 0,
			RegionId: 'r-neu'
		});

		expect(kind.dataValues).toMatchObject({
			title: 'Neuling',
			actionPoints: 0,
			money: 0,
			deathTick: null,
			// Fremd-NPCs gehören zu keinem Haus.
			DynastyId: null
		});
	});

	it('errichtet ein Gebäude tadellos und auf Stufe eins', async () => {
		const huette = await Building.create({
			id: 'b-neu',
			name: 'Schmiede',
			optionId: 2,
			lastConditionTick: 0
		});

		expect(huette.dataValues).toMatchObject({
			level: 1,
			condition: CONDITION_PERFECT,
			ownerType: 'CHARACTER',
			forSalePrice: null
		});
	});

	it('legt ein Grundstück als nicht vergeben an', async () => {
		await Region.create({ id: 'r-plot', name: 'Grünau', type: 'CITY', treasury: 0 });

		const parzelle = await Plot.create({
			id: 'p-neu',
			address: 'Am Markt 3',
			type: 'BUILDING_LAND',
			RegionId: 'r-plot'
		});

		expect(parzelle.dataValues).toMatchObject({ ownerType: 'NONE', OwnerCharacterId: null });
	});

	it('beginnt die Dynastie lebendig', async () => {
		const haus = await Dynasty.create({
			id: 'd-neu',
			name: 'Haus zum grünen Drachen',
			UserId: 'u-neu',
			foundedAtTick: 0
		});

		expect(haus.dataValues).toMatchObject({ isExtinct: false, extinctAtTick: null });
	});

	it('startet die Weltzeit bei null in genau einer Zeile', async () => {
		const welt = await World.create({});

		expect(welt.dataValues).toMatchObject({ id: 1, currentTick: 0 });
		expect(welt.dataValues.lastTickAt).toBeInstanceOf(Date);
		await expect(World.create({})).rejects.toThrow(UniqueConstraintError);
	});
});

describe('Karte und Sitzungen', () => {
	beforeAll(async () => {
		await sequelize.sync();
	});

	it('verbindet zwei Orte mit einer Entfernung in Ticks', async () => {
		await Region.create({ id: 'stadt', name: 'Grünau', type: 'CITY', treasury: 0 });
		await Region.create({ id: 'wald', name: 'Eichwald', type: 'FOREST' });

		await RegionLink.create({ fromRegionId: 'stadt', toRegionId: 'wald', distanceInTicks: 2 });

		const weg = await RegionLink.findOne({ where: { fromRegionId: 'stadt' } });
		expect(weg?.dataValues.distanceInTicks).toBe(2);
	});

	it('lässt einer Umlandfläche keine Stadtkasse aufzwingen — sie bleibt schlicht leer', async () => {
		const wald = await Region.create({ id: 'wald2', name: 'Eichwald', type: 'FOREST' });

		expect(wald.dataValues.treasury).toBeNull();
	});

	it('hält je Benutzer eine Sitzung, die den opaken Token trägt', async () => {
		await SessionToken.create({ UserId: 'u-sitzung', token: 'zufallswert' });

		const sitzung = await SessionToken.findByPk('u-sitzung');
		expect(sitzung?.dataValues.token).toBe('zufallswert');
	});
});
