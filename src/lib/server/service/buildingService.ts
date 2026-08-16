import * as chronicleService from '$lib/server/service/chronicleService';
import type { ActionFailureReason } from '$lib/game/actionFailure';
import { randomUUID } from 'node:crypto';
import { type Model, Op, type Transaction } from 'sequelize';
import type { Building } from '$lib/model/building';
import { type BuildingTemplate, levelOf } from '$lib/model/buildingTemplate';
import { sequelize } from '$lib/db/sequelize';
import { Building as BuildingModel } from '$lib/db/model/building';
import { Plot as PlotModel } from '$lib/db/model/plot';
import { convertToBuilding } from '$lib/db/attributes/building.attributes';
import { build as buildLogic } from '$lib/game/buildingAction.logic';
import {
	CONDITION_MAX,
	currentCondition,
	isRuin,
	type MaterialNeed,
	materialFor,
	missingMaterial,
	producesBuildingMaterial,
	purchase,
	renovate,
	residentsAt,
	RENOVATION_ACTION_POINT_COST,
	renovationMaterial,
	upgrade,
	UPGRADE_ACTION_POINT_COST
} from '$lib/game/building.logic';
import { Character as CharacterModel } from '$lib/db/model/character';
import type {
	BuildingAttributes,
	BuildingCreationAttributes
} from '$lib/db/attributes/building.attributes';
import { Region as RegionModel } from '$lib/db/model/region';
import * as characterService from '$lib/server/service/characterService';
import * as needService from '$lib/server/service/needService';
import * as electionService from '$lib/server/service/electionService';
import * as skillService from '$lib/server/service/skillService';
import * as tradeService from '$lib/server/service/tradeService';
import * as worldService from '$lib/server/service/worldService';
import { checkName, type NameCheck } from '$lib/game/naming.logic';
import { seasonOf } from '$lib/game/time';

/**
 * Der Hof, der zu jeder Pacht gehört.
 *
 * Steht hier und nicht im `productionService`, weil er eine Gebäudevorlage ist wie jede
 * andere — die Pacht legt ihn nur an.
 */
export const HOF_OPTION_ID = 13;

/**
 * Die Vorlagen bleiben Code und wandern nicht in die Datenbank: Preise, Aktionen und
 * Grenzen sollen sich ändern lassen, ohne dass Bestandsgebäude davon unberührt bleiben.
 */
export function getBuildingOptions(): BuildingTemplate[] {
	return [
		{
			optionId: 0,
			initialName: 'Rathaus',
			type: 'PUBLIC',
			description: 'Das Rathaus der Stadt',
			limited: true,
			limitedTo: 1,
			actions: [],
			levels: [{ price: 0, name: 'Rathaus' }]
		},
		{
			optionId: 3,
			initialName: 'Unterkunft',
			type: 'PUBLIC',
			description: 'Ein Dach für die, die keines haben.',
			// **Mehrfach erlaubt.** Die Begrenzung auf eins war eine Startannahme: Wächst die
			// Stadt, braucht sie mehr Dach, und ein Bürgermeister, der zusehen muss, wie
			// Leute obdachlos bleiben, weil eine Zahl im Code auf eins steht, verwaltet eine
			// Regel statt einer Stadt. Einmalig bleibt nur, was die Stadt als Ganzes
			// betrifft — Rathaus, Marktplatz, später die Mauer.
			limited: false,
			limitedTo: 0,
			actions: [],
			// Aus dem Konzept: Wer sein Haus verliert, braucht einen Ort, an dem es
			// weitergeht. Ohne ein Auffangnetz wäre Obdachlosigkeit eine Sackgasse — und
			// seit 4.6a auch ein Todesurteil, weil ohne Wohnraum keine Kinder kommen.
			levels: [{ price: 0, name: 'Unterkunft', residents: 20 }]
		},
		{
			optionId: 1,
			initialName: 'Wohnhaus',
			type: 'RESIDENCE',
			description: 'Ein einfaches Wohnhaus',
			limited: false,
			limitedTo: 0,
			actions: [],
			// Die Leiter, an der die Bevölkerung hängt: Wer viele Kinder will, muss
			// zweimal ausbauen — und danach ein zweites Grundstück kaufen. Spürbare
			// Sprünge, aber kein Vervielfachen, damit knappes Bauland die härtere Grenze
			// bleibt.
			levels: [
				{ price: 100, name: 'Kate', residents: 4 },
				{ price: 150, name: 'Haus', residents: 6 },
				{ price: 400, name: 'Großhaus', residents: 9 }
			]
		},
		{
			optionId: 7,
			initialName: 'Wachhaus',
			type: 'PUBLIC',
			description: 'Wo die Stadtwache sitzt — bezahlt aus der Stadtkasse.',
			limited: false,
			limitedTo: 0,
			actions: [],
			// **Der Lohn steht hier nur, damit es überhaupt ein Arbeitsplatz ist.** Was ein
			// Wächter wirklich bekommt, setzt der Bürgermeister als Aushang — der Sold ist
			// eine Amtsentscheidung und keine Konstante.
			//
			// Eine Stufe, eine Stelle: Der Ausbau öffentlicher Bauten hängt an Punkt 12 und
			// kommt mit ihm. Lieber eine Wache als drei Stufen, die niemand erreichen kann.
			levels: [{ price: 300, name: 'Wachhaus', wagePerActionPoint: 3 }]
		},
		{
			optionId: 8,
			initialName: 'Schule',
			type: 'PUBLIC',
			description: 'Wo Kinder lernen, was sie als Erwachsene können sollen.',
			limited: false,
			limitedTo: 0,
			actions: [],
			// Der Lohn steht hier, damit die Schule ein Arbeitsplatz ist; was ein Lehrer
			// bekommt, setzt der Bürgermeister als Aushang — wie bei der Wache.
			levels: [{ price: 350, name: 'Schule', wagePerActionPoint: 4 }]
		},
		{
			optionId: 9,
			initialName: 'Zimmerei',
			type: 'CRAFT',
			description: 'Sägt aus Stämmen die Bretter für Dach und Diele.',
			limited: false,
			limitedTo: 0,
			actions: [],
			skill: 'CONSTRUCTION',
			recipes: [
				{
					input: [{ itemId: 'WOOD', quantity: 2 }],
					outputItemId: 'PLANK',
					baseOutput: 3,
					actionPointCost: 1,
					skill: 'CONSTRUCTION'
				}
			],
			levels: [
				{ price: 180, name: 'Sägeschuppen' },
				{ price: 340, name: 'Zimmerei' }
			]
		},
		{
			optionId: 10,
			initialName: 'Steinmetzhütte',
			type: 'CRAFT',
			description: 'Behaut Bruchstein zu Quadern für Mauern und Fundamente.',
			limited: false,
			limitedTo: 0,
			actions: [],
			skill: 'MINING',
			recipes: [
				{
					input: [{ itemId: 'STONE', quantity: 2 }],
					outputItemId: 'BLOCK',
					baseOutput: 2,
					actionPointCost: 1,
					skill: 'MINING'
				}
			],
			levels: [
				{ price: 200, name: 'Steinmetzhütte' },
				{ price: 380, name: 'Steinmetzei' }
			]
		},
		{
			optionId: 11,
			initialName: 'Schneiderei',
			type: 'CRAFT',
			description: 'Näht aus Wolle Gewänder, die man ansieht.',
			limited: false,
			limitedTo: 0,
			actions: [],
			skill: 'TAILORING',
			recipes: [
				{
					input: [{ itemId: 'WOOL', quantity: 3 }],
					outputItemId: 'GARMENT',
					baseOutput: 1,
					actionPointCost: 1,
					skill: 'TAILORING'
				}
			],
			levels: [
				{ price: 190, name: 'Nähstube' },
				{ price: 360, name: 'Schneiderei' }
			]
		},
		{
			optionId: 12,
			initialName: 'Alchemistenküche',
			type: 'CRAFT',
			description: 'Zieht aus Kräutern Duftwasser und Stärkungstrank.',
			limited: false,
			limitedTo: 0,
			actions: [],
			skill: 'ALCHEMY',
			// Zwei Erzeugnisse aus demselben Rohstoff — der Grund, warum eine Vorlage
			// mehrere Rezepte tragen kann.
			recipes: [
				{
					input: [{ itemId: 'HERBS', quantity: 3 }],
					outputItemId: 'PERFUME',
					baseOutput: 1,
					actionPointCost: 1,
					skill: 'ALCHEMY'
				},
				{
					input: [{ itemId: 'HERBS', quantity: 2 }],
					outputItemId: 'TONIC',
					baseOutput: 1,
					actionPointCost: 1,
					skill: 'ALCHEMY'
				}
			],
			levels: [
				{ price: 210, name: 'Kräuterküche' },
				{ price: 400, name: 'Alchemistenküche' }
			]
		},
		{
			optionId: HOF_OPTION_ID,
			initialName: 'Hof',
			type: 'EXTRACTION',
			description: 'Das Wirtschaftsgebäude einer Pacht — wo die Hände arbeiten, die sie bestellen.',
			limited: false,
			limitedTo: 0,
			actions: [],
			// **Kein eigenes Rezept: Was hier entsteht, sagt der Boden.** Ein Hof am
			// Mühlenfeld erntet Getreide, derselbe Hof an der Erzgrube bricht Erz — eine
			// Vorlage je Rohstoffart wären sechs Vorlagen, die sich nur in einer Zeile
			// unterscheiden. `workForEmployer` holt das Rezept deshalb aus dem Grundstück.
			//
			// Der Lohn steht hier, damit `positionsAt` den Hof überhaupt als Arbeitsplatz
			// sieht — was ein Knecht bekommt, hängt der Pächter aus, wie überall.
			//
			// Preis 0 und keine zweite Stufe: Der Hof wird nicht gekauft, er kommt mit der
			// Pacht und fällt mit ihr. Wer mehr Hände auf der Fläche will, pachtet eine
			// zweite — Ausbau wäre eine Bodenverbesserung und gehört zu Punkt 12.
			levels: [{ price: 0, name: 'Hof', wagePerActionPoint: 3 }]
		},
		{
			optionId: 6,
			initialName: 'Marktplatz',
			type: 'PUBLIC',
			description: 'Wo jeder seinen Stand aufschlagen darf — gegen Standgeld.',
			limited: true,
			limitedTo: 1,
			actions: [],
			levels: [{ price: 0, name: 'Marktplatz' }]
		},
		{
			optionId: 4,
			initialName: 'Mühle',
			type: 'CRAFT',
			description: 'Mahlt Getreide zu Mehl.',
			limited: false,
			limitedTo: 0,
			actions: [],
			skill: 'BAKING',
			recipes: [
				{
					input: [{ itemId: 'GRAIN', quantity: 3 }],
					outputItemId: 'FLOUR',
					baseOutput: 2,
					actionPointCost: 1,
					skill: 'BAKING'
				}
			],
			levels: [
				{ price: 200, name: 'Handmühle' },
				{ price: 350, name: 'Wassermühle' }
			]
		},
		{
			optionId: 5,
			initialName: 'Bäckerei',
			type: 'CRAFT',
			description: 'Backt aus Mehl Brot.',
			limited: false,
			limitedTo: 0,
			actions: [],
			skill: 'BAKING',
			recipes: [
				{
					input: [{ itemId: 'FLOUR', quantity: 2 }],
					outputItemId: 'BREAD',
					baseOutput: 3,
					actionPointCost: 1,
					skill: 'BAKING'
				}
			],
			levels: [
				{ price: 220, name: 'Backhaus' },
				{ price: 400, name: 'Bäckerei' }
			]
		},
		{
			optionId: 2,
			initialName: 'Schmiede',
			type: 'CRAFT',
			description: 'Schmiedet aus Erz das Eisen, das ein Haus zusammenhält.',
			limited: false,
			limitedTo: 0,
			actions: ['WORK'],
			skill: 'SMITHING',
			// Seit 4.10 hat sie ein Rezept. Bis dahin war sie ein Arbeitsplatz ohne Werk:
			// Man konnte dort Lohn verdienen, aber es entstand nichts.
			recipes: [
				{
					input: [{ itemId: 'ORE', quantity: 3 }],
					outputItemId: 'IRON',
					baseOutput: 1,
					actionPointCost: 1,
					skill: 'SMITHING'
				}
			],
			levels: [
				{ price: 250, name: 'Schmiede', wagePerActionPoint: 3 },
				{ price: 400, name: 'Werkstatt', wagePerActionPoint: 5 },
				{ price: 900, name: 'Betrieb', wagePerActionPoint: 8 }
			]
		}
	];
}

export function getBuildingOption(optionId: number): BuildingTemplate | undefined {
	return getBuildingOptions().find((option) => option.optionId === optionId);
}

/**
 * Ist das Limit für diese Gebäudeart erreicht?
 *
 * Gezählt wird **je Stadt**, nicht je Welt: Ein Rathaus gehört in jede Stadt, nicht
 * einmal in die ganze Welt. Die Region ergibt sich aus dem Grundstück, auf dem das
 * Gebäude steht — Bauwerke ohne Grundstück (eine Stadtmauer etwa) zählen nicht mit, sie
 * bekommen ihre eigene Regel, sobald es sie gibt.
 */
export async function limitReached(
	option: BuildingTemplate,
	regionId: string,
	transaction?: Transaction
): Promise<boolean> {
	if (!option.limited) return false;
	const vorhanden = await BuildingModel.count({
		where: { optionId: option.optionId },
		include: [{ model: PlotModel, as: 'plot', where: { RegionId: regionId }, required: true }],
		transaction
	});
	return vorhanden >= option.limitedTo;
}

export type BuildResult =
	| { ok: true; building: Building }
	// `missing` sagt, **was** fehlt: „Das hast du nicht" ist keine Auskunft, wenn drei
	// Waren gebraucht werden.
	| { ok: false; reason: ActionFailureReason; missing?: MaterialNeed[] };

/**
 * Errichtet ein Gebäude auf einem eigenen, freien Grundstück.
 *
 * Alles in **einer** Transaktion mit Sperre auf die Charakterzeile: Geld abziehen und
 * Gebäude anlegen, oder keins von beidem. Ohne sie könnten zwei gleichzeitige Requests
 * dieselben Münzen zweimal ausgeben — das klassische Loch in Browserspielen, und es
 * betrifft nicht nur den Gebäudekauf, sondern jede Handlung, die Ressourcen verbraucht.
 */
export async function build(
	option: BuildingTemplate,
	characterId: string,
	plotId: string
): Promise<BuildResult> {
	// Öffentliche Bauten gehören der Stadt und entstehen aus ihrer Kasse — der Weg dafür
	// ist `buildPublicBuilding()` und setzt das Amt voraus. Ohne diese Schranke baute sich
	// ein Spieler ein privates Rathaus, und weil es je Stadt nur eines geben darf, bekäme
	// die Stadt nie ihr eigenes: Die Wahl hinge am Wohlwollen eines Hauses.
	if (option.type === 'PUBLIC') {
		return { ok: false, reason: 'NOT_IN_OFFICE' };
	}

	const tick = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const bauherr = await characterService.loadForAction(characterId, tick, t);
		if (!bauherr) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		const grundstück = await PlotModel.findByPk(plotId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!grundstück) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		const schonBebaut = await BuildingModel.count({ where: { PlotId: plotId }, transaction: t });
		const grenzeErreicht = await limitReached(option, grundstück.dataValues.RegionId, t);

		const ergebnis = buildLogic(
			{ id: characterId, money: bauherr.dataValues.money },
			{
				ownerCharacterId: grundstück.dataValues.OwnerCharacterId,
				regionId: grundstück.dataValues.RegionId,
				hasBuilding: schonBebaut > 0
			},
			option,
			grenzeErreicht
		);
		if (!ergebnis.ok) return ergebnis;

		// **Ein Haus besteht nicht aus Münzen.** Seit 4.10 kostet der Bau auch Bretter,
		// Quader und Eisen — wer keine hat, kauft sie beim Zimmerer. Geprüft wird nach dem
		// Geld und vor dem Anlegen: Der Bauherr soll nicht bezahlt haben und dann am
		// fehlenden Brett scheitern.
		// Wer die Kette selbst in Gang setzt, braucht sie noch nicht (siehe
		// `producesBuildingMaterial`).
		const bedarf = option.recipes?.some((rezept) => producesBuildingMaterial(rezept.outputItemId))
			? []
			: materialFor(levelOf(option, 1).price, option.type);
		const fehlt = await materialAbziehen(characterId, bedarf, t);
		if (fehlt) {
			return { ok: false, reason: 'NOT_IN_STOCK', missing: fehlt } as const;
		}

		const angelegt = await BuildingModel.create(
			{
				id: randomUUID(),
				name: option.initialName,
				optionId: option.optionId,
				lastConditionTick: tick,
				PlotId: plotId,
				ownerType: 'CHARACTER',
				OwnerCharacterId: characterId
			},
			{ transaction: t }
		);

		await chronicleService.record(
			'BUILDING_BUILT',
			grundstück.dataValues.RegionId,
			tick,
			{ subjectId: characterId, buildingId: angelegt.dataValues.id },
			t
		);

		// **Wer sein Wohnhaus baut, zieht ein — mit Frau oder Mann.**
		//
		// Bis 4.14 galt das nur für Obdachlose: Wer in der städtischen Unterkunft wohnte,
		// blieb dort und ließ sein neues Haus leer stehen. Für NPCs war das fatal, denn sie
		// wohnen alle erst einmal in der Unterkunft — die Häuser entstanden, und die
		// Bevölkerung wuchs trotzdem nicht, weil Kinder am Wohnraum der **Mutter** hängen
		// (4.4). Deshalb zieht der Ehepartner mit: Man baut kein Haus, um allein darin zu
		// wohnen.
		const ziehtEin: boolean = option.type === 'RESIDENCE';
		await bauherr.update(
			{
				money: ergebnis.money,
				...(ziehtEin ? { HomeBuildingId: angelegt.dataValues.id } : {})
			},
			{ transaction: t }
		);
		if (ziehtEin && bauherr.dataValues.spouseId) {
			await CharacterModel.update(
				{ HomeBuildingId: angelegt.dataValues.id },
				{ where: { id: bauherr.dataValues.spouseId }, transaction: t }
			);
			// Für den Bauherrn sagt `BUILDING_BUILT` schon alles — wer ein Haus baut, wohnt
			// darin. Für den Ehepartner hielte das niemand fest, und für ihn ist es der
			// Umzug seines Lebens.
			await chronicleService.recordMoveIn(
				bauherr.dataValues.spouseId,
				angelegt.dataValues.id,
				tick,
				t
			);
		}

		return { ok: true, building: convertToBuilding(angelegt.dataValues) } as const;
	});
}

/**
 * Der Zustand, wie er jetzt ist — und die Ruine, falls er aufgebraucht ist.
 *
 * **Diese Prüfung muss an jeder Ladestelle greifen**, nicht nur auf der Gebäudeseite.
 * Sonst hinge es vom Zufall ab, wann ein Haus zusammenfällt: Ein Gebäude, das nur in
 * einer Liste auftaucht, bliebe ewig stehen, während dasselbe Gebäude beim direkten
 * Aufruf zur Ruine würde.
 *
 * Gibt `null` zurück, wenn das Gebäude dabei verschwunden ist.
 */
async function mitZustand(
	instanz: Model<BuildingAttributes, BuildingCreationAttributes>,
	tick: number
): Promise<Building | null> {
	const zustand: number = zustandVon(instanz, tick);

	// **Öffentliche Gebäude stürzen nicht ein.** Sie verfallen wie alles andere und werden
	// dabei immer nutzloser — aber sie verschwinden nicht. Der Unterschied hat einen
	// Grund: Ein eingestürztes Rathaus nähme der Stadt die Wahl, eine eingestürzte
	// Unterkunft setzte alle Obdachlosen auf die Straße, und beides wäre nicht
	// wiedergutzumachen, weil neu bauen niemand kann. Verwahrlost und herrichtbar ist die
	// Strafe für ein schlechtes Amt; unwiederbringlich zerstört wäre das Ende der Stadt.
	if (isRuin(zustand) && instanz.dataValues.ownerType !== 'CITY') {
		await zurRuineWerden(instanz);
		return null;
	}
	return { ...convertToBuilding(instanz.dataValues), condition: Math.round(zustand) };
}

/**
 * Der rechnerische Zustand einer Gebäudezeile.
 *
 * Seit 4.7c verfallen **auch öffentliche Gebäude**, nach derselben Regel wie private:
 * Der Zustand senkt den Ertrag, die Unterkunft bietet weniger Platz, die Schmiede zahlt
 * weniger. Damit hat der Bürgermeister eine Aufgabe und die Stadtkasse einen Zweck.
 * Bis dahin waren sie ausgenommen, weil es niemanden gab, der sie hätte instand setzen
 * können.
 *
 * **Der Hof einer Pacht verfällt nicht** (5.23, Punkt 69). Er ist kein Bauwerk, das
 * jemand pflegt, sondern gehört zur Fläche wie der Acker selbst — und `harvest` sagt über
 * den schon: „Ein Acker hat keinen Zustand wie ein Gebäude, er trägt immer voll."
 *
 * Ohne diese Ausnahme lief die Sache still schief, und im Messlauf war es zu sehen:
 * Zwischen Tick 1000 und 1250 verschwand „Hof am Eichwald 1" als Ruine. Die **Pacht blieb
 * bestehen** — sie hängt am Vertrag, nicht am Gebäude —, geerntet wurde weiter, aber der
 * Arbeitsplatz war weg, samt aller Knechte, und nirgends stand warum. Instandhaltung ist
 * sonst eine Entscheidung; hier war nie eine zu treffen, denn der Hof kam ungefragt und
 * kostenlos mit der Pacht.
 */
function zustandVon(
	instanz: Model<BuildingAttributes, BuildingCreationAttributes>,
	tick: number
): number {
	if (getBuildingOption(instanz.dataValues.optionId)?.type === 'EXTRACTION') return CONDITION_MAX;

	return currentCondition(instanz.dataValues.condition, instanz.dataValues.lastConditionTick, tick);
}

/**
 * Am Ende des Verfalls: Das Haus ist weg, das Grundstück bleibt.
 *
 * Genau so gibt die Welt Bauland zurück, ohne dass jemand eingreifen muss — ohne Ruinen
 * blockierten aufgegebene Häuser die Stadt für immer. Die Bewohner stehen danach ohne
 * Dach da; ihre Zeile bleibt, nur das Zuhause ist keines mehr.
 */
async function zurRuineWerden(
	instanz: Model<BuildingAttributes, BuildingCreationAttributes>
): Promise<void> {
	await sequelize.transaction(async (t: Transaction) => {
		// Ausdrücklich und nicht über den Fremdschlüssel: `ON DELETE SET NULL` gilt nur,
		// wenn die Datenbank Fremdschlüssel überhaupt durchsetzt — SQLite tut das nur mit
		// eingeschaltetem Pragma. Wer hier auf die Datenbank vertraut, bekommt Bewohner,
		// die in einem Haus wohnen, das es nicht mehr gibt.
		await CharacterModel.update(
			{ HomeBuildingId: null },
			{ where: { HomeBuildingId: instanz.dataValues.id }, transaction: t }
		);
		// Vor dem Löschen eintragen: Danach ist die Kennung des Gebäudes nirgends mehr
		// nachzuschlagen, und ein Haus, das spurlos verschwindet, ist keine Geschichte.
		const grundstueck = instanz.dataValues.PlotId
			? await PlotModel.findByPk(instanz.dataValues.PlotId, { transaction: t })
			: null;
		await chronicleService.record(
			'BUILDING_RUINED',
			grundstueck?.dataValues.RegionId ?? null,
			instanz.dataValues.lastConditionTick,
			{ buildingId: instanz.dataValues.id, subjectId: instanz.dataValues.OwnerCharacterId },
			t
		);
		await instanz.destroy({ transaction: t });
	});
}

export async function getBuilding(buildingId: string): Promise<Building | undefined> {
	const gefunden = await BuildingModel.findByPk(buildingId);
	if (!gefunden) return undefined;

	return (await mitZustand(gefunden, await worldService.currentTick())) ?? undefined;
}

/** In welcher Region ein Gebäude steht — über sein Grundstück. */
export async function getBuildingRegionId(buildingId: string): Promise<string | undefined> {
	const gefunden = await BuildingModel.findByPk(buildingId, {
		include: [{ model: PlotModel, as: 'plot' }]
	});
	const grundstück = gefunden?.get('plot') as { dataValues: { RegionId: string } } | undefined;
	return grundstück?.dataValues.RegionId;
}

/** Alle Gebäude einer Region — die Häuserzeile der Stadt. */
export async function getBuildingsInRegion(regionId: string): Promise<Building[]> {
	const alle = await BuildingModel.findAll({
		include: [{ model: PlotModel, as: 'plot', where: { RegionId: regionId }, required: true }]
	});
	return lebende(alle, await worldService.currentTick());
}

/** Was einem Charakter gehört. */
export async function getBuildingsOfCharacter(characterId: string): Promise<Building[]> {
	const alle = await BuildingModel.findAll({
		where: { OwnerCharacterId: characterId, ownerType: 'CHARACTER' }
	});
	return lebende(alle, await worldService.currentTick());
}

/** Wendet die Ruinen-Prüfung auf eine ganze Liste an. */
async function lebende(
	alle: Model<BuildingAttributes, BuildingCreationAttributes>[],
	tick: number
): Promise<Building[]> {
	const stehende: Building[] = [];
	for (const eintrag of alle) {
		const gebäude = await mitZustand(eintrag, tick);
		if (gebäude) stehende.push(gebäude);
	}
	return stehende;
}

// --- Instandhalten und ausbauen ------------------------------------------------------

export type MaintenanceResult =
	| { ok: true; spent: number }
	| { ok: false; reason: ActionFailureReason; missing?: MaterialNeed[] };

/**
 * Renovieren: Zustand auf Anfang, bezahlt nach dem, was fehlt.
 *
 * Wie jede Handlung mit Ressourcen: sperren, nachwachsen lassen, abrechnen. Nur der
 * Eigentümer darf — ein fremdes Haus zu renovieren wäre ein Geschenk, und Geschenke
 * gehören zu 4.6.
 */
/**
 * Wie viele noch in dieses Haus passen — `null`, wenn es kein Wohnraum ist.
 *
 * Stand bis 5.6 beim Familiendienst, weil die Empfängnis sie zuerst brauchte. Sie ist aber
 * eine Frage an das Gebäude und keine an die Familie, und seit der Einzug hier liegt, wäre
 * der alte Ort ein Ringschluss: Die Familie hängt ohnehin schon an den Gebäuden.
 */
export async function freierWohnraum(homeBuildingId: string | null): Promise<number | null> {
	if (!homeBuildingId) return null;

	const gebaeude = await BuildingModel.findByPk(homeBuildingId);
	if (!gebaeude) return null;

	const vorlage = getBuildingOption(gebaeude.dataValues.optionId);
	if (!vorlage) return null;
	const plaetze: number = residentsAt(vorlage, gebaeude.dataValues.level);
	if (plaetze === 0) return null;

	const bewohner: number = await CharacterModel.count({
		where: { HomeBuildingId: homeBuildingId, deathTick: null }
	});
	return Math.max(0, plaetze - bewohner);
}

/**
 * Unter ein Dach ziehen.
 *
 * **Bis 5.6 konnte das nur, wer selbst baute oder heiratete.** NPCs zogen längst in die
 * städtische Unterkunft — für einen Spieler gab es keinen Weg dorthin. Ein Neuling stand
 * damit vor der Wahl, hundertvierzig Münzen für Grundstück und Kate zusammenzuarbeiten
 * oder dauerhaft im Freien zu bleiben; und wessen Haus zur Ruine verfiel, dem half die
 * Unterkunft nicht, für die er als Bürger mitbezahlt hat.
 *
 * Dieselben Schranken wie bei den NPCs: Wohnraum muss es sein, ein Platz muss frei sein,
 * und es muss der Allgemeinheit oder einem selbst gehören. In ein fremdes Privathaus zieht
 * niemand ungefragt — Miete und Untermiete sind ein eigenes Thema.
 */
export async function moveInto(characterId: string, buildingId: string): Promise<BuildResult> {
	const tick: number = await worldService.currentTick();

	const bewohner = await CharacterModel.findByPk(characterId);
	if (!bewohner) return { ok: false, reason: 'NO_SUCH_PERSON' };
	if (bewohner.dataValues.HomeBuildingId === buildingId) {
		return { ok: false, reason: 'NOTHING_TO_DO' };
	}

	const gebäude = await BuildingModel.findByPk(buildingId);
	if (!gebäude) return { ok: false, reason: 'PLOT_NOT_OWNED' };

	const vorlage = getBuildingOption(gebäude.dataValues.optionId);
	if (!vorlage || residentsAt(vorlage, gebäude.dataValues.level) === 0) {
		return { ok: false, reason: 'NOT_A_WORKPLACE' };
	}

	const städtisch: boolean = gebäude.dataValues.ownerType === 'CITY';
	const eigenes: boolean = gebäude.dataValues.OwnerCharacterId === characterId;
	if (!städtisch && !eigenes) return { ok: false, reason: 'PLOT_NOT_OWNED' };

	// Nur in der eigenen Stadt: Solange es eine gibt, ist das eine Formalie — mit der
	// zweiten (Phase 8) wäre es der Unterschied zwischen Wohnen und Reisen.
	const grundstück = gebäude.dataValues.PlotId
		? await PlotModel.findByPk(gebäude.dataValues.PlotId)
		: null;
	if (grundstück && grundstück.dataValues.RegionId !== bewohner.dataValues.RegionId) {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}

	const platz: number | null = await freierWohnraum(buildingId);
	if (platz === null || platz <= 0) return { ok: false, reason: 'NO_ROOM' };

	await bewohner.update({ HomeBuildingId: buildingId });
	await chronicleService.recordMoveIn(characterId, buildingId, tick);

	return { ok: true, building: convertToBuilding(gebäude.dataValues) };
}

/**
 * Das erste Dach: der freie Platz, den die Stadt stellt.
 *
 * Dieselbe Suche, die ein NPC anstellt, wenn er obdachlos ist — nur wird sie hier einmal
 * beim Anlegen eines Charakters gerufen. Findet sich nichts, geschieht nichts: Eine volle
 * Unterkunft ist kein Fehler, sondern eine Stadt, die wachsen muss.
 */
export async function moveIntoFreeShelter(characterId: string): Promise<void> {
	const bewohner = await CharacterModel.findByPk(characterId);
	if (!bewohner || bewohner.dataValues.HomeBuildingId) return;

	const städtische = await BuildingModel.findAll({
		where: { ownerType: 'CITY' },
		include: [
			{
				model: PlotModel,
				as: 'plot',
				where: { RegionId: bewohner.dataValues.RegionId },
				required: true
			}
		]
	});

	for (const gebäude of städtische) {
		const platz: number | null = await freierWohnraum(gebäude.dataValues.id);
		if (platz !== null && platz > 0) {
			await moveInto(characterId, gebäude.dataValues.id);
			return;
		}
	}
}

/**
 * Ein Gebäude benennen.
 *
 * „Bäckerei" ist eine Gattung, „Zum goldenen Weck" ein Betrieb. Das kostet nichts an
 * Mechanik und gibt einer Stadt ihr Gesicht — und der Chronik Namen, die jemand gewählt
 * hat, statt einer Gattungsbezeichnung, die zwölfmal vorkommt.
 *
 * **Doppelte Namen sind erlaubt.** Zwei Bäckereien dürfen beide „Zum goldenen Weck"
 * heißen; wer das tut, verwirrt vor allem sich selbst. Eine Sperre dagegen müsste
 * stadtweit prüfen und brächte nichts, was die Kennung nicht schon leistet.
 */
export async function renameBuilding(
	characterId: string,
	buildingId: string,
	wunsch: string
): Promise<NameCheck> {
	const gebäude = await BuildingModel.findByPk(buildingId);
	// Nur der Eigentümer, und nur bei privaten Bauten: Über das Rathaus verfügt niemand,
	// auch der Bürgermeister nicht — sein Name ist der der Stadt.
	if (
		!gebäude ||
		gebäude.dataValues.ownerType !== 'CHARACTER' ||
		gebäude.dataValues.OwnerCharacterId !== characterId
	) {
		return { ok: false, reason: 'NOT_YOURS' };
	}

	const geprueft = checkName(wunsch);
	if (!geprueft.ok) return geprueft;

	await gebäude.update({ name: geprueft.name });
	return geprueft;
}

export async function renovateBuilding(
	characterId: string,
	buildingId: string
): Promise<MaintenanceResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const gebäude = await BuildingModel.findByPk(buildingId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!gebäude || gebäude.dataValues.OwnerCharacterId !== characterId) {
			return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;
		}

		const eigentümer = await characterService.loadForAction(characterId, tick, t);
		if (!eigentümer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const zustand: number = zustandVon(gebäude, tick);
		const ergebnis = renovate(
			{
				actionPoints: eigentümer.dataValues.actionPoints,
				money: eigentümer.dataValues.money,
				buildingSkill: await skillService.getLevel(characterId, 'CONSTRUCTION', t)
			},
			zustand,
			seasonOf(tick)
		);
		if (!ergebnis.ok) return ergebnis;

		// Auch das Herrichten braucht Holz — weniger als ein Neubau, aber nicht nichts.
		const fehlt = await materialAbziehen(
			characterId,
			renovationMaterial(Math.ceil(CONDITION_MAX - zustand)),
			t
		);
		if (fehlt) return { ok: false, reason: 'NOT_IN_STOCK', missing: fehlt } as const;

		await eigentümer.update(
			{ actionPoints: ergebnis.actionPoints, money: ergebnis.money },
			{ transaction: t }
		);
		// `lastConditionTick` mitschreiben: Ohne ihn liefe der Verfall ab dem alten
		// Stichtag weiter und die Renovierung wäre im selben Moment wieder verbraucht.
		await gebäude.update(
			{ condition: ergebnis.condition, lastConditionTick: tick },
			{ transaction: t }
		);
		// Renovieren schult das Bauen — vier Aktionspunkte, vier Uebungen.
		await skillService.addPractice(characterId, 'CONSTRUCTION', RENOVATION_ACTION_POINT_COST, t);
		return { ok: true, spent: ergebnis.spent } as const;
	});
}

/** Eine Ausbaustufe höher — aus der Kate ein Haus. */
export async function upgradeBuilding(
	characterId: string,
	buildingId: string
): Promise<MaintenanceResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const gebäude = await BuildingModel.findByPk(buildingId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!gebäude || gebäude.dataValues.OwnerCharacterId !== characterId) {
			return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;
		}
		const vorlage = getBuildingOption(gebäude.dataValues.optionId);
		if (!vorlage) return { ok: false, reason: 'NOTHING_TO_DO' } as const;

		const eigentümer = await characterService.loadForAction(characterId, tick, t);
		if (!eigentümer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const ergebnis = upgrade(
			{
				actionPoints: eigentümer.dataValues.actionPoints,
				money: eigentümer.dataValues.money
			},
			vorlage,
			gebäude.dataValues.level,
			seasonOf(tick)
		);
		if (!ergebnis.ok) return ergebnis;

		await eigentümer.update(
			{ actionPoints: ergebnis.actionPoints, money: ergebnis.money },
			{ transaction: t }
		);
		// Der Zustand bleibt, wie er war — ein Anbau macht das alte Gemäuer nicht neu.
		// Deshalb wird hier auch `lastConditionTick` nicht angefasst.
		await gebäude.update({ level: ergebnis.level }, { transaction: t });
		await skillService.addPractice(characterId, 'CONSTRUCTION', UPGRADE_ACTION_POINT_COST, t);
		return { ok: true, spent: ergebnis.spent } as const;
	});
}

// --- Handel --------------------------------------------------------------------------

/** Ein Preisschild anhängen — oder abnehmen, mit `null`. */
export async function setBuildingPrice(
	characterId: string,
	buildingId: string,
	price: number | null
): Promise<MaintenanceResult> {
	const gebäude = await BuildingModel.findByPk(buildingId);
	if (!gebäude || gebäude.dataValues.OwnerCharacterId !== characterId) {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}
	await gebäude.update({ forSalePrice: price });
	return { ok: true, spent: 0 };
}

/**
 * Ein Gebäude kaufen, das jemand zum Verkauf gestellt hat.
 *
 * Das Geld wechselt zwischen zwei Charakteren — anders als beim Erstverkauf von Bauland,
 * wo es an die Stadt geht. Das Grundstück darunter wechselt **mit**: Ein Haus auf
 * fremdem Boden wäre ein Pachtverhältnis, und das ist ein eigenes Ding (4.6).
 */
export async function buyBuilding(
	characterId: string,
	buildingId: string
): Promise<MaintenanceResult> {
	const tick: number = await worldService.currentTick();

	return sequelize.transaction(async (t: Transaction) => {
		const gebäude = await BuildingModel.findByPk(buildingId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!gebäude) return { ok: false, reason: 'NOT_FOR_SALE' } as const;

		const käufer = await characterService.loadForAction(characterId, tick, t);
		if (!käufer) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		const ergebnis = purchase(
			{ id: characterId, money: käufer.dataValues.money },
			{
				ownerId: gebäude.dataValues.OwnerCharacterId,
				forSalePrice: gebäude.dataValues.forSalePrice
			}
		);
		if (!ergebnis.ok) return ergebnis;

		const verkäuferId: string | null = gebäude.dataValues.OwnerCharacterId;
		await käufer.update({ money: ergebnis.buyerMoney }, { transaction: t });
		if (verkäuferId) {
			await CharacterModel.increment('money', {
				by: ergebnis.price,
				where: { id: verkäuferId },
				transaction: t
			});
		}

		await gebäude.update(
			{ OwnerCharacterId: characterId, ownerType: 'CHARACTER', forSalePrice: null },
			{ transaction: t }
		);
		if (gebäude.dataValues.PlotId) {
			await PlotModel.update(
				{ OwnerCharacterId: characterId, ownerType: 'CHARACTER', forSalePrice: null },
				{ where: { id: gebäude.dataValues.PlotId }, transaction: t }
			);
		}
		return { ok: true, spent: ergebnis.price } as const;
	});
}

/** Was in dieser Stadt zum Verkauf steht. */
export async function getBuildingsForSale(regionId: string): Promise<Building[]> {
	const alle = await BuildingModel.findAll({
		where: { ownerType: 'CHARACTER', forSalePrice: { [Op.ne]: null } },
		include: [{ model: PlotModel, as: 'plot', where: { RegionId: regionId }, required: true }]
	});
	return lebende(alle, await worldService.currentTick());
}

/**
 * Ein öffentliches Gebäude herrichten — die erste Amtshandlung mit Kosten.
 *
 * **Der Bürgermeister setzt seine Zeit ein, die Stadt ihr Geld.** Die Aktionspunkte
 * kommen von ihm, weil auch das Beauftragen von Handwerkern ein Tag Arbeit ist; die
 * Münzen kommen aus der Stadtkasse, weil es ihr Haus ist. Damit hat das Amt zum ersten
 * Mal einen Ausgabengrund — und die Stadtkasse einen Zweck jenseits des Hortens.
 *
 * Sein Bau-Können zählt dabei mit, wie bei jeder Renovierung: Ein Bürgermeister, der das
 * Handwerk versteht, bekommt für dasselbe Geld mehr.
 */
export async function renovatePublicBuilding(
	characterId: string,
	buildingId: string
): Promise<MaintenanceResult> {
	const tick: number = await worldService.currentTick();
	const gebäudeZeile = await BuildingModel.findByPk(buildingId);
	if (!gebäudeZeile || gebäudeZeile.dataValues.ownerType !== 'CITY') {
		return { ok: false, reason: 'PLOT_NOT_OWNED' };
	}

	// Ein Bauwerk ohne Grundstück (eine Stadtmauer etwa) gehört keiner Stadt und kann
	// deshalb auch nicht aus ihrer Kasse hergerichtet werden.
	const plotId: string | null = gebäudeZeile.dataValues.PlotId;
	if (!plotId) return { ok: false, reason: 'PLOT_NOT_OWNED' };

	const grundstueck = await PlotModel.findByPk(plotId);
	const regionId: string | undefined = grundstueck?.dataValues.RegionId;
	if (!regionId) return { ok: false, reason: 'PLOT_NOT_OWNED' };

	// Der Amtsinhaber wird gerechnet, nicht gespeichert (4.7a) — hier wird er gefragt.
	const inhaber = await electionService.getHolder(regionId);
	if (inhaber?.characterId !== characterId) return { ok: false, reason: 'NOT_IN_OFFICE' };

	return sequelize.transaction(async (t: Transaction) => {
		const gebäude = await BuildingModel.findByPk(buildingId, {
			transaction: t,
			lock: t.LOCK.UPDATE
		});
		if (!gebäude) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		const stadt = await RegionModel.findByPk(regionId, { transaction: t, lock: t.LOCK.UPDATE });
		if (!stadt) return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;

		const amtsperson = await characterService.loadForAction(characterId, tick, t);
		if (!amtsperson) return { ok: false, reason: 'NO_SUCH_PERSON' } as const;

		// Dieselbe Rechnung wie bei einem privaten Haus — nur zahlt eine andere Kasse.
		const ergebnis = renovate(
			{
				actionPoints: amtsperson.dataValues.actionPoints,
				money: stadt.dataValues.treasury ?? 0,
				buildingSkill: await skillService.getLevel(characterId, 'CONSTRUCTION', t)
			},
			zustandVon(gebäude, tick),
			seasonOf(tick)
		);
		if (!ergebnis.ok) return ergebnis;

		await amtsperson.update({ actionPoints: ergebnis.actionPoints }, { transaction: t });
		await stadt.update({ treasury: ergebnis.money }, { transaction: t });
		await gebäude.update(
			{ condition: ergebnis.condition, lastConditionTick: tick },
			{ transaction: t }
		);
		await skillService.addPractice(characterId, 'CONSTRUCTION', RENOVATION_ACTION_POINT_COST, t);
		await chronicleService.record(
			'BUILDING_RENOVATED',
			regionId,
			tick,
			{ subjectId: characterId, buildingId, value: ergebnis.spent },
			t
		);
		return { ok: true, spent: ergebnis.spent } as const;
	});
}

/**
 * Was die Stadt an Häusern hat und wie es darum steht — die Liste für das Rathaus.
 *
 * Ohne sie fiele der Verfall erst auf, wenn die Unterkunft niemanden mehr aufnimmt.
 */
export async function getPublicBuildings(regionId: string): Promise<Building[]> {
	const alle = await getBuildingsInRegion(regionId);
	return alle.filter((haus) => haus.ownerType === 'CITY');
}

/**
 * Ein öffentliches Gebäude errichten — die zweite Amtshandlung mit Kosten.
 *
 * Auf einem Grundstück, das der Stadt gehört und noch frei ist, bezahlt aus der
 * Stadtkasse. Damit hat das Amt neben der Instandhaltung auch etwas zu **schaffen**, und
 * die Stadtkasse ist kein Sparstrumpf mehr.
 *
 * Nur öffentliche Vorlagen: Ein Bürgermeister, der auf Stadtkosten eine Bäckerei baut,
 * hätte sich einen Betrieb geschenkt, den er nicht bezahlt hat.
 */
export async function buildPublicBuilding(
	characterId: string,
	optionId: number,
	plotId: string
): Promise<BuildResult> {
	const tick: number = await worldService.currentTick();
	const vorlage = getBuildingOption(optionId);
	if (!vorlage || vorlage.type !== 'PUBLIC') return { ok: false, reason: 'NOT_FOR_SALE' };

	return sequelize.transaction(async (t: Transaction) => {
		const grundstueck = await PlotModel.findByPk(plotId, { transaction: t, lock: t.LOCK.UPDATE });
		// Eigener Grund oder herrenloser — fremder nie. Ein Bürgermeister, der auf dem
		// Grundstück eines anderen Hauses baute, wäre eine Enteignung, und die braucht
		// mehr als eine Amtshandlung.
		if (!grundstueck || grundstueck.dataValues.ownerType === 'CHARACTER') {
			return { ok: false, reason: 'PLOT_NOT_OWNED' } as const;
		}

		const regionId: string = grundstueck.dataValues.RegionId;
		const inhaber = await electionService.getHolder(regionId);
		if (inhaber?.characterId !== characterId)
			return { ok: false, reason: 'NOT_IN_OFFICE' } as const;

		const schonBebaut = await BuildingModel.count({ where: { PlotId: plotId }, transaction: t });
		if (schonBebaut > 0) return { ok: false, reason: 'PLOT_ALREADY_BUILT' } as const;
		if (await limitReached(vorlage, regionId, t)) {
			return { ok: false, reason: 'LIMIT_REACHED' } as const;
		}

		const stadt = await RegionModel.findByPk(regionId, { transaction: t, lock: t.LOCK.UPDATE });
		const kasse: number = stadt?.dataValues.treasury ?? 0;
		const preis: number = levelOf(vorlage, 1).price;
		if (kasse < preis) return { ok: false, reason: 'NOT_ENOUGH_MONEY' } as const;

		await stadt!.update({ treasury: kasse - preis }, { transaction: t });
		// Herrenloser Grund wird mit dem Bau zu staedtischem: Er ist vergeben, nur eben an
		// die Allgemeinheit — dieselbe Regel wie beim Seed.
		if (grundstueck.dataValues.ownerType !== 'CITY') {
			await grundstueck.update({ ownerType: 'CITY' }, { transaction: t });
		}
		const angelegt = await BuildingModel.create(
			{
				id: randomUUID(),
				name: vorlage.initialName,
				optionId,
				lastConditionTick: tick,
				PlotId: plotId,
				ownerType: 'CITY'
			},
			{ transaction: t }
		);
		await chronicleService.record(
			'BUILDING_BUILT',
			regionId,
			tick,
			{ subjectId: characterId, buildingId: angelegt.dataValues.id },
			t
		);
		return { ok: true, building: convertToBuilding(angelegt.dataValues) } as const;
	});
}

/**
 * Worauf ein Bürgermeister bauen könnte.
 *
 * Städtischer Grund **und** herrenloser: Was innerhalb der Stadt niemandem gehört, steht
 * der Allgemeinheit offen. Ohne das könnte kein Bürgermeister je etwas errichten — die
 * vier Plätze am Markt sind vom ersten Tag an bebaut, und alles andere ist unverkauftes
 * Bauland.
 *
 * Das ist eine Verteilungsentscheidung mit Widerstand: Jedes Grundstück, das die Stadt
 * bebaut, kann kein Spieler mehr kaufen. Genau darüber soll gestritten werden.
 */
export async function getFreeCityPlots(
	regionId: string
): Promise<{ id: string; address: string }[]> {
	const flaechen = await PlotModel.findAll({
		where: { RegionId: regionId, ownerType: { [Op.in]: ['CITY', 'NONE'] } }
	});

	const frei: { id: string; address: string }[] = [];
	for (const flaeche of flaechen) {
		const bebaut = await BuildingModel.count({ where: { PlotId: flaeche.dataValues.id } });
		if (bebaut === 0) {
			frei.push({ id: flaeche.dataValues.id, address: flaeche.dataValues.address });
		}
	}
	return frei;
}

/**
 * Ab welchem Zustand ein NPC-Bürgermeister von sich aus herrichten lässt.
 *
 * Bei der Hälfte: früh genug, dass die Stadt nie wirklich verwahrlost, spät genug, dass
 * die Kasse nicht für ein paar Kratzer geplündert wird.
 */
export const MAYOR_MAINTAINS_BELOW = 50;

/**
 * Der Amtsinhaber kümmert sich — sofern er ein NPC ist.
 *
 * **Ohne das verfiele jede Stadt, in der gerade kein Spieler regiert.** Und das wäre der
 * Normalfall: Die Welt läuft weiter, wenn niemand zusieht, und ein NPC-Bürgermeister, der
 * seine Stadt zusehends verrotten lässt, wäre kein Amtsinhaber, sondern eine Kulisse.
 *
 * Ein Spieler im Amt bekommt diese Hilfe **nicht**: Er soll es selbst tun, sonst wäre die
 * Amtshandlung nur eine Schaltfläche, die etwas erledigt, das ohnehin passiert.
 */
// Die Weltzeit liest `renovatePublicBuilding` selbst — hier braucht es sie nicht.
export async function maintainAsNpcMayor(
	regionId: string
): Promise<{ building: string; spent: number } | undefined> {
	const inhaber = await electionService.getHolder(regionId);
	if (!inhaber) return undefined;

	const amtsperson = await CharacterModel.findByPk(inhaber.characterId);
	if (!amtsperson || amtsperson.dataValues.role !== 'NPC') return undefined;

	// Das schlechteste zuerst: Wer wenig Geld hat, soll es dort einsetzen, wo es am
	// meisten fehlt.
	const oeffentliche = await getPublicBuildings(regionId);
	const schlechtestes = oeffentliche
		.filter((haus) => haus.condition < MAYOR_MAINTAINS_BELOW)
		.sort((a, b) => a.condition - b.condition)[0];
	if (!schlechtestes) return undefined;

	const ergebnis = await renovatePublicBuilding(inhaber.characterId, schlechtestes.id);
	if (!ergebnis.ok) return undefined;
	return { building: schlechtestes.name, spent: ergebnis.spent };
}

// --- Baumaterial ---------------------------------------------------------------------

/**
 * Material aus der Kammer nehmen — oder sagen, was fehlt.
 *
 * **Aus allem, was dem Bauherrn gehört** (5.25, Punkt 72) — Kammer und eigene Häuser.
 * Bis dahin zählte nur der persönliche Vorrat, mit der Begründung, der Bauherr schleppe
 * sein Holz selbst herbei. Das stimmte, solange jedes Erzeugnis in der Kammer landete;
 * seit es im Betrieb bleibt, hieße es, dass ein Zimmerer die eigenen Bretter nicht
 * verbauen darf, die in seiner eigenen Werkstatt liegen.
 *
 * **Fremdes bleibt fremd:** `getOwnedStock` sieht nur in Häuser, die ihm gehören. Wer
 * nichts hat, kauft weiterhin beim Zimmerer — genau dafür gibt es ihn.
 *
 * Gibt `undefined` zurück, wenn es gereicht hat, sonst die Fehlmenge.
 */
async function materialAbziehen(
	characterId: string,
	bedarf: MaterialNeed[],
	t: Transaction
): Promise<MaterialNeed[] | undefined> {
	if (bedarf.length === 0) return undefined;

	const fehlt: MaterialNeed[] = missingMaterial(
		bedarf,
		await tradeService.getOwnedStock(characterId)
	);
	if (fehlt.length > 0) return fehlt;

	for (const posten of bedarf) {
		// Kammer zuerst, dann die Häuser — dieselbe Reihenfolge wie beim Herstellen.
		await tradeService.consumeOwned(characterId, posten.itemId, posten.quantity, t);
	}
	return undefined;
}

/** Was ein Bau oder eine Renovierung an Material kostet — für die Anzeige. */
export function materialForBuilding(price: number): MaterialNeed[] {
	return materialFor(price);
}

export function materialForRenovation(missingCondition: number): MaterialNeed[] {
	return renovationMaterial(missingCondition);
}
