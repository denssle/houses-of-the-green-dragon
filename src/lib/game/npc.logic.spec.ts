import { describe, expect, it } from 'vitest';
import {
	decideNpcAction,
	desiredReserve,
	eatingThreshold,
	type NpcState,
	savingsTarget
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
		hasJob: false,
		betterJobAvailable: false,
		matchAvailable: true,
		foodPrice: 4,
		// Der Zufriedene hat alles: Er trägt ein Gewand und hat einen Trank in der Kammer,
		// damit die neuen Stufen aus 4.12 nicht ungewollt zuschlagen.
		wearsGarment: true,
		garmentInStock: 0,
		tonicInStock: 1,
		garmentPrice: 14,
		tonicPrice: 10,
		// Der Zufriedene unternimmt nichts: kein Grundstück, kein Anlass, keine Neigung.
		ownsWorkshop: false,
		hasFreePlot: false,
		hasLease: false,
		leaseAvailable: false,
		ownStockToSell: 0,
		canCraft: false,
		plotPrice: null,
		workshopPrice: null,
		workshopMaterialMissing: false,
		leaseFee: 20,
		// Der Zufriedene wohnt im Eigenen, hat Platz und alles instand.
		homeHasRoom: true,
		ownsHome: true,
		homePrice: 100,
		materialMissing: false,
		materialPrice: 20,
		repairNeeded: false,
		repairCost: 40,
		canOfferJob: false,
		// Es läuft keine Wahl — die neue Stufe aus 4.16 schlägt nicht zu.
		canVote: false,
		campaignProgress: 0,
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

		it('nimmt eine Stelle, die mehr bringt als die Tagelöhnerei', () => {
			expect(decideNpcAction(zufrieden({ betterJobAvailable: true }))).toBe('TAKE_JOB');
		});

		it('sieht sich nicht um, wer schon eine Stelle hat', () => {
			// Ein NPC, der jede Stunde den Arbeitgeber wechselt, wäre kein Handwerker.
			const angestellt = zufrieden({ hasJob: true, betterJobAvailable: true });

			expect(decideNpcAction(angestellt)).toBe('IDLE');
		});

		it('wirbt, wenn alles andere geregelt ist', () => {
			expect(decideNpcAction(zufrieden({ isMarried: false }))).toBe('COURT');
		});

		it('wirbt nicht als Kind', () => {
			expect(decideNpcAction(zufrieden({ isMarried: false, isAdult: false }))).toBe('IDLE');
		});

		it('tut nichts ohne Kraft', () => {
			const erschoepft = zufrieden({
				isMarried: false,
				money: 0,
				actionPoints: 0,
				tonicInStock: 0
			});

			expect(decideNpcAction(erschoepft)).toBe('IDLE');
		});

		it('trinkt, wenn die Kraft fehlt und Arbeit wartet', () => {
			const erschoepft = zufrieden({ actionPoints: 0, tonicInStock: 1, workAvailable: true });

			expect(decideNpcAction(erschoepft)).toBe('DRINK_TONIC');
		});

		it('trinkt nicht im Müßiggang', () => {
			// Der Trank füllt nur auf, was fehlt — ohne Arbeit wäre er verschenkt, und die
			// Punkte wachsen ohnehin von selbst nach.
			const müßig = zufrieden({
				actionPoints: 0,
				tonicInStock: 1,
				workAvailable: false,
				hasJob: false
			});

			expect(decideNpcAction(müßig)).toBe('IDLE');
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

	/**
	 * Der Sparwille (Punkt 55).
	 *
	 * Gemessen an der Seed-Welt: Nach zwei Spieljahren standen die acht Einwohner in 508
	 * von 800 Runden untätig herum — mit vollem Aktionsvorrat und zwanzig bis fünfzig
	 * Münzen in der Tasche. Sie hatten ihre Rücklage erreicht und keinen Grund mehr, zu
	 * arbeiten. Für ein Grundstück braucht es aber Rücklage **plus** Kaufpreis.
	 */
	describe('worauf einer spart', () => {
		/** Ein Unternehmungslustiger ohne Besitz — genau die Lage aus der Messung. */
		function gruender(werte: Partial<NpcState> = {}): NpcState {
			return zufrieden({
				personality: anlagen({ ambition: 40, diligence: 40 }),
				isMarried: false,
				ownsHome: false,
				money: 50,
				plotPrice: 40,
				workshopPrice: 180,
				...werte
			});
		}

		it('arbeitet über die Rücklage hinaus, wenn er etwas vorhat', () => {
			// Rücklage bei Gier 0 und Brot zu 4: neun Mahlzeiten, also 36 Münzen. Mit 50 in
			// der Tasche war er vorher fertig — jetzt fehlen ihm noch die 40 fürs Grundstück.
			expect(decideNpcAction(gruender())).toBe('WORK');
		});

		it('kauft, sobald das Ziel erreicht ist', () => {
			// **Verheiratet, denn ein Lediger wirbt.** Zugehörigkeit steht in der Hierarchie
			// vor der Entfaltung, und wer noch keinen Partner hat, kommt Tick für Tick nicht
			// weiter als bis dorthin. Das ist so gewollt — es heißt aber auch, dass ein
			// Lediger nie etwas aufbaut, solange er wirbt (siehe offene Punkte).
			const bereit = gruender({ money: 36 + 40, isMarried: true, ownsHome: true });

			expect(decideNpcAction(bereit)).toBe('BUY_PLOT');
		});

		it('spart auf den nächsten Schritt, nicht auf das ganze Vorhaben', () => {
			// Mit Grundstück steht die Werkstatt an — vorher nicht.
			expect(savingsTarget(gruender())).toBe(40);
			expect(savingsTarget(gruender({ hasFreePlot: true }))).toBe(180);
		});

		it('lässt den Genügsamen in Ruhe', () => {
			// Wer nichts vorhat, arbeitet wie bisher nur bis zur Rücklage. Sonst spart die
			// halbe Stadt auf eine Werkstatt, und niemand bliebe, der darin arbeitet.
			const ohne = gruender({ personality: anlagen({ ambition: -50, diligence: -50 }) });

			expect(savingsTarget(ohne)).toBeNull();
			expect(decideNpcAction(ohne)).toBe('COURT');
		});

		it('stellt das Dach der Familie vor das eigene Unternehmen', () => {
			const verheiratet = gruender({ isMarried: true, hasFreePlot: true });

			// Nicht 180 für die Werkstatt, sondern 100 fürs Wohnhaus.
			expect(savingsTarget(verheiratet)).toBe(100);
		});
	});
});
