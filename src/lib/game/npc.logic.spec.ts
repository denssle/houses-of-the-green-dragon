import { describe, expect, it } from 'vitest';
import {
	decideNpcAction,
	desiredReserve,
	eatingThreshold,
	type NpcState,
	idleReason,
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
		// Der Zufriedene hat alles: Er trägt ein Gewand und hat einen Trank im Inventar,
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
		inputPrice: null,
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
		// Sein Haus ist nicht voll und seine Werkstatt gibt es nicht — der Ausbau aus 5.29
		// schlägt bei ihm nicht zu.
		homeUpgradePrice: 150,
		workshopUpgradePrice: null,
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

		it('kauft, wenn das Inventar leer ist', () => {
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

		it('wirbt nur, wer die Punkte dafür ganz hat', () => {
			// **Werben kostet zwei Punkte**, geprüft wurde auf mehr als null. Wer genau einen
			// übrig hatte, wählte also das Werben und scheiterte daran — im ersten Messlauf
			// mit Fehlschlagzählung 19 von 36 Versuchen. In der Statistik stand `COURT`, als
			// wäre geworben worden; gesehen hat es deshalb nie jemand.
			// Ohne Trank im Inventar, sonst greift bei so wenig Punkten die Erholung aus
			// der Sicherheitsstufe — richtig so, aber hier nicht die Frage.
			const knapp = zufrieden({ isMarried: false, actionPoints: 1, tonicInStock: 0 });
			const gerade = zufrieden({ isMarried: false, actionPoints: 2, tonicInStock: 0 });

			expect(decideNpcAction(knapp)).not.toBe('COURT');
			expect(decideNpcAction(gerade)).toBe('COURT');
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

		it('richtet nur her, wer die Punkte dafür ganz hat', () => {
			// **Herrichten kostet vier Punkte**, geprüft wurde auf mehr als null — derselbe
			// Fehler wie beim Werben, nur folgenschwerer: Ein NPC arbeitet bei jedem einzelnen
			// Punkt, solange er unter seinem Sparziel liegt, und kommt deshalb kaum je über
			// einen hinaus. In der Statistik stand `RENOVATE`, in der Welt verfiel das Haus.
			const knapp = zufrieden({ repairNeeded: true, actionPoints: 3, tonicInStock: 0 });
			const gerade = zufrieden({ repairNeeded: true, actionPoints: 4, tonicInStock: 0 });

			expect(decideNpcAction(knapp)).not.toBe('RENOVATE');
			expect(decideNpcAction(gerade)).toBe('RENOVATE');
		});

		it('besorgt Material auch ohne Kraft für die Reparatur', () => {
			// Kaufen kostet Geld, keine Punkte. Wer erst Kraft haben müsste, um Holz zu
			// bestellen, stünde mit vollen Punkten vor einem leeren Bauplatz.
			const ohneKraft = zufrieden({
				repairNeeded: true,
				materialMissing: true,
				actionPoints: 1,
				tonicInStock: 0
			});

			expect(decideNpcAction(ohneKraft)).toBe('BUY_MATERIAL');
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

		it('gibt das Dach nicht auf, sondern baut die Werkstatt, die es möglich macht', () => {
			// **Der Befund vom 16.08.2026** (Punkt 63): Alle acht Gründer waren verheiratet
			// und ohne Haus, für die Kate fehlten Bretter, und Bretter bot niemand an. Damit
			// war `materialPrice` null, das Vorhaben unbezifferbar — und wer nichts vorhat,
			// arbeitet nur bis zur Rücklage. Neunzig von hundert Runden Müßiggang bei vollem
			// Aktionsvorrat.
			//
			// Ein Ziel, das man nicht kaufen kann, ist kein Ziel. Also fällt er durch auf
			// das, was er selbst in der Hand hat — und die billigste fehlende Werkstatt ist
			// ausgerechnet die, die Bretter macht.
			const ohneBretter = gruender({
				isMarried: true,
				hasFreePlot: true,
				materialMissing: true,
				materialPrice: null
			});

			expect(savingsTarget(ohneBretter)).toBe(180);
		});

		it('spart weiter aufs Material, solange es welches zu kaufen gibt', () => {
			// Die Gegenprobe: Wo ein Preis steht, bleibt das Haus das Ziel.
			const mitAngebot = gruender({
				isMarried: true,
				hasFreePlot: true,
				materialMissing: true,
				materialPrice: 12
			});

			expect(savingsTarget(mitAngebot)).toBe(12);
		});

		it('spart auf die Pacht, wenn der Betrieb ohne Rohstoff dasteht', () => {
			// Ohne das war der erste Betrieb der Welt eine Sackgasse: Die Zimmerei stand
			// nach neunhundert Ticks noch ohne Holz da, weil ihre Besitzerin über die
			// Rücklage hinaus keinen Grund mehr zu arbeiten hatte — ihr Ziel war ja erreicht.
			const mitWerkstatt = gruender({
				isMarried: true,
				ownsHome: true,
				ownsWorkshop: true,
				hasLease: false,
				leaseAvailable: true,
				leaseFee: 20
			});

			expect(savingsTarget(mitWerkstatt)).toBe(20);
		});

		it('spart nicht auf eine Pacht, die es nicht gibt', () => {
			const alleVergeben = gruender({
				isMarried: true,
				ownsHome: true,
				ownsWorkshop: true,
				hasLease: false,
				leaseAvailable: false
			});

			expect(savingsTarget(alleVergeben)).toBeNull();
		});

		it('kauft die Zutat, die auf keinem Feld wächst', () => {
			// **Ohne das endet jede Kette nach der ersten Stufe** (5.17): Wer Getreide erntet,
			// kann mahlen — wer Mehl braucht, muss es kaufen, und dafür gab es keine
			// Handlung. Ein Bäcker stand sein Leben lang vor einem leeren Backhaus.
			const baecker = gruender({
				isMarried: true,
				ownsHome: true,
				ownsWorkshop: true,
				canCraft: false,
				inputPrice: 6
			});

			expect(decideNpcAction(baecker)).toBe('BUY_INPUT');
			expect(savingsTarget(baecker)).toBe(6);
		});

		it('zieht die gekaufte Zutat der Pacht vor', () => {
			// Wo es sie zu kaufen gibt, ist sie der kürzere Weg — und für die zweite Stufe
			// einer Kette der einzige.
			const beides = gruender({
				isMarried: true,
				ownsHome: true,
				ownsWorkshop: true,
				canCraft: false,
				inputPrice: 6,
				leaseAvailable: true,
				leaseFee: 20
			});

			expect(savingsTarget(beides)).toBe(6);
		});

		it('pachtet, wo die Zutat nicht zu kaufen ist', () => {
			const nurBoden = gruender({
				isMarried: true,
				ownsHome: true,
				ownsWorkshop: true,
				canCraft: false,
				inputPrice: null,
				leaseAvailable: true,
				leaseFee: 20
			});

			expect(savingsTarget(nurBoden)).toBe(20);
		});

		it('kauft kein Grundstück, wenn keines mehr zu haben ist', () => {
			// `plotPrice` ist null, sobald die Stadt kein freies Bauland mehr hat. Ohne
			// diese Rückmeldung versuchte derselbe NPC es in jedem Tick aufs Neue — im
			// Messlauf 466 Fehlversuche in sechshundert Ticks.
			const ausverkauft = gruender({ isMarried: true, ownsHome: true, plotPrice: null });

			expect(decideNpcAction(ausverkauft)).not.toBe('BUY_PLOT');
			expect(savingsTarget(ausverkauft)).toBeNull();
		});
	});

	/**
	 * Warum einer nichts tut (5.21).
	 *
	 * `IDLE` war die häufigste Handlung der Welt — 11357 von 16000 Runden in einem Messlauf
	 * — und sagte nichts. Der schwerste Befund dieser Phase kam deshalb aus dem Lesen des
	 * Codes und nicht aus dem Messen.
	 */
	describe('wer eigene Arbeit liegen hat', () => {
		/** Einer, der unter seinem Sparziel liegt und dem Tagelohn offensteht. */
		function sparsam(werte: Partial<NpcState> = {}): NpcState {
			return zufrieden({
				personality: anlagen({ ambition: 40, diligence: 40 }),
				isMarried: false,
				ownsHome: false,
				money: 50,
				plotPrice: 40,
				workshopPrice: 180,
				workAvailable: true,
				// Ohne das wirbt er: Zugehörigkeit steht vor der Entfaltung, und die Frage
				// hier ist eine andere.
				matchAvailable: false,
				...werte
			});
		}

		it('verdingt sich, solange er nichts Eigenes hat', () => {
			// Der Fall, für den das Sparziel erfunden wurde (Punkt 55): Wer nichts besitzt,
			// kommt an ein Grundstück nur über Lohn.
			expect(decideNpcAction(sparsam())).toBe('WORK');
		});

		it('geht nicht zum Tagelohn, wenn die Werkstatt voller Zutaten steht', () => {
			// **Der Messbefund aus 5.30.** Tagelohn steht in der Sicherheitsstufe, eine
			// ganze Stufe über der Entfaltung — und griff deshalb bei jedem, der ein
			// Sparziel hatte. Zwei Läufe: HARVEST um dreiundneunzig Prozent eingebrochen,
			// während Hof und Zimmerei stillstanden.
			const meisterin = sparsam({ ownsWorkshop: true, canCraft: true });

			expect(decideNpcAction(meisterin)).toBe('CRAFT');
		});

		it('erntet lieber, als sich zu verdingen', () => {
			expect(decideNpcAction(sparsam({ ownsWorkshop: true, hasLease: true }))).toBe('HARVEST');
		});

		it('verkauft lieber, als sich zu verdingen', () => {
			expect(decideNpcAction(sparsam({ ownsWorkshop: true, ownStockToSell: 5 }))).toBe('SELL');
		});

		it('kehrt zum Tagelohn zurück, wenn die Zutaten ausgehen', () => {
			// Geprüft wird auf **jetzt** verfügbare Arbeit, nicht auf Besitz — sonst stünde
			// der Werkstattbesitzer ohne Rohstoff untätig da, statt sich das Geld für
			// Nachschub zu verdienen.
			const leer = sparsam({ ownsWorkshop: true, canCraft: false, inputPrice: 8, money: 38 });

			expect(decideNpcAction(leer)).toBe('WORK');
		});

		it('nimmt dem Kind den Tagelohn nicht', () => {
			// Die Entfaltung greift erst mit der Volljährigkeit. Ohne diese Prüfung stünde
			// ein Kind mit Pacht untätig da.
			const kind = sparsam({ isAdult: false, hasLease: true, money: 10 });

			expect(decideNpcAction(kind)).toBe('WORK');
		});
	});

	describe('ausbauen, was steht', () => {
		it('baut das Haus an, wenn kein Bett mehr frei ist', () => {
			// Derselbe Beweggrund, der es hat bauen lassen: ohne Platz keine Kinder.
			const eng = zufrieden({ homeHasRoom: false, homeUpgradePrice: 150 });

			expect(decideNpcAction(eng)).toBe('UPGRADE_HOME');
		});

		it('lässt ein Haus in Ruhe, in dem noch Platz ist', () => {
			// Sonst baute jeder Verheiratete bis zum Großhaus aus, bloß weil er es kann.
			expect(decideNpcAction(zufrieden({ homeHasRoom: true }))).toBe('IDLE');
		});

		it('baut nicht aus, wenn die Höchststufe steht', () => {
			expect(decideNpcAction(zufrieden({ homeHasRoom: false, homeUpgradePrice: null }))).toBe(
				'IDLE'
			);
		});

		it('spart auf den Anbau, statt bei der Rücklage aufzuhören', () => {
			// Ohne das käme es zur Handlung nie: Wer sein Haus hat, hat sein Ziel erreicht
			// — dieselbe Falle, an der vor Punkt 55 die ganze Stadt hing.
			const eng = zufrieden({ homeHasRoom: false, homeUpgradePrice: 150, money: 50 });

			expect(savingsTarget(eng)).toBe(150);
			expect(decideNpcAction(eng)).toBe('WORK');
		});

		it('baut nicht an, wem die Kraft dafür fehlt', () => {
			// Acht Aktionspunkte kostet ein Ausbau. Ohne diese Prüfung versuchte er es
			// Tick für Tick vergeblich — die Art Fehlschlag, die in der Statistik als
			// Handlung dasteht.
			const müde = zufrieden({
				homeHasRoom: false,
				homeUpgradePrice: 150,
				actionPoints: 4,
				workAvailable: false,
				hasJob: false,
				tonicInStock: 0
			});

			expect(decideNpcAction(müde)).not.toBe('UPGRADE_HOME');
		});

		/** Ein Unternehmer mit laufender Werkstatt und Geld darüber. */
		function meister(werte: Partial<NpcState> = {}): NpcState {
			return zufrieden({
				personality: anlagen({ ambition: 40, diligence: 40 }),
				ownsWorkshop: true,
				canCraft: true,
				workshopUpgradePrice: 340,
				...werte
			});
		}

		it('vergrößert die Werkstatt, ehe es in ihr weitergeht', () => {
			// Die Stelle vor `CRAFT` ist die einzige, die ein laufender Betrieb je
			// erreicht: Wer Zutaten hat, kehrt dort um.
			expect(decideNpcAction(meister())).toBe('UPGRADE_WORKSHOP');
		});

		it('lässt den Ausbau, wenn nichts zu verarbeiten da ist', () => {
			// Dem fehlt Rohstoff, nicht Platz — eine größere leere Werkstatt hilft nicht.
			expect(decideNpcAction(meister({ canCraft: false }))).not.toBe('UPGRADE_WORKSHOP');
		});

		it('baut nur aus, wen sein Wesen dazu drängt', () => {
			// Dieselbe Schwelle wie beim Bauen: Sonst stünde nach zwei Generationen in
			// jeder Gasse eine Großwerkstatt.
			const gemuetlich = meister({ personality: anlagen({ ambition: -50, diligence: -50 }) });

			expect(decideNpcAction(gemuetlich)).toBe('CRAFT');
		});

		it('arbeitet auf die größere Werkstatt hin', () => {
			expect(savingsTarget(meister({ money: 50 }))).toBe(340);
		});

		it('geht dafür aber nicht zum Tagelohn', () => {
			// **Der Messbefund aus 5.30.** Ohne `hatEigeneArbeit` wählte genau dieser
			// Mensch `WORK` — er lag unter seinem Sparziel, und Tagelohn steht eine Stufe
			// darüber. Zwei Läufe zeigten es: HARVEST um dreiundneunzig Prozent
			// eingebrochen, während die Werkstatt voller Zutaten stand.
			// Er kann sich den Ausbau (noch) nicht leisten und arbeitet weiter — aber in
			// seiner eigenen Werkstatt, nicht an fremden Häusern.
			expect(decideNpcAction(meister({ money: 50 }))).toBe('CRAFT');
			expect(decideNpcAction(meister({ money: 50, hasLease: true, canCraft: false }))).toBe(
				'HARVEST'
			);
		});
	});

	describe('warum einer nichts tut', () => {
		it('unterscheidet Zufriedenheit von Erschöpfung', () => {
			expect(idleReason(zufrieden())).toBe('CONTENT');
			expect(idleReason(zufrieden({ actionPoints: 0 }))).toBe('EXHAUSTED');
			expect(idleReason(zufrieden({ isAdult: false }))).toBe('TOO_YOUNG');
		});

		it('erkennt das Ziel, das niemand verkauft', () => {
			// **Der Fall, an dem die Welt stillstand** (Punkt 63): verheiratet, ohne Haus,
			// Baumaterial fehlt und ist nirgends zu haben. Von außen sah das aus wie
			// Zufriedenheit — und genau deshalb suchte niemand dort.
			const festgefahren = zufrieden({
				isMarried: true,
				ownsHome: false,
				materialMissing: true,
				materialPrice: null,
				plotPrice: null,
				workshopPrice: null
			});

			expect(decideNpcAction(festgefahren)).toBe('IDLE');
			expect(idleReason(festgefahren)).toBe('GOAL_UNREACHABLE');
		});

		it('nennt es Sparen, wo gespart wird', () => {
			const sparend = zufrieden({
				personality: anlagen({ ambition: 40, diligence: 40 }),
				ownsHome: false,
				isMarried: true,
				materialMissing: false,
				hasFreePlot: true,
				homePrice: 100,
				workAvailable: true
			});

			expect(idleReason(sparend)).toBe('STILL_SAVING');
		});

		it('nennt es fehlende Arbeit, wo keine zu haben ist', () => {
			// Derselbe Mensch, dieselbe Absicht — nur gibt die Stadt nichts her. Das ist ein
			// anderer Befund und gehört anders benannt.
			const ohneArbeit = zufrieden({
				personality: anlagen({ ambition: 40, diligence: 40 }),
				ownsHome: false,
				isMarried: true,
				materialMissing: false,
				hasFreePlot: true,
				homePrice: 100,
				workAvailable: false
			});

			expect(idleReason(ohneArbeit)).toBe('NO_WORK');
		});
	});
});
