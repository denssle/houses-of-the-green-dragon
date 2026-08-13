import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sequelize } from '$lib/db/sequelize';
import '$lib/db/db';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { DynastyRelationship } from '$lib/db/model/dynastyRelationship';
import { Relationship } from '$lib/db/model/relationship';
import { User } from '$lib/db/model/user';
import { findStartRegionId, seedWorld } from '$lib/db/seed';
import * as relationshipService from '$lib/server/service/relationshipService';
import { AFFECTION_HALF_LIFE_YEARS, kinshipBonus } from '$lib/game/relationship.logic';
import { yearsToTicks } from '$lib/game/time';

/**
 * Phase 4.3 gegen die Datenbank. Zwei Dinge stehen im Mittelpunkt: dass Lesen nichts
 * schreibt, und dass der Stammbaum die Verwandtschaft richtig ausrechnet.
 */

const JETZT = 10_000;
let stadtId: string;
let userId: string;

async function person(name: string, extras: Record<string, unknown> = {}): Promise<string> {
	const id = randomUUID();
	await Character.create({
		id,
		firstName: name,
		role: 'NPC',
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(30),
		lastTickProcessed: JETZT,
		RegionId: stadtId,
		...extras
	});
	return id;
}

async function haus(name: string): Promise<string> {
	const id = randomUUID();
	await Dynasty.create({ id, name, UserId: userId, foundedAtTick: 0 });
	return id;
}

describe('Beziehungen', () => {
	beforeAll(async () => {
		await sequelize.sync();
		await seedWorld();
		stadtId = await findStartRegionId();
		userId = randomUUID();
		await User.create({ id: userId, nickname: 'beziehung-test', password: 'egal' });
	});

	beforeEach(async () => {
		await Relationship.destroy({ where: {} });
		await DynastyRelationship.destroy({ where: {} });
		await Character.destroy({ where: {} });
		await Dynasty.destroy({ where: {} });
	});

	describe('ohne jede Zeile', () => {
		it('sind Fremde einander gleichgültig', async () => {
			const a = await person('Anna');
			const b = await person('Bertram');

			const stand = await relationshipService.getAffection(a, b, JETZT);

			expect(stand.affection).toBe(0);
			expect(stand.kinship).toBe('NONE');
		});

		it('mögen sich Verwandte trotzdem', async () => {
			const mutter = await person('Mutter');
			const kind = await person('Kind', { motherId: mutter });

			const stand = await relationshipService.getAffection(kind, mutter, JETZT);

			expect(stand.kinship).toBe('PARENT');
			expect(stand.affection).toBe(kinshipBonus('PARENT'));
			// Und ohne dass dafür eine Zeile entstünde.
			expect(await Relationship.count()).toBe(0);
		});
	});

	describe('der Stammbaum', () => {
		it('erkennt Eltern und Kinder in beide Richtungen', async () => {
			const vater = await person('Vater');
			const kind = await person('Kind', { fatherId: vater });

			expect(await relationshipService.kinshipBetween(kind, vater)).toBe('PARENT');
			expect(await relationshipService.kinshipBetween(vater, kind)).toBe('CHILD');
		});

		it('erkennt Geschwister an einem gemeinsamen Elternteil', async () => {
			const mutter = await person('Mutter');
			const a = await person('Anna', { motherId: mutter });
			const b = await person('Bertram', { motherId: mutter });

			expect(await relationshipService.kinshipBetween(a, b)).toBe('SIBLING');
		});

		it('macht Elternlose nicht zu Geschwistern', async () => {
			// Beide haben `null` als Mutter — das darf kein gemeinsamer Elternteil sein.
			const a = await person('Anna');
			const b = await person('Bertram');

			expect(await relationshipService.kinshipBetween(a, b)).toBe('NONE');
		});

		it('erkennt Großeltern über zwei Stufen', async () => {
			const oma = await person('Oma');
			const mutter = await person('Mutter', { motherId: oma });
			const enkel = await person('Enkel', { motherId: mutter });

			expect(await relationshipService.kinshipBetween(enkel, oma)).toBe('GRANDCHILD');
			expect(await relationshipService.kinshipBetween(oma, enkel)).toBe('GRANDPARENT');
		});

		it('lässt Vettern Fremde sein', async () => {
			// Persönliche Beziehungen werden nicht vererbt: Vettern lernen sich kennen
			// wie alle anderen auch.
			const oma = await person('Oma');
			const einElternteil = await person('Eins', { motherId: oma });
			const andererElternteil = await person('Zwei', { motherId: oma });
			const vetterA = await person('VetterA', { motherId: einElternteil });
			const vetterB = await person('VetterB', { motherId: andererElternteil });

			expect(await relationshipService.kinshipBetween(vetterA, vetterB)).toBe('NONE');
		});

		it('kennt die Ehe', async () => {
			const a = await person('Anna');
			const b = await person('Bertram', {});
			await Character.update({ spouseId: b }, { where: { id: a } });

			expect(await relationshipService.kinshipBetween(a, b)).toBe('SPOUSE');
		});
	});

	describe('eine Interaktion', () => {
		it('legt eine Zeile an und verschiebt die Zuneigung', async () => {
			const a = await person('Anna');
			const b = await person('Bertram');

			await relationshipService.changeAffection(a, b, 20, JETZT);

			expect((await relationshipService.getAffection(a, b, JETZT)).affection).toBe(20);
			expect(await Relationship.count()).toBe(1);
		});

		it('wirkt nur in eine Richtung', async () => {
			const a = await person('Anna');
			const b = await person('Bertram');

			await relationshipService.changeAffection(a, b, 20, JETZT);

			expect((await relationshipService.getAffection(b, a, JETZT)).affection).toBe(0);
		});

		it('räumt die Zeile weg, wenn sie nichts mehr aussagt', async () => {
			const a = await person('Anna');
			const b = await person('Bertram');
			await relationshipService.changeAffection(a, b, 20, JETZT);

			await relationshipService.changeAffection(a, b, -20, JETZT);

			expect(await Relationship.count()).toBe(0);
			expect((await relationshipService.getAffection(a, b, JETZT)).affection).toBe(0);
		});
	});

	describe('der Verfall', () => {
		it('klingt über die Zeit ab', async () => {
			const a = await person('Anna');
			const b = await person('Bertram');
			await relationshipService.changeAffection(a, b, 80, JETZT);

			const spaeter: number = JETZT + yearsToTicks(AFFECTION_HALF_LIFE_YEARS);

			expect((await relationshipService.getAffection(a, b, spaeter)).affection).toBe(40);
		});

		/**
		 * Der Kern: Wer oft nachsieht, darf nichts anderes vorfinden. Deshalb darf das
		 * Lesen die Zeile nicht anfassen.
		 */
		it('ändert beim Lesen nichts an der Zeile', async () => {
			const a = await person('Anna');
			const b = await person('Bertram');
			await relationshipService.changeAffection(a, b, 80, JETZT);

			const spaeter: number = JETZT + yearsToTicks(20);
			for (let i = 0; i < 5; i++) {
				await relationshipService.getAffection(a, b, spaeter);
			}

			const zeile = await Relationship.findOne({
				where: { fromCharacterId: a, toCharacterId: b }
			});
			expect(zeile!.dataValues.affection).toBe(80);
			expect(zeile!.dataValues.lastChangedTick).toBe(JETZT);
		});
	});

	describe('die Häuser', () => {
		it('färbt ein Zerwürfnis auf das Verhältnis der Häuser ab', async () => {
			const hausA = await haus('Haus Adler');
			const hausB = await haus('Haus Bär');
			const a = await person('Anna', { DynastyId: hausA });
			const b = await person('Bertram', { DynastyId: hausB });

			await relationshipService.changeAffection(a, b, -50, JETZT);

			expect(await relationshipService.getStanding(hausA, hausB, JETZT)).toBe(-5);
		});

		it('lässt Höflichkeiten die Außenpolitik in Ruhe', async () => {
			const hausA = await haus('Haus Adler');
			const hausB = await haus('Haus Bär');
			const a = await person('Anna', { DynastyId: hausA });
			const b = await person('Bertram', { DynastyId: hausB });

			await relationshipService.changeAffection(a, b, 3, JETZT);

			expect(await DynastyRelationship.count()).toBe(0);
		});

		it('lässt ein Haus keine Fehde mit sich selbst führen', async () => {
			const eines = await haus('Haus Adler');
			const a = await person('Anna', { DynastyId: eines });
			const b = await person('Bertram', { DynastyId: eines });

			await relationshipService.changeAffection(a, b, -50, JETZT);

			expect(await DynastyRelationship.count()).toBe(0);
			expect(await relationshipService.getStanding(eines, eines, JETZT)).toBe(0);
		});

		it('wirkt eine erklärte Fehde sofort auf alle Mitglieder', async () => {
			const hausA = await haus('Haus Adler');
			const hausB = await haus('Haus Bär');
			const a = await person('Anna', { DynastyId: hausA });
			const b = await person('Bertram', { DynastyId: hausB });

			await relationshipService.declareStanding(hausA, hausB, -100, JETZT);

			// Ohne dass eine einzige Beziehungszeile angefasst wurde.
			expect(await Relationship.count()).toBe(0);
			expect((await relationshipService.getAffection(a, b, JETZT)).affection).toBe(-50);
		});

		it('lässt die persönliche Schicht die Fehde überstimmen', async () => {
			const hausA = await haus('Haus Montague');
			const hausB = await haus('Haus Capulet');
			const romeo = await person('Romeo', { DynastyId: hausA });
			const julia = await person('Julia', { DynastyId: hausB });
			await relationshipService.declareStanding(hausA, hausB, -100, JETZT);

			// Ohne Zutun bestimmt die Fehde alles: -100 mit halbem Gewicht.
			expect((await relationshipService.getAffection(romeo, julia, JETZT)).affection).toBe(-50);

			await relationshipService.changeAffection(romeo, julia, 90, JETZT);

			// Freundschaft trotz Fehde — ein Kampf gegen den Strom, aber möglich.
			expect(
				(await relationshipService.getAffection(romeo, julia, JETZT)).affection
			).toBeGreaterThan(40);
		});

		it('mildert die Fehde, wenn zwei Mitglieder sich nahekommen', async () => {
			// Die natürliche Hälfte wirkt in beide Richtungen: Nicht nur Zerwürfnisse
			// schlagen auf die Häuser durch, sondern auch das Gegenteil. Wo genug Leute
			// über die Grenze hinweg befreundet sind, hört eine Fehde von selbst auf.
			const hausA = await haus('Haus Montague');
			const hausB = await haus('Haus Capulet');
			const romeo = await person('Romeo', { DynastyId: hausA });
			const julia = await person('Julia', { DynastyId: hausB });
			await relationshipService.declareStanding(hausA, hausB, -100, JETZT);

			await relationshipService.changeAffection(romeo, julia, 90, JETZT);

			// 10 % von 90 sind 9 Punkte, um die sich die Häuser annähern.
			expect(await relationshipService.getStanding(hausA, hausB, JETZT)).toBe(-91);
		});
	});
});
