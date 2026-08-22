import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as buildingService from '$lib/server/service/buildingService';
import * as buildingActionService from '$lib/server/service/buildingActionService';
import * as plotService from '$lib/server/service/plotService';
import type { BuildingAction } from '$lib/model/buildingAction';
import { actionMessage, nameMessage } from '$lib/actionMessage';
import * as productionService from '$lib/server/service/productionService';
import { getItemTemplate } from '$lib/model/itemTemplate';
import * as tradeService from '$lib/server/service/tradeService';
import * as needService from '$lib/server/service/needService';
import * as employmentService from '$lib/server/service/employmentService';
import * as lawService from '$lib/server/service/lawService';
import * as electionService from '$lib/server/service/electionService';
import * as worldService from '$lib/server/service/worldService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as schoolService from '$lib/server/service/schoolService';
import type { SkillType } from '$lib/game/skill.logic';
import {
	CONDITION_MAX,
	RENOVATION_COST_PER_POINT,
	renovationMaterial,
	residentsAt,
	restAt,
	UPGRADE_ACTION_POINT_COST,
	wageAt
} from '$lib/game/building.logic';
import { levelFactor } from '$lib/game/production.logic';
import {
	type BuildingTemplate,
	levelOf,
	maxLevel,
	upgradePrice
} from '$lib/model/buildingTemplate';
import {
	AGE_OF_MAJORITY,
	buildingCostFactor,
	type Season,
	seasonOf,
	SEASON_NAMES
} from '$lib/game/time';

export const load: PageServerLoad = async ({ params, locals }) => {
	const building = await buildingService.getBuilding(params.building_id);
	if (!building) {
		// Auch der Weg, auf dem eine Ruine sichtbar wird: `getBuilding` hat sie soeben
		// abgeräumt, und wer den Link im Lesezeichen hatte, findet nichts mehr vor.
		error(404, 'Not Found');
	}

	const option = buildingService.getBuildingOption(building.optionId);
	const jahreszeit: Season = seasonOf(await worldService.currentTick());
	const gehoertMir: boolean =
		locals.currentCharacter !== undefined &&
		building.ownerCharacterId === locals.currentCharacter.id;

	// Einmal geladen und zweimal gebraucht: für die Lage und für die Stadt, deren Kasse
	// den Sold eines städtischen Hauses zahlt.
	const grundstueck = building.plotId ? await plotService.getPlot(building.plotId) : undefined;

	// **Wer hier über Leute bestimmt** — gefragt wird der Dienst und nicht die Seite: Beim
	// eigenen Betrieb ist es der Eigentümer, bei einem städtischen Haus der Amtsinhaber.
	const darfBestimmen: boolean =
		locals.currentCharacter !== undefined &&
		(await employmentService.mayDecideStaff(locals.currentCharacter.id, building.id));

	// Wohnraum mit freiem Platz, der einem selbst oder der Stadt gehört — dann darf man
	// einziehen (5.6). Die Zahl steht daneben: „Noch zwei Plätze" ist die Auskunft, die
	// über Bleiben oder Weitersuchen entscheidet.
	const freiePlaetze: number | null = await buildingService.freierWohnraum(building.id);
	const darfEinziehen: boolean =
		locals.currentCharacter !== undefined &&
		locals.currentCharacter.homeBuildingId !== building.id &&
		(gehoertMir || building.ownerType === 'CITY') &&
		freiePlaetze !== null &&
		freiePlaetze > 0;

	return {
		building,
		option,
		plot: grundstueck,
		mine: gehoertMir,
		freeRoom: freiePlaetze,
		canMoveIn: darfEinziehen,
		// **Arbeit für Lohn** (5.26): Ein städtischer Bau bietet sie, solange er nicht in
		// voller Güte steht. Das hängt am Zustand und nicht an der Vorlage — dieselbe
		// Vorlage bietet heute Arbeit und morgen nicht, sobald sie hergerichtet ist.
		repairForHire:
			locals.currentCharacter !== undefined &&
			building.condition < CONDITION_MAX &&
			building.ownerCharacterId !== locals.currentCharacter.id &&
			// Städtisch immer, privat nur mit Auftrag (5.27, Punkt 74).
			(building.ownerType === 'CITY' || building.repairWage !== null),
		livesHere: locals.currentCharacter?.homeBuildingId === building.id,
		levelName: option ? levelOf(option, building.level).name : undefined,
		maxLevel: option ? maxLevel(option) : 1,
		// **Was der nächste Ausbau kostet und was er bringt** — beides dort, wo die Stufe
		// steht. Bis hierher gab es unten nur einen Knopf mit dem Grundpreis: Er verschwieg
		// die acht Aktionspunkte, verschwieg den Winteraufschlag — und nannte damit im
		// Frost einen Preis, den das Spiel nicht hielt — und verschwieg vor allem, wofür
		// man zahlt. Ein Ausbau ist die größte Ausgabe des Spiels; wer sie blind tätigt,
		// entscheidet nicht, sondern probiert.
		upgrade: naechsteStufe(option, building.level, building.condition, jahreszeit),
		// Was eine Renovierung jetzt kostete — sichtbar, damit man abwägen kann, ob man
		// sie noch aufschiebt.
		// Ein Betrieb kann mehreres herstellen (die Alchemistenküche etwa), deshalb eine
		// Liste — und je Eintrag ein eigener Knopf.
		recipes: (option?.recipes ?? []).map((rezept) => ({
			itemId: rezept.outputItemId,
			input: rezept.input.map((zutat) => ({
				name: getItemTemplate(zutat.itemId)?.name ?? zutat.itemId,
				quantity: zutat.quantity
			})),
			output: getItemTemplate(rezept.outputItemId)?.name ?? rezept.outputItemId,
			cost: rezept.actionPointCost
		})),
		// Jedes Handelshaus ist zugleich Verkaufsstelle — Lager und Preisschilder gehoeren
		// deshalb auf die Gebaeudeseite und nicht in eine eigene Ecke.
		stock: await tradeService.getBuildingStock(params.building_id),
		offers: await tradeService.getOffersAt(params.building_id, locals.currentCharacter?.id),
		myStock: locals.currentCharacter ? await needService.getStock(locals.currentCharacter.id) : [],
		// **Wie voll das Inventar ist, dort wo umgelagert wird** (5.34). Ohne die Zahl
		// erfährt man erst am abgewiesenen Knopf, dass kein Platz mehr ist.
		inventory: {
			used: locals.currentCharacter
				? await needService.inventoryUsed(locals.currentCharacter.id)
				: 0,
			capacity: locals.currentCharacter
				? await needService.inventoryCapacityOf(locals.currentCharacter.id)
				: 0
		},
		isMarket: building.optionId === tradeService.MARKET_OPTION_ID,
		// Der Satz gilt je Stadt, und der Betrachter steht in einer — seine ist die richtige.
		stallFee: locals.currentCharacter
			? await lawService.rate(locals.currentCharacter.regionId, 'STALL_FEE')
			: 0,
		staff: await employmentService.getStaff(params.building_id),
		// **Was der Aushang bewirkt, bevor man ihn aushängt** (Punkt: Feedback beim
		// Anstellen). Bis hierher stand im Abschnitt „Leute" ein Zahlenfeld und ein Knopf
		// „Suchen" — ob das Haus überhaupt einen Arbeitsplatz hat, ob schon ein Aushang
		// hängt und für wie viel, stand nirgends. Ein Wohnhaus nahm den Aushang klaglos
		// entgegen und fand nie jemanden.
		hiring: {
			...(await employmentService.positionCount(building)),
			// Was eine Schicht kostet, hängt am Rezept: Wer acht Aktionspunkte je Durchgang
			// verlangt, zahlt achtmal den Lohn. Ohne Rezept ist es einer.
			actionPointCost: option?.recipes?.[0]?.actionPointCost ?? 1,
			// **Wer hier bestimmen darf — und das ist nicht nur der Eigentümer.** Ein
			// städtisches Haus hat keinen; über seine Belegschaft entscheidet der
			// Amtsinhaber. Die Frage stellt der Dienst, nicht die Seite: Die Seite fragte
			// bis hierher „gehört mir?" und war damit enger als die Handlung, die sie
			// auslöst — der Bürgermeister durfte die Wache besetzen und fand keinen Knopf.
			mayDecide: darfBestimmen,
			// Aus welcher Kasse der Lohn kommt und was darin liegt. Beim eigenen Betrieb
			// die eigene, beim städtischen die der Stadt — und in beiden Fällen die Zahl,
			// an der hängt, ob morgen jemand arbeitet.
			purse:
				darfBestimmen && locals.currentCharacter
					? await kasse(building, grundstueck?.regionId, locals.currentCharacter)
					: null
		},
		// Die Schule: wer hier unterrichtet, was ein Tag kostet und welche eigenen Kinder
		// man hinschicken könnte.
		school:
			building.optionId === schoolService.SCHOOL_OPTION_ID && locals.currentCharacter
				? {
						teachers: await schoolService.getTeachers(params.building_id),
						fee: await lawService.rate(locals.currentCharacter.regionId, 'SCHOOL_FEE'),
						children: (
							await lifecycleService.getChildren(
								locals.currentCharacter.id,
								await worldService.currentTick()
							)
						).filter((kind) => kind.age < AGE_OF_MAJORITY)
					}
				: undefined,
		renovationCost: Math.ceil(CONDITION_MAX - building.condition) * RENOVATION_COST_PER_POINT,
		// Was das Herrichten an Holz kostet — sichtbar, bevor man es versucht.
		renovationMaterial: renovationMaterial(Math.ceil(CONDITION_MAX - building.condition)).map(
			(posten) => ({ ...posten, name: getItemTemplate(posten.itemId)?.name ?? posten.itemId })
		)
	};
};

/**
 * Aus welcher Kasse der Lohn hier käme — und was darin liegt.
 *
 * Ein privater Betrieb zahlt aus der Börse seines Eigentümers, ein städtischer aus der
 * Stadtkasse (`kasseVon` im Anstellungsdienst rechnet genauso). Für den, der aushängt,
 * ist das keine Feinheit: **Wer nicht zahlen kann, dessen Schicht findet nicht statt.**
 * Ein Bürgermeister, der den Sold der Wache festsetzt, ohne den Kassenstand daneben zu
 * sehen, beschließt ins Blaue.
 */
async function kasse(
	building: { ownerType: string },
	regionId: string | undefined,
	betrachter: { money: number; regionId: string }
): Promise<{ city: boolean; money: number }> {
	if (building.ownerType !== 'CITY') return { city: false, money: betrachter.money };
	// Die Stadt, in der das Haus steht — nicht die, in der der Betrachter wohnt. Beides
	// fällt fast immer zusammen, aber „fast immer" ist bei einer Zahl zu wenig.
	return { city: true, money: await electionService.getTreasury(regionId ?? betrachter.regionId) };
}

/**
 * Die nächste Ausbaustufe, wie sie vor der Entscheidung aussieht — `undefined`, wenn die
 * Höchststufe steht.
 *
 * Der Zustand geht in den Lohn ein, weil er es auch sonst tut: Eine verfallene Werkstatt
 * zahlt auf jeder Stufe weniger (`wageAt`). Eine Zahl, die den Verfall wegließe,
 * verspräche mehr, als der Ausbau einbrächte.
 */
function naechsteStufe(
	option: BuildingTemplate | undefined,
	level: number,
	condition: number,
	season: Season
) {
	if (!option) return undefined;
	const grundpreis: number | undefined = upgradePrice(option, level);
	if (grundpreis === undefined) return undefined;

	const naechste = levelOf(option, level + 1);
	return {
		name: naechste.name,
		// Der Frost verteuert den Bau — derselbe Faktor, mit dem `upgrade()` rechnet.
		// Stünde hier der Grundpreis, wäre die Anzeige im Winter schlicht falsch.
		price: Math.ceil(grundpreis * buildingCostFactor(season)),
		basePrice: grundpreis,
		surcharge: buildingCostFactor(season) > 1 ? SEASON_NAMES[season] : undefined,
		actionPoints: UPGRADE_ACTION_POINT_COST,
		// Nur nennen, was sich ändert: Ein Betrieb ohne Wohnraum braucht keine Zeile
		// „0 Plätze", und ein Wohnhaus keine über den Lohn.
		residents: naechste.residents ?? 0,
		residentsNow: residentsAt(option, level),
		wage: wageAt(option, level + 1, condition),
		wageNow: wageAt(option, level, condition),
		// Der Kraftvorrat, den das Dach trägt — beim Wohnhaus der eigentliche Gewinn des
		// Ausbaus, denn Plätze nützen nur, wer Kinder will.
		rest: restAt(option, level + 1, condition),
		restNow: restAt(option, level, condition),
		// Und der Ertrag der Werkstatt, in Prozent des Grundwerts: Was hier steht, ist
		// dieselbe Rechnung, die `yieldOf` beim Sägen anstellt.
		output: Math.round(levelFactor(level + 1) * 100),
		outputNow: Math.round(levelFactor(level) * 100),
		crafts: (option.recipes ?? []).length > 0
	};
}

export const actions = {
	/**
	 * Für Lohn herrichten.
	 *
	 * **Ohne Vorlagenprüfung** (5.27): Bis dahin stand hier `option.actions.includes(action)`,
	 * und das war richtig, solange eine Handlung an der Bauart hing — die Schmiede erlaubte
	 * Arbeit, das Wohnhaus nicht. Seit 5.26 hängt sie am **Zustand** und am **Auftrag**, und
	 * damit ging die Prüfung ins Leere: `actions` ist bei jeder Vorlage leer, also lehnte die
	 * Route jede Handlung mit 403 ab. Der Knopf war da, der Klick kam an, und die Antwort war
	 * „Diese Handlung ist hier nicht möglich" — gefunden vom Rundlauf, nachdem ich dreimal
	 * daneben geraten hatte.
	 *
	 * Geprüft wird jetzt nur noch dort, wo die Regeln stehen: `fuerLohnHerrichten` nennt den
	 * Grund genau (kein Auftrag, nichts zu richten, eigenes Haus, Kasse leer). Eine Prüfung an
	 * zwei Stellen läuft auseinander — genau das ist hier passiert.
	 */
	act: async ({ request, params, locals }) => {
		const building = await buildingService.getBuilding(params.building_id);
		if (!building) error(404, 'Not Found');
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der handeln könnte' });
		}

		const data = await request.formData();
		const action = data.get('action')?.toString() as BuildingAction;
		const ergebnis = await buildingActionService.doBuildingAction(
			action,
			locals.currentCharacter.id,
			building.id
		);
		if (!ergebnis.ok) {
			return fail(400, { message: actionMessage(ergebnis.reason) });
		}
		return { message: `Feierabend. ${ergebnis.earned} Münzen verdient.` };
	},

	renovate: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der renovieren könnte' });
		}
		const ergebnis = await buildingService.renovateBuilding(
			locals.currentCharacter.id,
			params.building_id
		);
		if (!ergebnis.ok) {
			const fehlt = 'missing' in ergebnis ? ergebnis.missing : undefined;
			const nachsatz: string = fehlt
				? ' Es fehlen: ' +
					fehlt
						.map(
							(posten) =>
								posten.quantity + ' ' + (getItemTemplate(posten.itemId)?.name ?? posten.itemId)
						)
						.join(', ') +
					'.'
				: '';
			return fail(400, { message: actionMessage(ergebnis.reason) + nachsatz });
		}
		return { message: `Renoviert. ${ergebnis.spent} Münzen und das Holz dazu.` };
	},

	upgrade: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der bauen könnte' });
		}
		const ergebnis = await buildingService.upgradeBuilding(
			locals.currentCharacter.id,
			params.building_id
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `Ausgebaut. ${ergebnis.spent} Münzen verbaut.` };
	},

	sell: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der verkaufen könnte' });
		}
		const roh = (await request.formData()).get('price')?.toString();
		const preis: number | null = roh ? Number(roh) : null;
		if (preis !== null && (!Number.isInteger(preis) || preis < 0)) {
			return fail(400, { message: 'Der Preis muss eine ganze Zahl sein.' });
		}

		const ergebnis = await buildingService.setBuildingPrice(
			locals.currentCharacter.id,
			params.building_id,
			preis
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: preis === null ? 'Das Haus steht nicht mehr zum Verkauf.' : 'Preis gesetzt.'
		};
	},

	craft: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der arbeiten könnte' });
		}
		const itemId = (await request.formData()).get('itemId')?.toString();
		const ergebnis = await productionService.craft(
			locals.currentCharacter.id,
			params.building_id,
			itemId
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return {
			message: `${ergebnis.produced} ${getItemTemplate(ergebnis.itemId)?.name ?? ''} hergestellt.`
		};
	},

	stockIn: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString();
		const menge = Number(data.get('quantity') ?? 0);
		if (!itemId) return fail(400, { message: 'Was denn?' });

		const ergebnis = await tradeService.moveToStock(
			locals.currentCharacter.id,
			params.building_id,
			itemId,
			menge
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: menge > 0 ? 'Eingelagert.' : 'Ausgelagert.' };
	},

	/**
	 * Aus dem Lager zurück ins Inventar.
	 *
	 * **Eine eigene Handlung statt eines Vorzeichens im Formular** (5.34): `moveToStock`
	 * versteht die Richtung an der Menge, aber ein verstecktes Minus in einem
	 * Eingabefeld ist keine Bauart, sondern eine Falle — wer das Formular liest, sieht
	 * nicht, was es tut. Das Umdrehen gehört hierher, wo es einen Namen hat.
	 */
	stockOut: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString();
		const menge = Number(data.get('quantity') ?? 0);
		if (!itemId) return fail(400, { message: 'Was denn?' });
		if (!Number.isInteger(menge) || menge < 1) return fail(400, { message: 'Wie viel denn?' });

		const ergebnis = await tradeService.moveToStock(
			locals.currentCharacter.id,
			params.building_id,
			itemId,
			-menge
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `${menge} ins Inventar geholt.` };
	},

	sellOffer: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString();
		const menge = Number(data.get('quantity') ?? 0);
		const preis = Number(data.get('price') ?? 0);
		if (!itemId) return fail(400, { message: 'Was denn?' });

		const ergebnis = await tradeService.placeOffer(
			locals.currentCharacter.id,
			params.building_id,
			itemId,
			menge,
			preis
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Das Preisschild hängt.' };
	},

	buyOffer: async ({ request, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const data = await request.formData();
		const offerId = data.get('offerId')?.toString();
		const menge = Number(data.get('quantity') ?? 1);
		if (!offerId) return fail(400, { message: 'Welches Angebot?' });

		const ergebnis = await tradeService.buyFromOffer(locals.currentCharacter.id, offerId, menge);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `${menge} gekauft.` };
	},

	/**
	 * Einen Aushang aushängen — oder mit leerem Feld wieder abnehmen.
	 *
	 * **Die Antwort nennt, was jetzt gilt.** „Der Aushang hängt." war wahr und half
	 * niemandem: Ob überhaupt eine Stelle frei ist, was der Lohn eine Schicht kostet und
	 * dass ein abgenommener Aushang die vorhandene Belegschaft nicht anrührt — das alles
	 * entschied sich hier und wurde verschwiegen. Ein Aushang an einem Wohnhaus ist kein
	 * Fehler der Regeln (er hängt eben), aber er findet nie jemanden, und das darf man
	 * sofort erfahren statt nach drei Wochen Warten.
	 */
	hire: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const roh = (await request.formData()).get('wage')?.toString().trim();
		const lohn: number | null = roh ? Number(roh) : null;
		// Eigene Prüfung vor dem Dienst: Der lehnt zwar auch ab, aber mit „Daran gibt es
		// nichts zu tun." — einem Satz, der zu allem passt und nichts erklärt.
		if (lohn !== null && (!Number.isInteger(lohn) || lohn < 1)) {
			return fail(400, { message: 'Der Lohn muss eine ganze Zahl ab 1 Münze sein.' });
		}

		const ergebnis = await employmentService.offerJob(
			locals.currentCharacter.id,
			params.building_id,
			lohn
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });

		const gebaeude = await buildingService.getBuilding(params.building_id);
		if (!gebaeude) error(404, 'Not Found');
		const { positions, taken } = await employmentService.positionCount(gebaeude);
		if (lohn === null) {
			return {
				message:
					'Der Aushang ist ab.' +
					(taken > 0
						? ' Wer schon angestellt ist, bleibt es — abnehmen heißt nicht entlassen.'
						: '')
			};
		}

		const kosten: number =
			buildingService.getBuildingOption(gebaeude.optionId)?.recipes?.[0]?.actionPointCost ?? 1;
		const frei: number = positions - taken;
		const nachsatz: string =
			positions === 0
				? ' Hier ist allerdings kein Arbeitsplatz — es wird sich niemand melden.'
				: frei <= 0
					? ` Alle ${positions} Stellen sind aber besetzt; frei wird erst, wer geht oder entlassen wird.`
					: ` ${frei} von ${positions} ${positions === 1 ? 'Stelle' : 'Stellen'} frei, jede Schicht kostet ${gebaeude.ownerType === 'CITY' ? 'die Stadt' : 'dich'} ${lohn * kosten} Münzen.`;
		return { message: `Der Aushang hängt: ${lohn} Münzen je Aktionspunkt.${nachsatz}` };
	},

	/**
	 * Jemanden entlassen.
	 *
	 * Das Gegenstück zum Kündigen unter `/jobs` — dieselbe Handlung, nur von der anderen
	 * Seite. Ohne Frist und ohne Abfindung: Was eine Anstellung kosten soll, wenn sie
	 * endet, hängt an der Verhandlung über den Lohn (Punkt 33).
	 */
	dismiss: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const employeeId = (await request.formData()).get('employeeId')?.toString();
		if (!employeeId) return fail(400, { message: 'Wen denn?' });

		const ergebnis = await employmentService.dismiss(
			locals.currentCharacter.id,
			params.building_id,
			employeeId
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: 'Entlassen.' };
	},

	buy: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der kaufen könnte' });
		}
		const ergebnis = await buildingService.buyBuilding(
			locals.currentCharacter.id,
			params.building_id
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: `Gekauft für ${ergebnis.spent} Münzen — samt Grundstück.` };
	},

	/**
	 * Ein Kind zur Schule schicken.
	 *
	 * Bezahlt wird vom Elternteil, nicht vom Kind: Ein Kind hat selten eigenes Geld, und
	 * die Ausgabe soll dort anfallen, wo die Entscheidung getroffen wird.
	 */
	school: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });

		const daten = await request.formData();
		const childId = daten.get('childId')?.toString();
		const skill = daten.get('skill')?.toString() as SkillType | undefined;
		if (!childId || !skill) return fail(400, { message: 'Wer soll was lernen?' });

		const ergebnis = await schoolService.attend(
			childId,
			params.building_id,
			skill,
			locals.currentCharacter.id
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });

		const kosten: string =
			ergebnis.fee > 0 ? `${ergebnis.fee} Münzen Schulgeld.` : 'auf Kosten der Stadt.';
		return { message: `Ein Schultag bei ${ergebnis.teacher} — ${kosten}` };
	},

	/**
	 * Hier einziehen.
	 *
	 * Der Weg, den es bis 5.6 nur für NPCs gab: in die städtische Unterkunft oder ins
	 * eigene Haus. Wer obdachlos ist, erholt sich nicht und bekommt keine Kinder — für
	 * einen Neuling war das eine Sackgasse, für einen Abgebrannten ebenso.
	 */
	moveIn: async ({ params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der einziehen könnte' });
		}

		const ergebnis = await buildingService.moveInto(locals.currentCharacter.id, params.building_id);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });

		return { message: 'Du wohnst jetzt hier.' };
	},

	/** Dem eigenen Haus einen Namen geben — „Bäckerei" ist eine Gattung, kein Betrieb. */
	/**
	 * Einen Reparaturauftrag aushängen — oder zurückziehen (5.27, Punkt 74).
	 *
	 * Wer sein Haus nicht selbst richten kann, weil ihm Aktionspunkte, Material oder das
	 * Können fehlen, bietet dafür Lohn. Ein leeres Feld nimmt den Auftrag wieder ab.
	 */
	offerRepair: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) return fail(401, { message: 'Nicht angemeldet' });
		const roh = (await request.formData()).get('wage')?.toString();
		const lohn: number | null = roh ? Number(roh) : null;

		const ergebnis = await buildingService.offerRepair(
			locals.currentCharacter.id,
			params.building_id,
			lohn
		);
		if (!ergebnis.ok) return fail(400, { message: actionMessage(ergebnis.reason) });
		return { message: lohn === null ? 'Der Auftrag ist zurückgezogen.' : 'Der Auftrag hängt aus.' };
	},

	rename: async ({ request, params, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der etwas zu benennen hätte' });
		}

		const wunsch = (await request.formData()).get('name')?.toString() ?? '';
		const ergebnis = await buildingService.renameBuilding(
			locals.currentCharacter.id,
			params.building_id,
			wunsch
		);
		if (!ergebnis.ok) return fail(400, { message: nameMessage(ergebnis.reason) });

		return { message: `Das Haus heißt jetzt ${ergebnis.name}.` };
	}
} satisfies Actions;
