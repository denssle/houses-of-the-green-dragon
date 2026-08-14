import { describe, expect, it } from 'vitest';
import {
	assignDynasty,
	canMarry,
	type Candidate,
	conceives,
	CONCEPTION_CHANCE_PER_TICK,
	court,
	COURT_ACTION_POINT_COST,
	FERTILE_TO_AGE,
	isDue,
	MARRIAGE_MIN_AFFECTION,
	type Mother,
	PREGNANCY_TICKS
} from '$lib/game/family.logic';
import { AGE_OF_MAJORITY, TICKS_PER_YEAR, yearsToTicks } from '$lib/game/time';

const JETZT = 10_000;

function person(id: string, alter: number, extra: Partial<Candidate> = {}): Candidate {
	return {
		id,
		gender: 'FEMALE',
		birthTick: JETZT - yearsToTicks(alter),
		spouseId: null,
		...extra
	};
}

/** Eine Frau, bei der alles für eine Empfängnis stimmt. */
function mutter(extra: Partial<Mother> = {}): Mother {
	return {
		birthTick: JETZT - yearsToTicks(25),
		spouseId: 'mann',
		pregnantSinceTick: null,
		freeHomeSpace: 2,
		...extra
	};
}

describe('Familie', () => {
	describe('heiraten', () => {
		const sie = person('sie', 25);
		const er = person('er', 27, { gender: 'MALE' });

		it('geht bei zwei Erwachsenen mit genug Zuneigung', () => {
			expect(canMarry(sie, er, 'NONE', MARRIAGE_MIN_AFFECTION, JETZT)).toEqual({ ok: true });
		});

		it('scheitert an zu wenig Zuneigung', () => {
			const ergebnis = canMarry(sie, er, 'NONE', MARRIAGE_MIN_AFFECTION - 1, JETZT);

			expect(ergebnis).toEqual({ ok: false, reason: 'TOO_LITTLE_AFFECTION' });
		});

		it('schließt Verwandte aus', () => {
			for (const grad of ['SIBLING', 'PARENT', 'CHILD', 'GRANDPARENT', 'GRANDCHILD'] as const) {
				expect(canMarry(sie, er, grad, 100, JETZT)).toEqual({ ok: false, reason: 'CLOSE_KIN' });
			}
		});

		it('nennt die Verwandtschaft vor allem anderen', () => {
			// Auch wenn zusätzlich die Zuneigung fehlte: Daran zu arbeiten wäre vergebens.
			const bruder = person('bruder', 12, { gender: 'MALE' });

			expect(canMarry(sie, bruder, 'SIBLING', 0, JETZT)).toEqual({
				ok: false,
				reason: 'CLOSE_KIN'
			});
		});

		it('schließt Minderjährige aus', () => {
			const kind = person('kind', AGE_OF_MAJORITY - 1, { gender: 'MALE' });

			expect(canMarry(sie, kind, 'NONE', 100, JETZT)).toEqual({
				ok: false,
				reason: 'TOO_YOUNG'
			});
		});

		it('schließt bereits Verheiratete aus', () => {
			const vergeben = person('vergeben', 30, { gender: 'MALE', spouseId: 'wer-auch-immer' });

			expect(canMarry(sie, vergeben, 'NONE', 100, JETZT)).toEqual({
				ok: false,
				reason: 'ALREADY_MARRIED'
			});
		});

		it('lässt Vettern heiraten', () => {
			// Der Stammbaum reicht nur bis zu den Großeltern; weiter entfernte Verwandte
			// sind einander mechanisch Fremde.
			expect(canMarry(sie, er, 'NONE', 100, JETZT)).toEqual({ ok: true });
		});
	});

	describe('werben', () => {
		it('kostet Punkte und bringt Zuneigung', () => {
			const ergebnis = court({ actionPoints: 10, regionId: 'stadt' }, { regionId: 'stadt' });

			expect(ergebnis).toMatchObject({ ok: true, actionPoints: 10 - COURT_ACTION_POINT_COST });
		});

		it('geht nicht über die Ferne', () => {
			const ergebnis = court({ actionPoints: 10, regionId: 'stadt' }, { regionId: 'wald' });

			expect(ergebnis).toEqual({ ok: false, reason: 'WRONG_REGION' });
		});

		it('scheitert ohne Kraft', () => {
			const ergebnis = court({ actionPoints: 1, regionId: 'stadt' }, { regionId: 'stadt' });

			expect(ergebnis).toEqual({ ok: false, reason: 'NOT_ENOUGH_ACTION_POINTS' });
		});
	});

	describe('empfangen', () => {
		const sicher = 0;
		const niemals = 0.999999;

		it('geschieht bei passenden Umständen', () => {
			expect(conceives(mutter(), JETZT, sicher)).toBe(true);
		});

		it('bleibt aus, solange der Würfel es will', () => {
			expect(conceives(mutter(), JETZT, niemals)).toBe(false);
		});

		it('setzt eine Ehe voraus', () => {
			expect(conceives(mutter({ spouseId: null }), JETZT, sicher)).toBe(false);
		});

		it('geschieht nicht zweimal zugleich', () => {
			expect(conceives(mutter({ pregnantSinceTick: JETZT - 5 }), JETZT, sicher)).toBe(false);
		});

		it('achtet das fruchtbare Fenster', () => {
			const zuJung = mutter({ birthTick: JETZT - yearsToTicks(AGE_OF_MAJORITY - 1) });
			const zuAlt = mutter({ birthTick: JETZT - yearsToTicks(FERTILE_TO_AGE + 1) });

			expect(conceives(zuJung, JETZT, sicher)).toBe(false);
			expect(conceives(zuAlt, JETZT, sicher)).toBe(false);
		});

		/** Die Rückkopplung, die die Bevölkerung im Gleichgewicht hält. */
		it('braucht Platz im Haus', () => {
			expect(conceives(mutter({ freeHomeSpace: 0 }), JETZT, sicher)).toBe(false);
		});

		it('bleibt Obdachlosen versagt', () => {
			expect(conceives(mutter({ freeHomeSpace: null }), JETZT, sicher)).toBe(false);
		});

		/**
		 * Kein Test einer Formel, sondern der Balancing-Nachweis: Über ein fruchtbares
		 * Leben sollen ungefähr vier Kinder herauskommen — genug für einen Erben und
		 * einen Überschuss, der die Bevölkerung trägt.
		 */
		it('ergibt über ein Leben eine tragfähige Kinderzahl', () => {
			const fruchtbareJahre: number = FERTILE_TO_AGE - AGE_OF_MAJORITY;
			const fruchtbareTicks: number = fruchtbareJahre * TICKS_PER_YEAR;

			// Jede Schwangerschaft belegt Ticks, in denen nicht empfangen werden kann.
			// Näherung über den Erwartungswert: k Kinder belegen k * PREGNANCY_TICKS.
			const kinder: number =
				(fruchtbareTicks * CONCEPTION_CHANCE_PER_TICK) /
				(1 + PREGNANCY_TICKS * CONCEPTION_CHANCE_PER_TICK);

			expect(kinder).toBeGreaterThan(2.5);
			expect(kinder).toBeLessThan(5);
		});
	});

	describe('austragen', () => {
		it('dauert seine Zeit', () => {
			expect(isDue(JETZT, JETZT + PREGNANCY_TICKS - 1)).toBe(false);
			expect(isDue(JETZT, JETZT + PREGNANCY_TICKS)).toBe(true);
		});
	});

	describe('welchem Haus ein Kind zufällt', () => {
		const gespielt = (id: string | null) => ({ dynastyId: id, played: true });
		const npc = (id: string | null) => ({ dynastyId: id, played: false });

		it('folgt dem einzigen Haus, wenn nur einer eines hat', () => {
			expect(assignDynasty(gespielt('haus-a'), npc(null), 0)).toBe('haus-a');
			expect(assignDynasty(npc(null), gespielt('haus-b'), 0.99)).toBe('haus-b');
		});

		it('bleibt beim gemeinsamen Haus', () => {
			expect(assignDynasty(gespielt('haus-a'), npc('haus-a'), 0.99)).toBe('haus-a');
		});

		/**
		 * Kein Geschlecht „heiratet hinein" und gibt sein Haus auf: Beide Spieler haben
		 * dieselbe Aussicht auf einen Erben.
		 */
		it('wirft zwischen zwei Spielerhäusern eine Münze — je Kind', () => {
			expect(assignDynasty(gespielt('haus-a'), gespielt('haus-b'), 0.2)).toBe('haus-a');
			expect(assignDynasty(gespielt('haus-a'), gespielt('haus-b'), 0.8)).toBe('haus-b');
		});

		/**
		 * Seit 5.10 hat auch jeder NPC ein Haus. Ohne diese Regel halbierte eine Ehe mit
		 * einem NPC die Erbenaussicht — für etwas, das der Spieler nicht in der Hand hat.
		 */
		it('gibt das Kind an das gespielte Haus, wenn der Partner ein NPC ist', () => {
			expect(assignDynasty(gespielt('haus-a'), npc('haus-b'), 0.99)).toBe('haus-a');
			expect(assignDynasty(npc('haus-b'), gespielt('haus-a'), 0.01)).toBe('haus-a');
		});

		it('würfelt unter NPCs weiter — dort ist keiner bevorzugt', () => {
			expect(assignDynasty(npc('haus-a'), npc('haus-b'), 0.2)).toBe('haus-a');
			expect(assignDynasty(npc('haus-a'), npc('haus-b'), 0.8)).toBe('haus-b');
		});

		// Kommt seit 5.10 nicht mehr vor; die Absicherung bleibt, damit ein fehlender
		// Hauseintrag kein Kind ohne Namen erzeugt.
		it('lässt Kinder ohne Haus als Fremde aufwachsen', () => {
			expect(assignDynasty(npc(null), npc(null), 0.5)).toBeNull();
		});
	});
});
