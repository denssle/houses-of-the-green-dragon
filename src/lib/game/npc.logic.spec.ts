import { describe, expect, it } from 'vitest';
import {
	decideNpcAction,
	desiredReserve,
	eatingThreshold,
	type NpcState
} from '$lib/game/npc.logic';
import { PERSONALITY_AXES, type Personality } from '$lib/game/personality.logic';
import { SATIETY_MAX, SATIETY_WEAKENED } from '$lib/game/need.logic';

function anlagen(werte: Partial<Personality> = {}): Personality {
	const voll = {} as Personality;
	for (const achse of PERSONALITY_AXES) voll[achse] = 0;
	return { ...voll, ...werte };
}

/** Ein satter, wohnender, verheirateter NPC mit Geld — der tut von sich aus nichts. */
function zufrieden(werte: Partial<NpcState> = {}): NpcState {
	return {
		personality: anlagen(),
		actionPoints: 10,
		money: 1000,
		satiety: SATIETY_MAX,
		food: 5,
		hasHome: true,
		homeAvailable: true,
		isMarried: true,
		isAdult: true,
		workAvailable: true,
		matchAvailable: true,
		foodPrice: 4,
		...werte
	};
}

describe('Was ein NPC tut', () => {
	describe('die Rangfolge', () => {
		it('lässt den Zufriedenen in Ruhe', () => {
			expect(decideNpcAction(zufrieden())).toBe('IDLE');
		});

		it('isst zuerst', () => {
			expect(decideNpcAction(zufrieden({ satiety: 20 }))).toBe('EAT');
		});

		it('kauft, wenn die Kammer leer ist', () => {
			expect(decideNpcAction(zufrieden({ satiety: 20, food: 0 }))).toBe('BUY_FOOD');
		});

		it('arbeitet, wenn auch das Geld fehlt', () => {
			expect(decideNpcAction(zufrieden({ satiety: 20, food: 0, money: 0 }))).toBe('WORK');
		});

		/**
		 * Der Kern der Staffelung: Faulheit ist eine Eigenart, kein Todesurteil. Auch der
		 * Trägste rührt sich, wenn es ums Überleben geht.
		 */
		it('lässt auch den Trägsten für sein Essen arbeiten', () => {
			const traege = zufrieden({
				personality: anlagen({ diligence: -100 }),
				satiety: 20,
				food: 0,
				money: 0
			});

			expect(decideNpcAction(traege)).toBe('WORK');
		});

		it('sucht ein Dach, sobald der Hunger gestillt ist', () => {
			expect(decideNpcAction(zufrieden({ hasHome: false }))).toBe('MOVE_IN');
		});

		it('wirbt, wenn alles andere geregelt ist', () => {
			expect(decideNpcAction(zufrieden({ isMarried: false }))).toBe('COURT');
		});

		it('wirbt nicht als Kind', () => {
			expect(decideNpcAction(zufrieden({ isMarried: false, isAdult: false }))).toBe('IDLE');
		});

		it('tut nichts ohne Kraft', () => {
			const erschoepft = zufrieden({ isMarried: false, money: 0, actionPoints: 0 });

			expect(decideNpcAction(erschoepft)).toBe('IDLE');
		});
	});

	describe('was die Persönlichkeit ändert', () => {
		it('lässt den Fleißigen früher ans Essen denken', () => {
			const fleissig: number = eatingThreshold(anlagen({ diligence: 100 }));
			const traege: number = eatingThreshold(anlagen({ diligence: -100 }));

			expect(fleissig).toBeGreaterThan(traege);
			// Auch der Trägste rührt sich, bevor die Not weh tut.
			expect(traege).toBeGreaterThanOrEqual(SATIETY_WEAKENED);
		});

		it('lässt den Gierigen länger arbeiten', () => {
			// Fünfzig Münzen: dem Genügsamen reicht das längst, dem Gierigen nicht.
			const gierig = zufrieden({ personality: anlagen({ greed: 100 }), money: 50 });
			const genuegsam = zufrieden({ personality: anlagen({ greed: -100 }), money: 50 });

			expect(decideNpcAction(gierig)).toBe('WORK');
			expect(decideNpcAction(genuegsam)).toBe('IDLE');
		});

		it('rechnet die Rücklage in Mahlzeiten, nicht in Münzen', () => {
			// Sonst hinge die Zahl an den Preisen und ginge beim ersten Balancing daneben.
			const anlage = anlagen({ greed: 0 });

			expect(desiredReserve(anlage, 8)).toBe(desiredReserve(anlage, 4) * 2);
		});

		it('lässt selbst den Eigenbrötler irgendwann werben', () => {
			// Sonst stürbe seine Linie an seinem Wesen — und Zurückhaltung wäre keine
			// Eigenart mehr, sondern das Ende des Hauses.
			const zurueckhaltend = zufrieden({
				personality: anlagen({ sociability: -70 }),
				isMarried: false
			});

			expect(decideNpcAction(zurueckhaltend)).toBe('COURT');
		});
	});
});
