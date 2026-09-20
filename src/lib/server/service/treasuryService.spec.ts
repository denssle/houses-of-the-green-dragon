import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Region } from '$lib/db/model/region';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as treasuryService from '$lib/server/service/treasuryService';
import * as plotService from '$lib/server/service/plotService';
import { PLOT_PRICE } from '$lib/game/economy';

/**
 * Das Kassenbuch (5.77, Punkt 101).
 *
 * **Geprüft wird nicht die Buchhaltung, sondern ihre Kopplung an die Zahlung.** Ein Buch,
 * das man vergessen kann, ist schlimmer als keines: Es ist dann nicht falsch, sondern
 * unbemerkt unvollständig, und man glaubt ihm trotzdem. Deshalb steht hier neben den
 * Einzelfällen ein Test, der einen **echten Dienst** aufruft und danach beides vergleicht
 * — was in der Kasse liegt und was im Buch steht.
 */

let stadtId: string;

const JETZT = 5_000;

async function person(geld: number): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: 'Adelbert',
		role: 'PLAYER',
		gender: 'MALE',
		birthTick: 0,
		lastTickProcessed: JETZT,
		money: geld,
		RegionId: stadtId
	});
	return id;
}

describe('Das Kassenbuch', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
	});

	beforeEach(async () => {
		await Character.destroy({ where: { role: 'PLAYER' } });
		await Plot.update(
			{ ownerType: 'NONE', OwnerCharacterId: null },
			{ where: { type: 'BUILDING_LAND' } }
		);
		await Region.update({ treasury: 1000 }, { where: { id: stadtId } });
		treasuryService.kassenbuchLeeren();
	});

	async function kasse(): Promise<number> {
		return (await Region.findByPk(stadtId))!.dataValues.treasury ?? 0;
	}

	it('hebt die Kasse und schreibt den Grund mit', async () => {
		await treasuryService.einnehmen(stadtId, 40, 'PLOT_SALE');

		expect(await kasse()).toBe(1040);
		expect(treasuryService.kassenbuch().zufluss).toEqual({ PLOT_SALE: 40 });
	});

	it('senkt die Kasse und schreibt den Grund mit', async () => {
		await treasuryService.ausgeben(stadtId, 25, 'PUBLIC_BUILD');

		expect(await kasse()).toBe(975);
		expect(treasuryService.kassenbuch().abfluss).toEqual({ PUBLIC_BUILD: 25 });
	});

	it('zählt denselben Grund zusammen, gleich aus welchem Dienst er kommt', async () => {
		// Der Zehnt kommt aus zwei Diensten — der eigenen Ernte und der des Knechts. Für
		// die Frage „wovon lebt die Stadt" ist das derselbe Posten.
		await treasuryService.einnehmen(stadtId, 7, 'TITHE');
		await treasuryService.einnehmen(stadtId, 5, 'TITHE');

		expect(treasuryService.kassenbuch().zufluss.TITHE).toBe(12);
	});

	it('kennt keinen Grund, den nichts mehr bucht', async () => {
		// **`PUBLIC_REPAIR` ist mit 5.79 gestrichen worden**, weil die Instandsetzung seit
		// 5.78 keine Münze mehr kostet. Die Buchung entfiel mit der Zahlung, der Grund blieb
		// als Karteileiche zurück — und im Messbericht sieht eine Zeile, die nie erscheint,
		// aus wie „ist nie vorgekommen". Genau so ist es einmal fehlgedeutet worden.
		//
		// **`DEVELOPMENT` ist mit 5.92 aus demselben Grund gefallen** (Punkt 102): Die
		// Erschließung kostet seither Arbeit statt Münzen, und was die Stadt den Vermessern
		// zahlt, ist Lohn — also `WAGE`.
		expect(treasuryService.KASSENABFLUESSE).toEqual(['WAGE', 'STIPEND', 'PUBLIC_BUILD']);
	});

	it('bucht nichts, wo nichts fließt', async () => {
		// Ein Zehnt von null Münzen ist keine Buchung. Mehrere Aufrufer prüften das früher
		// selbst; die Prüfung steht jetzt an einer Stelle.
		await treasuryService.einnehmen(stadtId, 0, 'TITHE');
		await treasuryService.einnehmen(stadtId, -3, 'TITHE');

		expect(await kasse()).toBe(1000);
		expect(treasuryService.kassenbuch().zufluss).toEqual({});
	});

	it('weiß, welche Ausgabe bei einem Menschen ankommt', async () => {
		// **Die eigentliche Frage des Punktes.** Seit 5.92 hat nur noch **eine** der drei
		// Ausgabearten keinen Empfänger; ihre Summe ist der Teil des vernichteten Geldes,
		// den die Stadt selbst verbrennt — und mit der Erschließung ist der größte Posten
		// daraus verschwunden.
		expect(treasuryService.hatEmpfaenger('WAGE')).toBe(true);
		expect(treasuryService.hatEmpfaenger('STIPEND')).toBe(true);
		expect(treasuryService.hatEmpfaenger('PUBLIC_BUILD')).toBe(false);
	});

	it('schreibt mit, was ein Dienst bewegt — ohne dass der Dienst daran denken muss', async () => {
		// **Der Test, auf den es ankommt.** Er ruft keinen Buchungsaufruf auf, sondern den
		// Grundstückskauf, wie ihn ein Spieler auslöst. Wer die Zahlung dort einmal am Buch
		// vorbeiführt, sieht es hier — und nicht erst an einem Messbericht, dessen Summen
		// nicht mehr aufgehen.
		const kaeufer = await person(200);
		const frei = await plotService.getFreeBuildingLand(stadtId);

		await plotService.buyPlot(frei[0].id, kaeufer);

		expect(await kasse()).toBe(1000 + PLOT_PRICE);
		expect(treasuryService.kassenbuch().zufluss).toEqual({ PLOT_SALE: PLOT_PRICE });
	});
});
