import { Op } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import {
	ALMOSEN_UNTER,
	almsBudget,
	armengeld,
	needsAlms,
	UNTERKUNFT_OPTION_ID
} from '$lib/game/alms.logic';
import { isMinor, WAISENHAUS_OPTION_ID } from '$lib/game/guardianship.logic';
import { eat } from '$lib/game/need.logic';
import { getItemTemplate } from '$lib/model/itemTemplate';
import * as householdService from '$lib/server/service/householdService';
import * as needService from '$lib/server/service/needService';
import * as tradeService from '$lib/server/service/tradeService';
import * as treasuryService from '$lib/server/service/treasuryService';
import { stadtRuecklage } from '$lib/server/service/mayorService';

/**
 * Die Armenspeisung (0.11.0, Punkt 122) — siehe `alms.logic.ts`.
 *
 * Läuft im Takt nach dem Waisenhaus: Waisen sind dort versorgt und kommen hier nicht vor.
 */

export interface AlmsReport {
	/** Wer gespeist wurde. */
	meals: number;
	/** Wer es gebraucht hätte und leer ausging — weil die Kasse nichts mehr hergab. */
	unfed: number;
	/** Was die Stadt für Brot ausgab, an die Verkäufer. */
	spent: number;
	/** Wer Armengeld bekam, weil am Markt kein Brot lag. */
	relieved: number;
	/** Wie viel Armengeld ausgezahlt wurde. */
	paid: number;
}

async function unterkunftVon(regionId: string) {
	return Building.findOne({
		where: { optionId: UNTERKUNFT_OPTION_ID, ownerType: 'CITY' },
		include: [{ model: Plot, as: 'plot', where: { RegionId: regionId }, required: true }]
	});
}

async function waisenhausId(regionId: string): Promise<string | null> {
	const haus = await Building.findOne({
		where: { optionId: WAISENHAUS_OPTION_ID },
		include: [{ model: Plot, as: 'plot', where: { RegionId: regionId }, required: true }],
		attributes: ['id']
	});
	return haus?.dataValues.id ?? null;
}

export async function feedThePoor(regionId: string, tick: number): Promise<AlmsReport> {
	const bericht: AlmsReport = { meals: 0, unfed: 0, spent: 0, relieved: 0, paid: 0 };

	// **Zuerst nur nach dem Hunger** (Punkt 67): Er steht an der Zeile und kostet keine
	// Abfrage. Vorrat, Haushalt und Geld schlägt nur nach, wer ohnehin geschwächt ist.
	const waisenhaus: string | null = await waisenhausId(regionId);
	const hungrig = (
		await Character.findAll({
			where: {
				deathTick: null,
				RegionId: regionId,
				// Waisen versorgt das Waisenhaus.
				...(waisenhaus
					? { [Op.or]: [{ HomeBuildingId: null }, { HomeBuildingId: { [Op.ne]: waisenhaus } }] }
					: {})
			}
		})
	).filter((person) => needService.satietyOf(person.dataValues, tick) < ALMOSEN_UNTER);
	if (hungrig.length === 0) return bericht;

	// Ohne Angebot gilt der Grundpreis: Danach bemisst sich, ob sich jemand selbst helfen
	// kann, und wie viel Armengeld es gibt.
	const angebot = await tradeService.cheapestOffer(regionId, 'BREAD');
	const brotpreis: number = angebot?.pricePerUnit ?? getItemTemplate('BREAD')?.basePrice ?? 4;

	const beduerftig: typeof hungrig = [];
	/** Wer das Armengeld in die Hand bekommt — bei einem Kind der, der es versorgt. */
	const empfaenger = new Map<string, string | null>();
	for (const person of hungrig) {
		const werte = person.dataValues;
		const eigenes: boolean = (await needService.getStock(werte.id)).some(
			(posten) => (posten.nourishment ?? 0) > 0 && posten.quantity > 0
		);
		// Ein Kind isst aus dem Haushalt, und es hat so viel Geld wie der, der es versorgt.
		let haushaltBrot = 0;
		let geld: number = werte.money;
		empfaenger.set(werte.id, werte.id);
		if (isMinor(werte.birthTick, tick)) {
			const haushalt = await householdService.haushaltVon(werte, tick);
			haushaltBrot = haushalt.brot;
			// Ein Kind kauft nicht selbst ein; Münzen in seiner Tasche ließen es hungern und
			// zugleich als versorgt gelten.
			empfaenger.set(werte.id, haushalt.leute[0] ?? null);
			for (const id of haushalt.leute) {
				const versorger = await Character.findByPk(id, { attributes: ['money'] });
				geld = Math.max(geld, versorger?.dataValues.money ?? 0);
			}
		}
		const lage = {
			satiety: needService.satietyOf(werte, tick),
			hatEssen: eigenes || haushaltBrot > 0,
			geld
		};
		if (needsAlms(lage, brotpreis)) beduerftig.push(person);
	}
	if (beduerftig.length === 0) return bericht;

	const unterkunft = await unterkunftVon(regionId);
	const stadt = await Region.findByPk(regionId, { attributes: ['treasury'] });
	if (!unterkunft || !stadt) {
		bericht.unfed = beduerftig.length;
		return bericht;
	}
	const haus: string = unterkunft.dataValues.id;

	// Die Hungrigsten zuerst — reicht das Geld nicht für alle, trifft es nicht den Zufall.
	beduerftig.sort(
		(a, b) => needService.satietyOf(a.dataValues, tick) - needService.satietyOf(b.dataValues, tick)
	);

	const lager: number =
		(await tradeService.getBuildingStock(haus)).find((zeile) => zeile.itemId === 'BREAD')
			?.quantity ?? 0;
	const fehlt: number = beduerftig.length - lager;
	let budget: number = almsBudget(stadt.dataValues.treasury ?? 0, stadtRuecklage());
	if (fehlt > 0) {
		const einkauf = await tradeService.cityBuysFood(regionId, haus, 'BREAD', fehlt, 'ALMS', budget);
		bericht.spent = einkauf.spent;
		budget -= einkauf.spent;
	}

	const naehrwert: number = getItemTemplate('BREAD')?.nourishment ?? 0;
	for (const person of beduerftig) {
		const gespeist: boolean = await sequelize.transaction(async (t) => {
			if (!(await tradeService.changeBuildingStock(haus, 'BREAD', -1, t))) return false;
			const stand: number = needService.satietyOf(person.dataValues, tick);
			await person.update(
				{ satiety: Math.round(eat(stand, naehrwert)), lastNeedTick: tick },
				{ transaction: t }
			);
			return true;
		});
		if (gespeist) {
			bericht.meals++;
			continue;
		}

		// **Armengeld, wenn am Markt kein Brot liegt** (0.11.0). Im Nachbau ging die
		// Speisung über tausendmal leer aus, obwohl die Kasse zweitausend Münzen hielt — es
		// gab nichts zu kaufen, weil Bäckern und Müllern das Geld für Lohn und Mehl fehlte.
		// Münzen in der Hand der Hungernden sind zahlende Kundschaft: Das bringt die Kette
		// wieder in Gang, die Brot allein nicht anstoßen kann. Wer danach genug für einen
		// Laib hat, gilt nicht mehr als bedürftig — das Armengeld begrenzt sich selbst.
		const betrag: number = armengeld(brotpreis);
		const an: string | null = empfaenger.get(person.dataValues.id) ?? null;
		if (betrag > budget || an === null) {
			bericht.unfed++;
			continue;
		}
		await sequelize.transaction(async (t) => {
			await treasuryService.ausgeben(regionId, betrag, 'ALMS', t);
			await Character.increment('money', { by: betrag, where: { id: an }, transaction: t });
		});
		budget -= betrag;
		bericht.relieved++;
		bericht.paid += betrag;
	}
	return bericht;
}
