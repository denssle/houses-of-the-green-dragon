import { Op, type WhereOptions } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import type { CharacterAttributes } from '$lib/db/attributes/character.attributes';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import {
	chooseGuardian,
	type GuardianCandidate,
	isMinor,
	kinshipRank,
	MUENDEL_IN_NOT_UNTER,
	WAISE_ISST_UNTER,
	WAISEN_BROT_VORRAT,
	WAISENHAUS_OPTION_ID,
	WAISENHAUS_PLAETZE
} from '$lib/game/guardianship.logic';
import { eat } from '$lib/game/need.logic';
import { AGE_OF_MAJORITY, yearsToTicks } from '$lib/game/time';
import { getItemTemplate } from '$lib/model/itemTemplate';
import * as buildingService from '$lib/server/service/buildingService';
import * as chronicleService from '$lib/server/service/chronicleService';
import * as householdService from '$lib/server/service/householdService';
import * as needService from '$lib/server/service/needService';
import * as tradeService from '$lib/server/service/tradeService';

/**
 * Die Waisen der Stadt (0.7.0) — siehe `guardianship.logic.ts`.
 *
 * **Ein Durchgang im Takt und kein Eingriff in `die()`.** Der Tod ist nur einer von mehreren
 * Anlässen: Auch ein Vormund stirbt, ein Mündel gerät in Not, die Waisen, die es beim Deploy
 * schon gibt, sind längst Waisen. Ein Durchgang über die lebenden Kinder erfasst alle
 * diese Fälle mit derselben Frage, und was in einer Stunde nicht ging, geht in der nächsten.
 */

export interface OrphanCare {
	/** Wer bei Verwandten untergekommen ist. */
	fostered: { child: string; guardian: string }[];
	/** Wer ins Waisenhaus aufgenommen wurde. */
	admitted: string[];
	/** Wer volljährig geworden ist und nun für sich selbst sorgt. */
	grownUp: string[];
	/** Waisen, für die weder eine Familie noch ein Platz zu finden war. */
	unplaced: number;
	/** Mahlzeiten aus dem Lager des Waisenhauses. */
	meals: number;
	/** Hungrige Waisen, für die kein Brot da war. Der Befund, nach dem man suchen soll. */
	unfed: number;
	/** Was die Stadt gekauft hat. */
	bought: number;
	spent: number;
}

type Mensch = Awaited<ReturnType<typeof Character.findAll>>[number];

async function waisenhausVon(regionId: string) {
	return Building.findOne({
		where: { optionId: WAISENHAUS_OPTION_ID },
		include: [{ model: Plot, as: 'plot', where: { RegionId: regionId }, required: true }]
	});
}

/** Wer das Kind aufnehmen kann: verwandt, erwachsen, mit einem Dach und Platz darunter. */
async function vormundFuer(
	kind: Mensch,
	eltern: Mensch[],
	tick: number
): Promise<string | undefined> {
	const werte = kind.dataValues;
	const elternIds: string[] = eltern.map((person) => person.dataValues.id);
	const grosseltern: string[] = eltern
		.flatMap((person) => [person.dataValues.motherId, person.dataValues.fatherId])
		.filter((id): id is string => id !== null);
	const vorfahren: string[] = [...elternIds, ...grosseltern];

	const linien: WhereOptions<CharacterAttributes>[] = [];
	if (grosseltern.length > 0) linien.push({ id: { [Op.in]: grosseltern } });
	if (vorfahren.length > 0) {
		linien.push({ motherId: { [Op.in]: vorfahren } }, { fatherId: { [Op.in]: vorfahren } });
	}
	if (werte.DynastyId !== null) linien.push({ DynastyId: werte.DynastyId });
	if (linien.length === 0) return undefined;

	const verwandte = await Character.findAll({
		where: {
			deathTick: null,
			RegionId: werte.RegionId,
			id: { [Op.ne]: werte.id },
			birthTick: { [Op.lte]: tick - yearsToTicks(AGE_OF_MAJORITY) },
			[Op.or]: linien
		}
	});

	const kandidaten: GuardianCandidate[] = [];
	for (const person of verwandte) {
		const rank = kinshipRank(
			werte,
			eltern.map((elternteil) => elternteil.dataValues),
			person.dataValues
		);
		if (rank === undefined) continue;

		const dach: string | null = person.dataValues.HomeBuildingId;
		const istSchonDort: boolean = dach !== null && dach === werte.HomeBuildingId;
		if (!istSchonDort && ((await buildingService.freierWohnraum(dach)) ?? 0) <= 0) continue;

		kandidaten.push({
			id: person.dataValues.id,
			rank,
			money: person.dataValues.money,
			birthTick: person.dataValues.birthTick
		});
	}
	return chooseGuardian(kandidaten);
}

async function nimmAuf(
	kind: Mensch,
	vormund: Mensch,
	regionId: string,
	tick: number
): Promise<void> {
	const dach: string | null = vormund.dataValues.HomeBuildingId;
	await sequelize.transaction(async (t) => {
		await kind.update(
			{ guardianId: vormund.dataValues.id, HomeBuildingId: dach },
			{ transaction: t }
		);
		await chronicleService.record(
			'GUARDIAN_TAKEN',
			regionId,
			tick,
			{ subjectId: kind.dataValues.id, objectId: vormund.dataValues.id },
			t
		);
	});
}

async function insWaisenhaus(
	kind: Mensch,
	haus: string,
	regionId: string,
	tick: number
): Promise<void> {
	await sequelize.transaction(async (t) => {
		await kind.update({ guardianId: null, HomeBuildingId: haus }, { transaction: t });
		await chronicleService.record(
			'ORPHAN_ADMITTED',
			regionId,
			tick,
			{ subjectId: kind.dataValues.id, buildingId: haus },
			t
		);
	});
}

/** Eine Mahlzeit aus dem Lager. Ohne Aktionspunkt, wie jede andere auch. */
async function speise(waise: Mensch, haus: string, tick: number): Promise<boolean> {
	const naehrwert: number = getItemTemplate('BREAD')?.nourishment ?? 0;
	return sequelize.transaction(async (t) => {
		if (!(await tradeService.changeBuildingStock(haus, 'BREAD', -1, t))) return false;
		const stand: number = needService.satietyOf(waise.dataValues, tick);
		await waise.update(
			{ satiety: Math.round(eat(stand, naehrwert)), lastNeedTick: tick },
			{ transaction: t }
		);
		return true;
	});
}

/** Ein Durchgang: Aufnehmen, was aufzunehmen ist, und dann die Waisen satt machen. */
export async function careForOrphans(regionId: string, tick: number): Promise<OrphanCare> {
	const bericht: OrphanCare = {
		fostered: [],
		admitted: [],
		grownUp: [],
		unplaced: 0,
		meals: 0,
		unfed: 0,
		bought: 0,
		spent: 0
	};

	const waisenhaus = await waisenhausVon(regionId);
	const haus: string | undefined = waisenhaus?.dataValues.id;

	// **Auch Erwachsene:** Wer heute sechzehn wird, steht noch als Mündel oder im Waisenhaus.
	const leute = await Character.findAll({
		where: {
			deathTick: null,
			RegionId: regionId,
			[Op.or]: [
				{ birthTick: { [Op.gt]: tick - yearsToTicks(AGE_OF_MAJORITY) } },
				{ guardianId: { [Op.ne]: null } },
				...(haus ? [{ HomeBuildingId: haus }] : [])
			]
		}
	});
	if (leute.length === 0) return bericht;

	const bekannteIds: string[] = leute
		.flatMap((person) => [
			person.dataValues.motherId,
			person.dataValues.fatherId,
			person.dataValues.guardianId
		])
		.filter((id): id is string => id !== null);
	const bekannte = new Map(
		(await Character.findAll({ where: { id: { [Op.in]: bekannteIds } } })).map((person) => [
			person.dataValues.id,
			person
		])
	);
	const lebt = (id: string | null): boolean =>
		id !== null && bekannte.get(id)?.dataValues.deathTick === null;

	let imHaus: number = leute.filter(
		(person) => haus !== undefined && person.dataValues.HomeBuildingId === haus
	).length;
	const waisen: Mensch[] = [];

	for (const person of leute) {
		const werte = person.dataValues;

		if (!isMinor(werte.birthTick, tick)) {
			const warImHaus: boolean = haus !== undefined && werte.HomeBuildingId === haus;
			await person.update({
				guardianId: null,
				HomeBuildingId: warImHaus ? null : werte.HomeBuildingId
			});
			if (warImHaus) imHaus--;
			bericht.grownUp.push(werte.id);
			continue;
		}

		if (haus !== undefined && werte.HomeBuildingId === haus) {
			waisen.push(person);
			continue;
		}

		if (lebt(werte.motherId) || lebt(werte.fatherId)) continue;

		if (lebt(werte.guardianId)) {
			const inNot: boolean = needService.satietyOf(werte, tick) < MUENDEL_IN_NOT_UNTER;
			if (!inNot || haus === undefined || imHaus >= WAISENHAUS_PLAETZE) continue;
			if ((await householdService.haushaltVon(werte, tick)).brot > 0) continue;
			if ((await needService.getStock(werte.id)).some((posten) => posten.nourishment)) continue;

			await insWaisenhaus(person, haus, regionId, tick);
			imHaus++;
			bericht.admitted.push(werte.id);
			waisen.push(person);
			continue;
		}

		const eltern: Mensch[] = [werte.motherId, werte.fatherId]
			.map((id) => (id ? bekannte.get(id) : undefined))
			.filter((elternteil): elternteil is Mensch => elternteil !== undefined);
		const vormundId: string | undefined = await vormundFuer(person, eltern, tick);
		const vormund = vormundId ? await Character.findByPk(vormundId) : null;
		if (vormund) {
			await nimmAuf(person, vormund, regionId, tick);
			bericht.fostered.push({ child: werte.id, guardian: vormund.dataValues.id });
			continue;
		}

		if (haus === undefined || imHaus >= WAISENHAUS_PLAETZE) {
			bericht.unplaced++;
			continue;
		}
		await insWaisenhaus(person, haus, regionId, tick);
		imHaus++;
		bericht.admitted.push(werte.id);
		waisen.push(person);
	}

	if (haus === undefined || waisen.length === 0) return bericht;

	// **Erst der Einkauf, dann die Mahlzeit:** Sonst bliebe das Kind eine Stunde hungrig,
	// obwohl am Markt Brot liegt.
	const lager: number =
		(await tradeService.getBuildingStock(haus)).find((zeile) => zeile.itemId === 'BREAD')
			?.quantity ?? 0;
	const fehlt: number = waisen.length * WAISEN_BROT_VORRAT - lager;
	if (fehlt > 0) {
		const einkauf = await tradeService.cityBuysFood(regionId, haus, 'BREAD', fehlt);
		bericht.bought = einkauf.bought;
		bericht.spent = einkauf.spent;
	}

	for (const waise of waisen) {
		if (needService.satietyOf(waise.dataValues, tick) >= WAISE_ISST_UNTER) continue;
		if (await speise(waise, haus, tick)) bericht.meals++;
		else bericht.unfed++;
	}
	return bericht;
}
