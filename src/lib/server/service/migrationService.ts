import { randomUUID } from 'node:crypto';
import { type Transaction } from 'sequelize';
import { sequelize } from '$lib/db/sequelize';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import * as treasuryService from '$lib/server/service/treasuryService';
import { Skill } from '$lib/db/model/skill';
import { NEUGEBORENE } from '$lib/db/names';
import { HERKUNFT } from '$lib/db/names';
import { ARRIVAL_PROVISIONS, SATIETY_MAX } from '$lib/game/need.logic';
import { Inventory } from '$lib/db/model/inventory';
import {
	inheritPersonality,
	randomPersonality,
	type Personality
} from '$lib/game/personality.logic';
import { SKILL_TYPES, type SkillType } from '$lib/game/skill.logic';
import { AGE_OF_MAJORITY, ageInYears, TICKS_PER_YEAR } from '$lib/game/time';
import {
	type Ankoemmling,
	arrivalGifts,
	formOf,
	type Haushaltsform,
	planHousehold,
	type Rolle,
	skillToBring,
	settlementFee,
	someoneArrives,
	ZUZUG_EHRGEIZ,
	ZUZUG_FLEISS
} from '$lib/game/migration.logic';
import * as buildingService from '$lib/server/service/buildingService';
import * as chronicleService from '$lib/server/service/chronicleService';

/**
 * Zuzug: neue Seelen von außerhalb (Punkt 71).
 *
 * **Die Welt bekommt eine Tür.** Bis hierher war Grünau geschlossen — acht Gründer und
 * ihre Nachfahren, sonst niemand. Wer ankommt, bringt dreierlei mit, und jedes davon löst
 * etwas, das sich von innen nicht lösen ließ:
 *
 * - **Ein Handwerk** (Punkt 70). Fertigkeiten wachsen durch Tun, getan wird, wo ein
 *   Gebäude steht — also konnten alle schmieden und niemand backen. Wissen wandert mit den
 *   Handwerkern, und genau so kommt es jetzt in die Stadt.
 * - **Geld** (Punkt 66). Nicht aus dem Nichts, sondern aus einem Leben, das anderswo
 *   stattgefunden hat. Das ist der Unterschied zur Tagelöhnerei, die Münzen erschuf.
 * - **Sich selbst.** Eine Stadt, die schrumpft, hatte keine Erholung; jetzt hat sie eine.
 *
 * **Gebremst wird durch Wohnraum**, nicht durch eine Obergrenze: Ist die städtische
 * Unterkunft voll, kommt niemand mehr. Wer ankommt und nichts findet, zieht weiter — das
 * ist die stimmigere Regel und zugleich die, die eine Stadt nicht überlaufen lässt.
 */

/** Ein Mitglied eines ankommenden Haushalts (0.9.0). */
export interface ArrivalMember {
	characterId: string;
	name: string;
	rolle: Rolle;
	alter: number;
}

/** Wer angekommen ist — für die Chronik, das Log und die Tests. */
export interface Arrival {
	/** Der Hauptzuzügler: der Einzelne, oder der Mann eines Paars oder einer Familie. */
	characterId: string;
	name: string;
	house: string;
	skill: SkillType;
	/** Was alle zusammen mitgebracht haben, vor dem Einzugsgeld. */
	money: number;
	/** In welcher Gestalt sie kamen (0.9.0). */
	form: Haushaltsform;
	/** Alle, die ankamen — der Hauptzuzügler eingeschlossen (0.9.0). */
	members: ArrivalMember[];
}

/**
 * Ein Herzschlag Zuwanderung.
 *
 * Wird vom Welt-Takt gerufen. Gibt zurück, wer gekommen ist — oder nichts, was der
 * Normalfall ist.
 *
 * **`ticks` ist die Zeit, die die Weltuhr in diesem Schlag vorgerückt ist** (5.47). Nach
 * einem Neustart sind das mehrere Stunden auf einmal, und sie zählen mit: Sonst kostete
 * jeder Deploy der Stadt Ankünfte, weil hier nur einmal je Herzschlag gewürfelt wird.
 *
 * **Seit 0.9.0 kommt nicht immer einer allein**, sondern auch ein Paar, eine Familie oder
 * drei Generationen (`planHousehold`). Und wer allein kommt, kommt eher als das Geschlecht,
 * das der Stadt zum Heiraten fehlt (`arrivalGender`).
 */
export async function admitNewcomers(
	regionId: string,
	tick: number,
	roll: () => number = Math.random,
	ticks = 1
): Promise<Arrival | undefined> {
	const betten: number = await freieBetten(regionId);
	if (!someoneArrives(roll(), betten > 0, ticks)) return undefined;

	const plan: Ankoemmling[] = planHousehold(roll, betten, await ledigeErwachsene(regionId, tick));
	if (plan.length === 0) return undefined;
	const form: Haushaltsform = formOf(plan);

	const hausname: string = HERKUNFT[Math.floor(roll() * HERKUNFT.length)];
	const handwerke: SkillType[] = await handwerkeInDerStadt(regionId);

	/** Was jeder Einzelne mitbringt, ehe etwas angelegt wird — alle Würfe vorab. */
	const leute = plan.map((person) => {
		const erwachsen: boolean = person.alter >= AGE_OF_MAJORITY;
		const vorname: string =
			NEUGEBORENE[person.geschlecht][Math.floor(roll() * NEUGEBORENE[person.geschlecht].length)];
		// **Ein Handwerk je Erwachsenem, und möglichst ein anderes** — wer mit seiner Frau
		// ankommt, bringt nicht zweimal dasselbe Gewerbe in eine Stadt, der ein anderes fehlt.
		const koennen: SkillType | undefined = erwachsen
			? skillToBring(SKILL_TYPES, handwerke, roll())
			: undefined;
		if (koennen) handwerke.push(koennen);
		const gaben = arrivalGifts({ money: roll(), skill: roll(), age: roll() });
		return {
			...person,
			id: randomUUID(),
			vorname,
			erwachsen,
			koennen,
			stufe: gaben.skillLevel,
			// Kinder bringen kein eigenes Geld mit.
			geld: erwachsen ? gaben.money : 0
		};
	});
	const haupt = leute.find((p) => p.rolle === 'HAUPT')!;
	const partner = leute.find((p) => p.rolle === 'PARTNER');
	const opa = leute.find((p) => p.rolle === 'GROSSVATER');
	const oma = leute.find((p) => p.rolle === 'GROSSMUTTER');

	await sequelize.transaction(async (t: Transaction) => {
		// **Ein eigenes Haus** (5.10): Wer ankommt, gründet eine Linie. Ohne das hinge er
		// als Namenloser in der Welt, und jede Regel über Häuser ginge an ihm vorbei. Eine
		// Familie gründet eines, nicht fünf.
		const hausId = randomUUID();
		await Dynasty.create(
			{ id: hausId, name: hausname, UserId: null, foundedAtTick: tick },
			{ transaction: t }
		);

		/** Anlagen der Eltern, aus denen die Kinder erben. */
		const anlagen = new Map<string, Personality>();
		for (const person of leute) {
			if (person.rolle === 'KIND') continue;
			const gewuerfelt: Personality = randomPersonality(roll);
			// **Wer die Reise auf sich nimmt, hat etwas vor.** Ehrgeiz und Fleiß stehen
			// deshalb fest und werden nicht gewürfelt — dieselbe Entscheidung wie bei den
			// drei Gründern in `seed.ts`, und aus demselben Grund: Ob eine Stadt je einen
			// Betrieb bekommt, darf nicht am Würfel hängen. Das gilt für die, die den Umzug
			// beschlossen haben, nicht für die Großeltern, die mitkommen.
			if (person.rolle === 'HAUPT' || person.rolle === 'PARTNER') {
				gewuerfelt.ambition = ZUZUG_EHRGEIZ;
				gewuerfelt.diligence = ZUZUG_FLEISS;
			}
			anlagen.set(person.id, gewuerfelt);
		}
		for (const person of leute) {
			if (person.rolle !== 'KIND') continue;
			anlagen.set(
				person.id,
				inheritPersonality(partner ? anlagen.get(partner.id)! : null, anlagen.get(haupt.id)!, roll)
			);
		}

		/** Wer mit wem verheiratet ist und wer wessen Kind — die Familie als Familie. */
		const ehe = (id: string): string | null => {
			if (partner && id === haupt.id) return partner.id;
			if (partner && id === partner.id) return haupt.id;
			if (opa && oma && id === opa.id) return oma.id;
			if (opa && oma && id === oma.id) return opa.id;
			return null;
		};
		const eltern = (rolle: Rolle): { motherId: string | null; fatherId: string | null } => {
			if (rolle === 'KIND') return { motherId: partner?.id ?? null, fatherId: haupt.id };
			if (rolle === 'HAUPT') return { motherId: oma?.id ?? null, fatherId: opa?.id ?? null };
			return { motherId: null, fatherId: null };
		};

		for (const person of leute) {
			// **Abzüglich Einzugsgeld** (5.26): Wer sich niederlässt, zahlt der Stadt dafür.
			// Historisch der Normalfall — und hier die Einnahme, die eine junge Stadt am
			// dringendsten braucht, weil sie keine laufende Wirtschaft voraussetzt.
			const einzugsgeld: number = settlementFee(person.geld);
			await Character.create(
				{
					id: person.id,
					firstName: person.vorname,
					role: 'NPC',
					gender: person.geschlecht,
					birthTick: tick - person.alter * TICKS_PER_YEAR,
					lastTickProcessed: tick,
					// Wer ankommt, hat unterwegs gegessen.
					satiety: SATIETY_MAX,
					lastNeedTick: tick,
					actionPoints: 0,
					money: person.geld - einzugsgeld,
					RegionId: regionId,
					DynastyId: hausId,
					// **Der Tag der Ankunft** — daran hängt das Wahlrecht
					// (`CITIZENSHIP_AFTER_YEARS`). Ohne diese Frist gewänne eine Wahl, wer Leute
					// ansiedelt.
					arrivedTick: tick,
					...anlagen.get(person.id)!
				},
				{ transaction: t }
			);

			// **Das Handwerk, das er mitbringt** — der eigentliche Grund, warum ein Zuzug für
			// die Stadt etwas ändert (Punkt 70). `progress` bleibt bei null: Er kann es, er
			// steht nur nicht kurz vor der nächsten Stufe.
			if (person.koennen) {
				await Skill.create(
					{ CharacterId: person.id, type: person.koennen, level: person.stufe, progress: 0 },
					{ transaction: t }
				);
			}

			// **Und die Wegzehrung** (5.103, Punkt 85): Seit es keinen Kornspeicher mehr gibt,
			// verhungerte ein Zugezogener, der in seiner ersten Woche keine Arbeit fand,
			// neben einer Stadt voller Bäcker. Auch jedes Kind bekommt seine.
			await Inventory.create(
				{ CharacterId: person.id, itemId: 'BREAD', quantity: ARRIVAL_PROVISIONS },
				{ transaction: t }
			);

			// Das Einzugsgeld in die Stadtkasse — Geld wechselt den Besitzer, es entsteht nicht.
			if (einzugsgeld > 0) {
				await treasuryService.einnehmen(regionId, einzugsgeld, 'SETTLEMENT_FEE', t);
			}

			// **Der Zuzug gehört in die Chronik**, jede Person für sich. Der Hauptzuzügler
			// trägt die Größe des Haushalts, damit sich eine Familie als solche lesen lässt.
			await chronicleService.record(
				'ARRIVED',
				regionId,
				tick,
				{
					subjectId: person.id,
					dynastyId: hausId,
					detail: person.koennen ?? null,
					...(person.id === haupt.id && leute.length > 1 ? { value: leute.length } : {})
				},
				t
			);
		}

		// **Erst alle anlegen, dann verknüpfen** — Ehe und Abstammung verweisen auf Leute, die
		// es beim Anlegen des ersten noch nicht gibt.
		for (const person of leute) {
			const bande = { spouseId: ehe(person.id), ...eltern(person.rolle) };
			if (bande.spouseId || bande.motherId || bande.fatherId) {
				await Character.update(bande, { where: { id: person.id }, transaction: t });
			}
		}
	});

	// **Kinder ziehen sofort mit ein** (0.9.0). Erwachsene suchen sich ihr Bett selbst
	// (`MOVE_IN`); ein Kind kann das nicht, und ohne Dach hätte es keinen Haushalt.
	for (const person of leute) {
		if (!person.erwachsen) await buildingService.moveIntoFreeShelter(person.id);
	}

	return {
		characterId: haupt.id,
		name: haupt.vorname,
		house: hausname,
		skill: haupt.koennen ?? SKILL_TYPES[0],
		money: leute.reduce((summe, p) => summe + p.geld, 0),
		form,
		members: leute.map((p) => ({
			characterId: p.id,
			name: p.vorname,
			rolle: p.rolle,
			alter: p.alter
		}))
	};
}

/**
 * **Wer in der Stadt ledig und erwachsen ist** (0.9.0), nach Geschlecht. Nach ihnen richtet
 * sich, wer allein ankommt — und der Messbericht zählt damit den Heiratsmarkt.
 */
export async function ledigeErwachsene(
	regionId: string,
	tick: number
): Promise<{ maenner: number; frauen: number }> {
	const ledige = await Character.findAll({
		where: { RegionId: regionId, deathTick: null, spouseId: null },
		attributes: ['gender', 'birthTick']
	});
	let maenner = 0;
	let frauen = 0;
	for (const person of ledige) {
		if (ageInYears(person.dataValues.birthTick, tick) < AGE_OF_MAJORITY) continue;
		if (person.dataValues.gender === 'FEMALE') frauen++;
		else maenner++;
	}
	return { maenner, frauen };
}

/** Wie viele Betten die Stadt frei hat (0.9.0: eine Zahl, weil eine Familie mehrere braucht). */
async function freieBetten(regionId: string): Promise<number> {
	let frei = 0;
	for (const haus of await buildingService.getBuildingsInRegion(regionId)) {
		if (haus.ownerType !== 'CITY') continue;
		const platz: number | null = await buildingService.freierWohnraum(haus.id);
		if (platz !== null && platz > 0) frei += platz;
	}
	return frei;
}

/**
 * Welche Handwerke in dieser Stadt schon ausgeübt werden.
 *
 * Gefragt wird nach den **Gebäuden**, nicht nach den Fertigkeiten der Einwohner: Dass
 * jemand backen kann, nützt der Stadt nichts, solange kein Backhaus steht — und umgekehrt
 * ist ein Handwerk versorgt, sobald es einen Ort dafür gibt.
 */
async function handwerkeInDerStadt(regionId: string): Promise<SkillType[]> {
	const vorhanden: SkillType[] = [];
	for (const haus of await buildingService.getBuildingsInRegion(regionId)) {
		// **Nur, was in Bürgerhand ist** (5.75, Punkt 104). Dies ist derselbe Fehler wie in
		// Punkt 86, an einer zweiten Stelle: Die Städtische Schmiede trägt `SMITHING`, also
		// galt das Schmiedehandwerk als versorgt — und `skillToBring` bringt bevorzugt, was
		// **fehlt**. In zwei Messläufen über 2000 Ticks mit 51 Charakteren kam deshalb
		// `SMITHING` **kein einziges Mal** vor; es war das einzige Handwerk, das ein
		// städtisches Gebäude belegt, und damit das einzige, das nie zuzog.
		//
		// Ohne Schmied kein Eisen, ohne Eisen keine Mühle, keine Bäckerei, keine
		// Schneiderei und keine Alchemistenküche (Punkt 103). Eine Krücke der Stadt darf
		// einen Beruf nicht besetzen — sie soll ihn überbrücken, bis ihn jemand ergreift.
		if (haus.ownerType !== 'CHARACTER') continue;
		const koennen = buildingService.getBuildingOption(haus.optionId)?.skill;
		if (koennen && !vorhanden.includes(koennen)) vorhanden.push(koennen);
	}
	return vorhanden;
}
