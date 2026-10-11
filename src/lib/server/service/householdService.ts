import { Op } from 'sequelize';
import { Character } from '$lib/db/model/character';
import { Inventory } from '$lib/db/model/inventory';
import { AGE_OF_MAJORITY, isOfWorkingAge, yearsToTicks } from '$lib/game/time';

/**
 * Der Haushalt eines Kindes — wer es versorgt, und ob es selbst arbeiten darf (0.6.0,
 * Punkt 84).
 *
 * **Ein eigenes Modul, weil zwei Seiten dieselbe Antwort brauchen**: die Entscheidung
 * (`npcService`: Hat es Arbeit in Aussicht?) und die Ausführung (Lohnarbeit, Vermessung,
 * Ernte, Herstellung: Darf es?). Laufen die beiden auseinander, wählt ein Kind Arbeit, die
 * der Dienst ablehnt — derselbe Fehler wie in den Punkten 59, 63, 87 und 97. Es hängt nur an
 * den Modellen, damit jeder Dienst es nutzen kann, ohne einen anderen zu importieren.
 */

export interface Haushalt {
	/** Wer es versorgt: zuerst die lebenden Eltern, dann die Erwachsenen im selben Haus. */
	leute: string[];
	/** Bei wem Brot in der Kammer liegt — der Erste in der Reihe. */
	brotBei?: string;
	/** Wie viel Brot im Haushalt insgesamt liegt. */
	brot: number;
}

/**
 * Wer ein Kind versorgt — **zuerst die lebenden Eltern, dann die Erwachsenen im selben
 * Haus**, ein älteres Geschwister, ein Großelternteil. `leute` leer heißt: Niemand ist da.
 */
export async function haushaltVon(
	kind: {
		id: string;
		motherId: string | null;
		fatherId: string | null;
		HomeBuildingId: string | null;
	},
	tick: number
): Promise<Haushalt> {
	const eltern: string[] = [kind.motherId, kind.fatherId].filter((id): id is string => id !== null);
	const wer = [];
	if (eltern.length > 0) wer.push({ id: { [Op.in]: eltern } });
	if (kind.HomeBuildingId) {
		wer.push({
			HomeBuildingId: kind.HomeBuildingId,
			birthTick: { [Op.lte]: tick - yearsToTicks(AGE_OF_MAJORITY) }
		});
	}
	if (wer.length === 0) return { leute: [], brot: 0 };

	const gefunden = await Character.findAll({
		where: { deathTick: null, id: { [Op.ne]: kind.id }, [Op.or]: wer },
		attributes: ['id']
	});
	const leute: string[] = gefunden
		.map((person) => person.dataValues.id)
		.sort((a, b) => Number(eltern.includes(b)) - Number(eltern.includes(a)));
	if (leute.length === 0) return { leute, brot: 0 };

	const kammern = await Inventory.findAll({
		where: { CharacterId: { [Op.in]: leute }, itemId: 'BREAD' }
	});
	const brotJe = new Map(
		kammern.map((zeile) => [zeile.dataValues.CharacterId, zeile.dataValues.quantity])
	);
	return {
		leute,
		brotBei: leute.find((id) => (brotJe.get(id) ?? 0) > 0),
		brot: leute.reduce((summe, id) => summe + (brotJe.get(id) ?? 0), 0)
	};
}

/**
 * **Darf er arbeiten?** Ab zwölf jeder. Darunter nur, wer keinen Haushalt hat, der ihn
 * versorgt — sonst verhungerte eine Waise allein im Haus zwangsläufig, und das wäre eine
 * Härte ohne Ausweg.
 */
export async function darfArbeiten(
	person: {
		id: string;
		birthTick: number;
		motherId: string | null;
		fatherId: string | null;
		HomeBuildingId: string | null;
	},
	tick: number
): Promise<boolean> {
	if (isOfWorkingAge(person.birthTick, tick)) return true;
	return (await haushaltVon(person, tick)).leute.length === 0;
}
