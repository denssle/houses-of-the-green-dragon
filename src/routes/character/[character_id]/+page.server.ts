import * as chronicleService from '$lib/server/service/chronicleService';
import { chronicleParts } from '$lib/chronicleMessage';
import { nameMessage } from '$lib/actionMessage';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as characterService from '$lib/server/service/characterService';
import * as dynastyService from '$lib/server/service/dynastyService';
import * as buildingService from '$lib/server/service/buildingService';
import * as lifecycleService from '$lib/server/service/lifecycleService';
import * as nameService from '$lib/server/service/nameService';
import * as needService from '$lib/server/service/needService';
import * as skillService from '$lib/server/service/skillService';
import * as plotService from '$lib/server/service/plotService';
import * as regionService from '$lib/server/service/regionService';
import * as worldService from '$lib/server/service/worldService';
import { deathProbabilityPerYear } from '$lib/game/mortality.logic';
import { fullName } from '$lib/game/naming.logic';
import { personalityLabel } from '$lib/game/personality.logic';
import { ageInYears, yearOf } from '$lib/game/time';
import type { Character } from '$lib/model/character';

/**
 * Die Seite einer Person — der eigenen oder einer fremden.
 *
 * **Bis hierher zeigte sie immer den eigenen Charakter**, ganz gleich, welche Kennung in
 * der Adresse stand. Alle Verweise aus Chronik und Rathaus führten damit ins Leere: Man
 * klickte auf „Alheid" und sah sich selbst. Jetzt entscheidet der Parameter, wer gezeigt
 * wird.
 *
 * **Nicht alles geht jeden an.** Was auf der Gasse sichtbar wäre, steht auch hier: Alter,
 * Aufenthalt, Familie, Wohnhaus, Besitz, Können, was die Chronik über jemanden festhält.
 * Was in seiner Truhe liegt, nicht: Geld, Aktionspunkte, Sättigung. Das ist keine
 * Geheimniskrämerei, sondern dieselbe Grenze, die auch das Spiel zieht — wer wissen will,
 * wie es einem anderen geht, muss ihn besuchen.
 *
 * **Und diese Grenze zieht der Server, nicht die Anzeige** (5.22). Bis dahin verbarg
 * allein ein `{#if data.self}` im Markup, was nicht jeden angeht — geliefert wurde der
 * vollständige Charakter, samt Geld und Aktionspunkten. Wer die Seite eines Mitspielers
 * aufrief, bekam beides mit, sichtbar in den Daten hinter der Seite. Dieselbe Sorte
 * Fehler, die Punkt 25 schon einmal an anderer Stelle fand: eine Freigabe, die für die
 * Anzeige gilt und für die Daten nicht.
 *
 * Das war nicht nur ein gebrochenes Versprechen der Datenschutzerklärung, sondern ein
 * Spielvorteil: Wer den Beutel seines Gegenübers kennt, weiß bei jeder Versteigerung, wie
 * weit er gehen kann.
 */

/**
 * Was von einer fremden Person nach draußen geht.
 *
 * Eine **Positivliste**, keine Streichung: Wer Felder entfernt, vergisst das nächste, das
 * hinzukommt. So muss jedes neue Feld einmal bewusst freigegeben werden, und die
 * Voreinstellung ist Schweigen.
 */
function wieAufDerGasse(
	person: Character
): Pick<Character, 'id' | 'firstName' | 'title' | 'deathTick' | 'pregnantSinceTick'> {
	return {
		id: person.id,
		firstName: person.firstName,
		title: person.title,
		deathTick: person.deathTick,
		// Eine Schwangerschaft sieht man — das ist der Sinn der Anzeige.
		pregnantSinceTick: person.pregnantSinceTick
	};
}
export const load: PageServerLoad = async ({ locals, params }) => {
	const eigener = locals.currentCharacter;
	const gezeigt =
		eigener && eigener.id === params.character_id
			? eigener
			: await characterService.getCharacter(params.character_id);

	if (!gezeigt) {
		error(404, 'Diese Person kennt hier niemand');
	}

	// Der Vergleich läuft über die Kennung und nicht über die Objektgleichheit: Der eigene
	// Charakter kommt aus `locals`, ein fremder aus der Datenbank.
	const selbst: boolean = eigener?.id === gezeigt.id;

	const jetzt: number = await worldService.currentTick();
	const alter: number = ageInYears(gezeigt.birthTick, jetzt);
	const zuhause = gezeigt.homeBuildingId
		? await buildingService.getBuilding(gezeigt.homeBuildingId)
		: undefined;

	// Das Haus gibt den Nachnamen (5.10) — und steht als eigene Angabe daneben, weil es
	// mehr ist als ein Namensbestandteil: Wer zu welchem Haus gehört, entscheidet über
	// Erbfolge, Fehden und Zuneigung.
	const haus = gezeigt.dynastyId ? await dynastyService.getDynasty(gezeigt.dynastyId) : undefined;
	const gatte = gezeigt.spouseId
		? await characterService.getCharacter(gezeigt.spouseId)
		: undefined;

	return {
		// **Nur die eigene Person geht vollständig heraus.** Bei jeder anderen bleibt am
		// Server, was in ihrer Truhe liegt.
		character: selbst ? gezeigt : wieAufDerGasse(gezeigt),
		house: haus ? { id: haus.id, name: haus.name } : undefined,
		displayName: fullName(gezeigt.firstName, haus?.name),
		self: selbst,
		age: alter,
		// Wer tot ist, soll nicht lebendig wirken: Ein Verweis aus der Chronik führt oft zu
		// jemandem, den es längst nicht mehr gibt.
		diedInYear: gezeigt.deathTick === null ? null : yearOf(gezeigt.deathTick),
		nature: personalityLabel(gezeigt.personality, gezeigt.gender),
		// Nicht die Zahl, sondern ob überhaupt eines besteht: Ein Prozentwert lüde dazu
		// ein, den Tod auszurechnen statt sich auf ihn vorzubereiten.
		mortal: deathProbabilityPerYear(alter) > 0,
		// **Die eigene Obergrenze, nicht die allgemeine.** Sie hängt am Dach (ein besseres
		// Haus trägt mehr Vorrat) und am Hunger — eine feste 48 daneben stünde für die
		// meisten schlicht falsch da, und der Ausbau, den man dafür bezahlt hat, wäre
		// nirgends abzulesen.
		maxActionPoints: await characterService.actionPointCeilingOf(gezeigt.id, jetzt),
		region: await regionService.getRegion(gezeigt.regionId),
		home: zuhause,
		plots: await plotService.getPlotsOfCharacter(gezeigt.id),
		buildings: await buildingService.getBuildingsOfCharacter(gezeigt.id),
		children: await lifecycleService.getChildren(gezeigt.id, jetzt),
		skills: await skillService.getSkills(gezeigt.id),
		// Sättigung ist eine Auskunft über den Zustand einer Truhe, nicht über einen
		// Menschen auf der Gasse.
		hunger: selbst ? await needService.getHunger(gezeigt.id, jetzt) : undefined,
		// **Was in der Truhe liegt, als eigenes Feld** — und nicht als Teil der Person.
		// Vorher stand es im Charakter und wurde erst im Markup verborgen; so verlässt es
		// den Server gar nicht erst, und der Typ sagt es jedem, der die Seite liest.
		purse: selbst ? { money: gezeigt.money, actionPoints: gezeigt.actionPoints } : undefined,
		// Der Ehepartner mit vollem Namen (5.10): Eine Ehe verbindet in aller Regel zwei
		// Häuser, und genau das soll dastehen.
		spouseName: await nameService.displayName(gezeigt.spouseId),
		// Auch hier nur, was auf der Gasse sichtbar wäre: Der Verweis braucht einen Namen
		// und eine Kennung, nicht den Beutel des Ehepartners.
		spouse: gatte ? wieAufDerGasse(gatte) : undefined,
		// Der Lebenslauf ist kein eigenes System, sondern die Chronik nach dieser Person
		// gefiltert: geboren, verheiratet, im Amt, gestorben.
		life: (await chronicleService.getChronicle({ characterId: gezeigt.id, limit: 12 })).map(
			(eintrag) => ({
				id: eintrag.id,
				parts: chronicleParts(eintrag),
				year: yearOf(eintrag.tick)
			})
		)
	};
};

export const actions = {
	/**
	 * Die Erbenwahl.
	 *
	 * Ausdrücklich ein POST auf die eigene Seite und nicht ein Link: Die App lädt Links
	 * beim Überfahren vor — ein `href`, der den Erben umschreibt, tut das schon, wenn die
	 * Maus darüberwandert.
	 */
	heir: async ({ request, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der etwas zu vererben hätte' });
		}

		const data = await request.formData();
		const heirId: string | null = data.get('heirId')?.toString() || null;

		if (!(await lifecycleService.designateHeir(locals.currentCharacter.id, heirId))) {
			return fail(400, { message: 'Nur ein eigenes lebendes Kind kann erben' });
		}
		return { message: heirId ? 'Der Erbe ist benannt.' : 'Die Benennung ist zurückgenommen.' };
	},

	/**
	 * Einem Kind seinen Namen geben.
	 *
	 * Die Welt hat bei der Geburt einen vergeben, weil sie nicht wartet; bis zur
	 * Volljährigkeit darf der Spieler ihn ändern.
	 */
	rename: async ({ request, locals }) => {
		if (!locals.currentCharacter) {
			return fail(401, { message: 'Kein Charakter, der etwas zu benennen hätte' });
		}

		const data = await request.formData();
		const childId = data.get('childId')?.toString();
		const wunsch = data.get('firstName')?.toString() ?? '';
		if (!childId) return fail(400, { message: 'Welches Kind denn?' });

		const ergebnis = await lifecycleService.renameChild(
			locals.currentCharacter.id,
			childId,
			wunsch,
			await worldService.currentTick()
		);
		if (!ergebnis.ok) return fail(400, { message: nameMessage(ergebnis.reason) });

		return { message: `Das Kind heißt jetzt ${ergebnis.name}.` };
	}
} satisfies Actions;
