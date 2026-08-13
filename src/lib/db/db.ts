import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertDatabaseCredentials, LOCAL_STORAGE_PATH, mode, sequelize } from '$lib/db/sequelize';
import { createMigrator } from '$lib/db/migrations';
import { seedWorld } from '$lib/db/seed';
import { Building } from '$lib/db/model/building';
import { Character } from '$lib/db/model/character';
import { Dynasty } from '$lib/db/model/dynasty';
import { DynastyRelationship } from '$lib/db/model/dynastyRelationship';
import { Plot } from '$lib/db/model/plot';
import { Region } from '$lib/db/model/region';
import { RegionLink } from '$lib/db/model/regionLink';
import { Relationship } from '$lib/db/model/relationship';
import { SessionToken } from '$lib/db/model/sessionToken';
import { Inventory } from '$lib/db/model/inventory';
import { Lease } from '$lib/db/model/lease';
import { Candidacy, Election, Vote } from '$lib/db/model/election';
import { Law } from '$lib/db/model/law';
import { Employment } from '$lib/db/model/employment';
import { BuildingStock, ShopOffer } from '$lib/db/model/shop';
import { Skill } from '$lib/db/model/skill';
import { User } from '$lib/db/model/user';
// Ohne Assoziationen, aber der Import muss sein: Nur registrierte Modelle legt `sync()`
// an. Fehlt er, kennt der Testlauf die Weltzeit nicht, während die Migration sie
// anlegt — genau die Drift, die `migrations.spec.ts` aufdeckt.
import '$lib/db/model/world';

// --- Wer gehört zu wem ---------------------------------------------------------------

// Eine Sitzung je Benutzer; meldet er sich ab oder verschwindet er, geht sie mit.
User.hasOne(SessionToken, { foreignKey: 'UserId', onDelete: 'CASCADE', as: 'session' });
SessionToken.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// Mehrere Dynastien je Benutzer über die Zeit, davon höchstens eine ohne `isExtinct`.
User.hasMany(Dynasty, { foreignKey: 'UserId', onDelete: 'CASCADE', as: 'dynasties' });
Dynasty.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// Fremd-NPCs gehören zu keinem Haus, deshalb SET NULL statt CASCADE: Stirbt ein Haus
// aus, verschwinden seine Mitglieder nicht aus der Stadtgeschichte.
Dynasty.hasMany(Character, { foreignKey: 'DynastyId', onDelete: 'SET NULL', as: 'members' });
Character.belongsTo(Dynasty, { foreignKey: 'DynastyId', as: 'dynasty' });

// Der Stammbaum. Selbstbezug, dreimal: Mutter, Vater, Ehe.
Character.belongsTo(Character, { foreignKey: 'motherId', as: 'mother' });
Character.belongsTo(Character, { foreignKey: 'fatherId', as: 'father' });
Character.belongsTo(Character, { foreignKey: 'spouseId', as: 'spouse' });

// Jeder hält sich an einem Ort auf.
Region.hasMany(Character, { foreignKey: 'RegionId', as: 'inhabitants' });
Character.belongsTo(Region, { foreignKey: 'RegionId', as: 'region' });

// Grundstücke liegen in einer Region und gehören höchstens einem Charakter.
Region.hasMany(Plot, { foreignKey: 'RegionId', onDelete: 'CASCADE', as: 'plots' });
Plot.belongsTo(Region, { foreignKey: 'RegionId', as: 'region' });
Character.hasMany(Plot, { foreignKey: 'OwnerCharacterId', onDelete: 'SET NULL', as: 'ownedPlots' });
Plot.belongsTo(Character, { foreignKey: 'OwnerCharacterId', as: 'owner' });

// Höchstens ein Gebäude je Grundstück. Verfällt es zur Ruine, verschwindet die
// Gebäudezeile und das Grundstück bleibt — deshalb hängt das Gebäude am Grundstück und
// nicht umgekehrt.
Plot.hasOne(Building, { foreignKey: 'PlotId', onDelete: 'SET NULL', as: 'building' });
Building.belongsTo(Plot, { foreignKey: 'PlotId', as: 'plot' });
Character.hasMany(Building, {
	foreignKey: 'OwnerCharacterId',
	onDelete: 'SET NULL',
	as: 'ownedBuildings'
});
Building.belongsTo(Character, { foreignKey: 'OwnerCharacterId', as: 'owner' });

// Wer wohnt hier? Fällt das Haus, stehen die Bewohner ohne da — nicht gelöscht.
Building.hasMany(Character, {
	foreignKey: 'HomeBuildingId',
	onDelete: 'SET NULL',
	as: 'residents'
});
Character.belongsTo(Building, { foreignKey: 'HomeBuildingId', as: 'home' });

// Was einer kann. Stirbt er, verschwindet es mit ihm — weitergegeben wird nur, was er
// zu Lebzeiten gelehrt hat (siehe skill.logic.ts).
Character.hasMany(Skill, { foreignKey: 'CharacterId', onDelete: 'CASCADE', as: 'skills' });
// Was jemand besitzt. Stirbt er, faellt es mit dem uebrigen Nachlass an den Erben --
// das regelt 4.2, hier nur die Verbindung.
Character.hasMany(Inventory, { foreignKey: 'CharacterId', onDelete: 'CASCADE', as: 'items' });
// Pacht: eine Flaeche, ein Paechter. Beim Tod faellt sie an die Stadt zurueck (4.2).
// Jedes Handelshaus ist zugleich Verkaufsstelle: Lager und Preisschilder haengen am
// Gebaeude. Wird es zur Ruine, verschwindet beides mit ihm.
Building.hasMany(BuildingStock, { foreignKey: 'BuildingId', onDelete: 'CASCADE', as: 'stock' });
Building.hasMany(ShopOffer, { foreignKey: 'BuildingId', onDelete: 'CASCADE', as: 'offers' });
// Faellt der Betrieb zur Ruine, enden die Anstellungen mit ihm.
Building.hasMany(Employment, { foreignKey: 'BuildingId', onDelete: 'CASCADE', as: 'staff' });

// Aemter haengen an einer Stadt, nicht an der Welt: Jede waehlt ihre eigenen.
Region.hasMany(Election, { foreignKey: 'RegionId', onDelete: 'CASCADE', as: 'elections' });
Election.hasMany(Candidacy, { foreignKey: 'ElectionId', onDelete: 'CASCADE', as: 'candidates' });
Election.hasMany(Vote, { foreignKey: 'ElectionId', onDelete: 'CASCADE', as: 'votes' });
// Gesetze gelten je Stadt. Verschwindet sie, verschwinden ihre Erlasse mit ihr.
Region.hasMany(Law, { foreignKey: 'RegionId', onDelete: 'CASCADE', as: 'laws' });

Plot.hasOne(Lease, { foreignKey: 'PlotId', onDelete: 'CASCADE', as: 'lease' });
Lease.belongsTo(Plot, { foreignKey: 'PlotId', as: 'plot' });
Skill.belongsTo(Character, { foreignKey: 'CharacterId', as: 'character' });

// Beziehungen sind gerichtet, deshalb zweimal derselbe Partner mit unterschiedlicher
// Rolle.
Relationship.belongsTo(Character, { foreignKey: 'fromCharacterId', as: 'from' });
Relationship.belongsTo(Character, { foreignKey: 'toCharacterId', as: 'to' });
DynastyRelationship.belongsTo(Dynasty, { foreignKey: 'fromDynastyId', as: 'from' });
DynastyRelationship.belongsTo(Dynasty, { foreignKey: 'toDynastyId', as: 'to' });

// Die Karte: Wege zwischen Orten, in beide Richtungen abgelegt.
RegionLink.belongsTo(Region, { foreignKey: 'fromRegionId', as: 'from' });
RegionLink.belongsTo(Region, { foreignKey: 'toRegionId', as: 'to' });

// --- Start ---------------------------------------------------------------------------

let dbStarted = false;

/**
 * Baut die Verbindung auf und bringt das Schema auf Stand.
 *
 * Migrationen laufen nicht nur in Produktion, sondern auch lokal: Die lokale Datenbank
 * ist eine Datei und überlebt den Neustart, `sync()` würde an einer bestehenden Tabelle
 * aber nichts mehr ändern — eine neue Spalte fehlte dann stillschweigend. Nebenbei wird
 * damit jede Migration beim Entwickeln ausgeführt, lange bevor sie die echte Welt
 * anfasst. Nur im Testlauf baut `sync()` das Schema direkt aus den Modellen auf; dass
 * beide Wege dasselbe ergeben, sichert `migrations.spec.ts`.
 */
export async function startDB(): Promise<void> {
	if (dbStarted) return;
	try {
		// Vor dem Verbindungsaufbau, damit fehlende Zugangsdaten als klare Meldung
		// auffallen statt als "Access denied for ''@…" aus dem Treiber.
		assertDatabaseCredentials(mode);

		if (mode === 'LOCAL') {
			// SQLite legt die Datei an, den Ordner darüber aber nicht.
			await fs.mkdir(path.dirname(LOCAL_STORAGE_PATH), { recursive: true });
		}

		await sequelize.authenticate();

		if (mode === 'TEST') {
			await sequelize.sync();
		} else {
			await createMigrator(sequelize).up();
		}

		// Erst danach, und wiederholbar: Ohne Stadt gäbe es keinen Ort, an dem ein
		// Charakter stehen könnte. Im Testlauf baut jeder Test seine Welt selbst auf.
		if (mode !== 'TEST') {
			await seedWorld();
		}

		dbStarted = true;
	} catch (error) {
		// Fail-fast: Ohne Datenbank oder mit gescheiterter Migration darf der Server nicht
		// "erfolgreich" starten und dann auf jedem Request werfen. Der Fehler propagiert
		// durch das Top-Level-await in hooks.server.ts — der Prozess startet gar nicht.
		console.error('Die Datenbank ließ sich nicht starten:', error);
		throw error;
	}
}
