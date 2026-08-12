# Umbauplan

Stand: Bestandsaufnahme vom 12.08.2026, ausgehend vom Commit `ee6d703`.

Ziel ist, den Prototyp auf die Architektur des Nachbarprojekts `festival` zu heben:
Sequelize statt JSON-Dateien, echte Sessions, reine Logikmodule mit Tests, Deployment
über GitHub Actions. Die inhaltliche Richtung des Spiels beschreibt `KONZEPT.md` —
dieser Plan setzt sie voraus, wo das Datenmodell davon berührt ist. Was noch nicht
entschieden ist, sammelt `OFFENE_PUNKTE.md`.

## Grundannahmen

- **Es wird nichts migriert.** Die Dateien unter `static/*.txt` waren nie committet;
  der Bestand wird ersetzt, nicht überführt.
- **DB-Wahl wie bei Festival:** SQLite in-memory für Dev und Tests, MariaDB in
  Produktion.
- **IDs werden `crypto.randomUUID()`-Strings statt `bigint`.** Das ist die Entscheidung
  hinter Phase 1: `JSON.stringify` kann BigInt nicht serialisieren, und `JSON.parse`
  gibt beim Laden Strings zurück, womit jeder `===`-Vergleich auf IDs fehlschlägt. Mit
  UUID-Strings verschwindet das Problem, statt umschifft zu werden.
- **Zahlen bleiben `number`** (INTEGER): Geld, Aktionspunkte, Alter, Warenmengen. Geld
  wird in ganzen Münzen gerechnet — keine Fließkommazahlen für Beträge, die sich über
  Generationen aufsummieren.
- **Jede Handlung, die Ressourcen verbraucht, läuft in einer Transaktion mit Sperre auf
  die Charakterzeile.** Zwei parallele Requests („arbeiten“, „kaufen“) dürfen dieselben
  Aktionspunkte oder dieselbe Münze nicht zweimal ausgeben — das ist das klassische Loch
  in Browserspielen und betrifft nicht nur den Gebäudekauf, sondern jede Aktion.
- **Das Schema wächst mit den Phasen.** Phase 1 legt das Fundament, aber 4.6 bis 4.9
  bringen eigene Tabellen (`item`, `employment`, `lease`, `office`, `shipment`, `event`)
  und damit eigene Migrationen. Das ist der Normalfall, kein Planungsfehler — nur die
  _Struktur_ (Karte, Grundstücke, Dynastie, Rollen) muss von Anfang an stehen, weil sie
  sich quer durch alle Abfragen zieht.

## Phase 1 — Fundament: Persistenz

Das ist der eigentliche Blocker. Solange er steht, ist jede Spiellogik auf Sand gebaut.

### 1.1 Abhängigkeiten und Konfiguration ✓

```
npm i sequelize mariadb umzug bcrypt-ts
npm i -D vitest sqlite3
```

Dazu `vitest.config.ts` (mit dem `sveltekit()`-Plugin, sonst lassen sich `$lib`-Importe
in Tests nicht auflösen) und `"test:unit": "vitest"` in der `package.json`.

Der erste Test ist bewusst kein Platzhalter, sondern ein Rauchtest der Werkzeugkette:
Verbindung zu In-Memory-SQLite, Tabelle anlegen, schreiben, lesen. `sqlite3` ist ein
natives Modul und damit die Stelle, an der ein Setup unter Windows scheitert — ohne
diesen Test fiele das erst in 1.2 auf, vermischt mit echten Modellfehlern.

**Dabei mit erledigt:** Der Bestand hatte 19 gemeldete Sicherheitslücken, darunter eine
XSS-Lücke in `@sveltejs/kit ≤ 2.70.2` — also im Framework, das die App ausliefert, nicht
bloß im Werkzeug. `npm audit fix` (ohne `--force`) räumt das im Rahmen der Semver-Bereiche
ab; die letzten Meldungen zu `cookie` und `uuid` verschwinden über einen `overrides`-Block
wie bei Festival. Danach: keine Lücken mehr.

_Fertig, wenn:_ `npm run test:unit` grün ist. — Erledigt, zwei Tests laufen.

### 1.2 `src/lib/db/sequelize.ts` ✓

Von Festival übernommen: die Weiche zwischen den Betriebsarten und
`assertDatabaseCredentials()` als **Funktion**, nicht als Prüfung auf Modulebene — `vite
build` importiert die Servermodule in seiner Analysephase, ein Fehler beim Import bräche
sonst schon den Build in der CI ab, die die Zugangsdaten gar nicht kennt.

**Abweichend von Festival drei statt zwei Betriebsarten.** Dort teilt sich die Welt in
„Test oder lokal“ (SQLite im Arbeitsspeicher) und Produktion. Hier ist der lokale Fall
ein eigener und schreibt in eine **Datei** unter `.data/dev.sqlite`: Dies ist ein Spiel
mit gewachsener Welt — wer lokal eine Stadt aufbaut, Charaktere altern lässt und dann den
Server neu startet, will sie wiederfinden. Nur der Testlauf beginnt bei null.

Die Entscheidung für den lokalen Modus verlangt ein ausdrückliches `MARIA_DB_NAME=dev`
und ergibt sich **nicht** daraus, dass Zugangsdaten fehlen. Sonst liefe eine Produktion
mit nicht geladener `.env` scheinbar erfolgreich an und schriebe die Welt in eine Datei,
die das nächste Deploy mitnimmt. Fehlende Zugangsdaten müssen laut sein, nicht bequem.

Dazu `.env.example` als Vorlage und `/.data/` in der `.gitignore`.

_Fertig, wenn:_ Der Import in einem Test gegen `:memory:` verbindet. — Erledigt; die
Weiche ist für alle drei Betriebsarten getestet, ebenso die Fehlermeldung bei fehlenden
Zugangsdaten. Der Rauchtest aus 1.1 ist damit abgelöst und entfernt.

### 1.3 Attribute und Modelle ✓

`src/lib/db/attributes/*.attributes.ts` (Interfaces) und `src/lib/db/model/*.ts`. Das
Schema bildet die Dynastie-Mechanik aus `KONZEPT.md` von Anfang an ab — sie nachträglich
einzuziehen, hieße jede Tabelle noch einmal anzufassen.

Die `convertTo…`-Mapper in die Domänentypen kommen erst mit 1.5: Sie müssten heute gegen
`$lib/model/*` mappen, das noch mit `bigint` arbeitet — genau dem, was dieser Umbau
beseitigt. Zwei Schritte lang zwei Wahrheiten zu pflegen wäre teurer als der eine Schritt
später.

Drei Entscheidungen aus der Umsetzung, die im Schema nicht sichtbar sind:

- **Aufzählungen als String-Union mit `validate: { isIn }`**, nicht als
  `DataTypes.ENUM`. Ein echtes ENUM verhält sich zwischen SQLite und MariaDB verschieden,
  und genau diese Unterschiede müsste die Migrationsprüfung in 1.4 sonst ausgleichen.
- **Geld und Kasse als `INTEGER`, nicht `BIGINT`.** MariaDB deckt damit gut zwei
  Milliarden Münzen ab, was reicht — und `BIGINT` gäbe Sequelize als String zurück, womit
  genau das Problem zurückkäme, dessentwegen dieser Umbau läuft.
- **Nullbare Spalten bekommen ausdrücklich `defaultValue: null`.** Ohne das fehlt der
  Schlüssel auf der Instanz, die `create()` zurückgibt, ganz — sie ist `undefined`,
  während dieselbe Zeile aus der Datenbank gelesen `null` liefert. Eine Prüfung wie
  `deathTick === null` wäre damit je nach Herkunft des Objekts falsch. Aufgefallen ist
  das erst durch die Tests.

| Modell                | Felder                                                                                                                                                                                          | Beziehungen                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `user`                | id (UUID, PK), nickname (**unique**), email, password                                                                                                                                           | hasOne sessionToken, **hasMany** dynasty                                         |
| `sessionToken`        | UserId (PK), token                                                                                                                                                                              | belongsTo user                                                                   |
| `dynasty`             | id, name, UserId, isExtinct, foundedAtTick, extinctAtTick                                                                                                                                       | belongsTo user, hasMany character                                                |
| `character`           | id, firstName, title, role (`PLAYER`, `NPC`), actionPoints, lastTickProcessed, money, birthTick, deathTick, gender, RegionId, DynastyId (nullbar), motherId, fatherId, spouseId, HomeBuildingId | belongsTo dynasty, region und building (Wohnen), self-referencing Eltern und Ehe |
| `relationship`        | fromCharacterId, toCharacterId (zusammen PK), affection, lastChangedTick                                                                                                                        | zweimal belongsTo character                                                      |
| `dynastyRelationship` | fromDynastyId, toDynastyId (zusammen PK), standing, lastChangedTick                                                                                                                             | zweimal belongsTo dynasty                                                        |
| `region`              | id, name, type (`CITY`, `FOREST`, `QUARRY`, `FIELD`, `MINE`), treasury (nur Städte)                                                                                                             | hasMany plot, hasMany character                                                  |
| `regionLink`          | fromRegionId, toRegionId (zusammen PK), distanceInTicks                                                                                                                                         | zweimal belongsTo region                                                         |
| `plot`                | id, address, type (`BUILDING_LAND`, `RESOURCE`), resourceType, RegionId, ownerType (`CHARACTER`, `CITY`, `NONE`), OwnerCharacterId (nullbar), forSalePrice (nullbar)                            | belongsTo region und character, hasOne building                                  |
| `building`            | id, name, optionId, level, condition, lastConditionTick, PlotId (nullbar), ownerType (`CHARACTER`, `CITY`), OwnerCharacterId (nullbar), forSalePrice (nullbar)                                  | belongsTo plot und character                                                     |
| `world`               | id (immer 1), currentTick, lastTickAt                                                                                                                                                           | —                                                                                |

Gegenüber dem heutigen Stand ändert sich zweierlei grundsätzlich:

- **`building` speichert nur `optionId` und `level`**, nicht die kopierten
  Template-Felder. Preise, Aktionen, Ausbaustufen und Limits bleiben Code in
  `buildingTemplate.ts` — dann wirken Balancing-Änderungen sofort und für alle
  Bestandsgebäude konsistent. Heute erbt `Building` von `BuildingTemplate` und friert die
  Werte beim Bauen ein; genau das macht Ausbaustufen später unmöglich.
- **Die Karte kommt ins Startschema, auch wenn die Welt aus einer Stadt besteht.**
  `region` und `regionLink` sind billig anzulegen und teuer nachzurüsten: Ohne sie hätte
  weder `plot` noch `character` einen Ort, und beides nachträglich zu verorten hieße,
  jede Abfrage anzufassen. Der Weltaufbau befüllt sie zunächst mit einer Stadt und ein
  paar Umlandflächen — die Struktur gibt die zweite Stadt aber schon her.
- **`plot` trägt Bauland und Abbaufläche in einer Tabelle**, unterschieden per `type`.
  Beide sind ortsgebundene, knappe Flächen mit oder ohne Nutzer; zwei getrennte Tabellen
  würden dieselben Abfragen doppelt brauchen. Abbauflächen gehören der Stadt und haben
  höchstens einen Pächter.
- **Eigentum wird explizit ausgezeichnet, nicht aus `NULL` erschlossen.** Ein `ownerType`
  unterscheidet die drei Fälle: gehört einem Charakter, gehört der Stadt, gehört niemandem
  (noch nie vergebenes Bauland). Ohne dieses Feld hätte `OwnerCharacterId = NULL` zwei
  verschiedene Bedeutungen — „Stadtbesitz“ bei Abbauflächen, „frei“ bei Bauland —, und
  jede Abfrage müsste die Unterscheidung selbst nachbauen. Die Stadt ergibt sich aus der
  Region des Grundstücks; ein zweiter Eigentümerschlüssel ist dafür nicht nötig.
- **Öffentliche Gebäude sind normale `building`-Zeilen** mit `ownerType = CITY`. Bewusst
  keine eigene Tabelle: Bau, Verfall und Renovierung laufen über dieselben Regeln, nur
  die Kasse ist eine andere. `PlotId` ist dabei nullbar, weil nicht jedes öffentliche
  Bauwerk auf einem Grundstück steht — Schule und Brunnen belegen eines (und konkurrieren
  damit um knappes Bauland, was der Politik eine echte Abwägung gibt), eine Stadtmauer
  umschließt die ganze Region.
- **`plot` ist eine eigene Tabelle, nicht ein Feld am Gebäude.** Das Grundstück
  überdauert das Haus: Verfällt ein Gebäude zur Ruine, wird die `building`-Zeile
  gelöscht, die `plot`-Zeile bleibt beim Eigentümer. Beide tragen einen nullbaren
  `forSalePrice` — Verkaufen heißt, einen Preis zu setzen, nicht ein Auktionsobjekt
  anzulegen.
- **`condition` und `lastConditionTick` werden faul ausgewertet**, wie Aktionsbudget und
  Zuneigung: Der Zustand ergibt sich beim Lesen aus den verstrichenen Ticks. Der Übergang
  zur Ruine ist damit kein eigener Durchlauf, sondern fällt beim nächsten Zugriff auf — was
  bedeutet, dass die Ruinen-Prüfung an jeder Stelle greifen muss, die ein Gebäude lädt,
  nicht nur auf der Detailseite.
- **Die Dynastie ist das langlebige Spielerobjekt**, der Charakter das sterbliche.
  `role` unterscheidet den gespielten Charakter vom NPC — **ein** Feld, nicht zwei
  Booleans: `isPlayerCharacter` und `isNpc` nebeneinander erlauben zwei unmögliche
  Kombinationen und laden zu widersprüchlichen Zuständen ein. Fremd-NPCs erkennt man
  daran, dass `DynastyId` leer ist; deshalb ist auch die nullbar.
- **`spouseId` und `RegionId` gehören ins Startschema.** Die Ehe trägt die Erbfolge (wer
  mit wem Kinder bekommt) und der Aufenthaltsort die halbe Wirtschaft (wer welchen Laden
  erreicht) — beides nachträglich einzuziehen hieße, jede Abfrage anzufassen.
- **Die Anstellung gehört nicht an den Charakter.** Ein `EmployerBuildingId`-Feld wäre
  dieselbe Information, die ab 4.6 die `employment`-Tabelle mit Lohn und Laufzeit hält —
  doppelt gepflegt und garantiert irgendwann widersprüchlich. Das Wohnen bleibt dagegen
  als `HomeBuildingId` am Charakter, weil daran nichts weiter hängt als der Ort.
- **Ein User hat mehrere Dynastien über die Zeit, davon eine aktive.** Weil eine
  kinderlos erloschene Dynastie einen Neuanfang bei null bedeutet (siehe `KONZEPT.md`),
  wäre `hasOne` hier die falsche Beziehung — der Verlauf gescheiterter Häuser bleibt
  erhalten. Alle Zugriffe gehen über die aktive Dynastie (`isExtinct = false`).
- **`relationship` wird spärlich gespeichert.** Jeder Charakter hat zu jedem anderen eine
  Zuneigung (siehe `KONZEPT.md`), aber nur Abweichungen vom Grundwert bekommen eine
  Zeile — sonst wächst die Tabelle quadratisch mit der Bevölkerung. Gelesen wird über
  `getAffection(a, b)`, das drei Schichten addiert: **berechneter** Verwandtschaftsbonus
  aus dem Stammbaum, Stand der beiden Häuser aus `dynastyRelationship`, persönliche
  Abweichung aus `relationship`. Fehlen die Zeilen, bleiben die ersten beiden Schichten
  stehen. Geschrieben wird per Upsert; der Primärschlüssel ist das Paar, die Richtung
  asymmetrisch.
- **Der gespeicherte Wert ist eine Abweichung, keine Untergrenze.** Er darf den
  Grundwert unterschreiten — ein misshandeltes Kind hasst seinen Vater, trotz
  Verwandtschaftsbonus. Der Wertebereich muss also symmetrisch um null liegen und in
  beide Richtungen gedeckelt sein.
- **Der Verfall wird gerechnet, nicht geschrieben.** `lastChangedTick` plus aktueller
  Tick ergeben die abgeklungene Zuneigung beim Lesen — kein regelmäßiger Durchlauf über
  die ganze Tabelle. Dieselbe Lazy-Auswertung wie beim
  Aktionsbudget. Zeilen, die auf dem Grundwert angekommen sind, dürfen beim nächsten
  Schreibzugriff gelöscht werden. Das hält die Tabelle klein, ersetzt aber keinen
  gelegentlichen Aufräumlauf: Was niemand mehr anfasst, wird auch nicht aufgeräumt.
  Dasselbe gilt für `dynastyRelationship` — auch Fehden klingen ab.
- **`energy` wird zu `actionPoints`** und bekommt `lastTickProcessed` daneben: Das
  Kontingent wächst pro Welt-Tick nach und wird beim Zugriff nachgerechnet, nicht per
  Cron über alle Charaktere. Die Weltzeit selbst steht in der einzeiligen `world`-Tabelle.

`nickname` bekommt einen Unique-Index. Die `nickNameAlreadyUsed()`-Prüfung im Service
allein ist bei parallelen Requests eine Race Condition; Eindeutigkeit muss die DB
erzwingen.

_Fertig, wenn:_ Die Modelle legen ihre Tabellen an und halten ihre Zusicherungen. —
Erledigt; 19 Tests decken alle elf Tabellen ab, dazu Unique-Index, abgewiesene Rollen,
die Asymmetrie der Beziehungen und die Vorgaben beim Anlegen.

### 1.4 `src/lib/db/db.ts` und Migration `0001-initial-schema.ts`

Assoziationen und `startDB()` nach Festival-Vorbild: in Produktion ausschließlich
`migrator.up()` (umzug, Protokoll in `SequelizeMeta`), in Dev und Tests `sync()`.
**Ohne** `stampBaselineIfLegacySchema` — das ist dort eine Altlast aus der
`sync({ alter: true })`-Zeit, hier gibt es keine Bestands-Datenbank.

Dazu ein `migrations.spec.ts`, das absichert, dass Migration und Modelle dasselbe
Schema ergeben.

_Fertig, wenn:_ `await startDB()` als Top-Level-await in `hooks.server.ts` steht
(fail-fast: ohne DB darf der Server nicht „erfolgreich“ starten und dann auf jedem
Request werfen) und `npm run dev` läuft.

### 1.5 Services umstellen, `fileService.ts` löschen

`userService`, `dynastyService`, `characterService` und `buildingService` von
Modul-Arrays auf asynchrone Sequelize-Queries. Damit fallen ersatzlos weg:

- die Race Condition zwischen dem Callback-basierten `load()` auf Modulebene und den
  ersten Requests (die leere Arrays sehen und sie anschließend zurückschreiben),
- der fehlende `write()`-Aufruf in `characterService.update()`,
- der Datenspeicher im öffentlich ausgelieferten `static/`-Verzeichnis.

_Fertig, wenn:_ Registrieren → Charakter anlegen → Serverneustart → Charakter ist noch da.

### 1.6 Weltaufbau (Seed)

Ohne Welt kein Spiel: Regionen, ihre Entfernungen, die Grundstücke der Startstadt, die
Abbauflächen im Umland und eine Grundbevölkerung an Fremd-NPCs müssen angelegt werden.
Als eigenes, **idempotentes** Skript — mehrfach ausgeführt darf es keine zweite Stadt
anlegen —, das dieselbe Funktion auch für Tests bereitstellt.

Das ist der erste Punkt, an dem die Zeitskala gebraucht wird: Die Startbevölkerung
braucht Geburtsticks. Maßstab ist **1 Tick = 1 Stunde, 48 Ticks = 1 Spieljahr** (siehe
`KONZEPT.md`) — die Altersverteilung der Fremd-NPCs ergibt sich daraus als Rückrechnung
vom Start-Tick.

Die Umrechnung gehört als benannte Konstante an eine Stelle (`TICKS_PER_YEAR`), nicht als
`48` verstreut in Alterung, Verfall, Wahlperiode und Seed. Es ist die Zahl, die beim
Balancing am ehesten noch einmal angefasst wird.

_Fertig, wenn:_ Eine frische Datenbank enthält nach dem Start eine bespielbare Stadt.

## Phase 2 — Auth härten

Der jetzige Stand ist lokal harmlos, muss aber vor jedem Deployment weg: Passwörter
liegen im Klartext, das Session-Cookie ist der JSON-serialisierte User und damit frei
fälschbar, und `USER.txt` lag im öffentlich erreichbaren `static/`.

### 2.1 bcrypt

`register` und `loginWithCredentials` mit `hash`/`compare` aus `bcrypt-ts`. Bewusst
asynchron: bcrypt kostet ~100 ms, die App läuft in einem Node-Prozess — `hashSync`
legte bei jedem Login alle parallelen Requests still.

### 2.2 Opakes Session-Token

Das Cookie enthält nur ein `crypto.randomUUID()`; die Identität kommt aus der
`sessionToken`-Tabelle. `hooks.server.ts` ruft `getCurrentUserBySessionToken()` statt
`JSON.parse(cookie)`. Cookie mit `httpOnly`, `sameSite: 'lax'`, `secure` außerhalb von
dev und `maxAge`; abgelaufene Token beim Auflösen aufräumen.

_Fertig, wenn:_ Ein von Hand gefälschtes Cookie zu `/login` führt.

### 2.3 Logout und Rate-Limit

`/logout` als echte Route statt als Sonderfall im Hook. Dazu ein Login-Rate-Limit —
Festivals `login-rate-limit.ts` ist direkt übernehmbar.

### 2.4 Deployment-Durchstich

Hier einmal komplett ausliefern, obwohl Phase 5 das eigentlich abhandelt:
`adapter-node`, MariaDB auf dem Uberspace, Migrationen gegen die echte Datenbank,
Base-Path, `/api/health`, der rsync-Workflow.

Die App läuft unter einem **Unterpfad** wie Festival — also `paths.base` in der
`svelte.config.js` setzen und auf dem Host `uberspace web backend set /<pfad>` **ohne**
`--remove-prefix`, damit der Präfix unverändert an die App durchreicht. Festivals
`hooks.server.ts` zeigt die beiden Fallen: `event.url.pathname` enthält den Präfix (vor
dem Vergleich mit `noAuthURLs` abschneiden), und ein Location-Header braucht
`${base}/login` statt `resolve()` — sonst löst der Browser relativ zur angefragten
Ressource auf und ein Datenrequest landet nicht auf der Login-Seite. Nicht weil die App fertig wäre, sondern
weil sich Deploy-Probleme sonst am Ende alle gleichzeitig einstellen — und der Base-Path
zieht sich durch jeden Redirect, den Phase 3 und 4 hinzufügen.

_Fertig, wenn:_ Registrieren und Anmelden funktionieren auf dem Server, nicht nur lokal.

## Phase 3 — Spielkern reparieren

Die Gebäude-Aktionen funktionieren derzeit überhaupt nicht. Erst danach lohnt der
Ausbau in Richtung Konzept.

### 3.1 Form-Actions statt roher `fetch`

`building/new/+page.svelte` und `building/[building_id]/+page.svelte` auf
`<form method="POST" use:enhance>` umstellen. Erst dann kommen `fail()` und `redirect()`
überhaupt beim Client an. In `building/[building_id]/+page.server.ts` das nicht
abgewartete `request.text().then(...)` durch `await` ersetzen und das unbedingte
`error(404)` am Ende entfernen — es wirft heute in jedem Fall, auch im Erfolgsfall.

### 3.2 Bauen korrekt

Die Preisprüfung ist invertiert (`option.price >= character.money` verbietet den Kauf,
wenn man genug hat). Geld wird zudem nie abgezogen. Beides in einer **Transaktion**:
Geld abziehen und Gebäude anlegen, oder keins von beidem. `limitReached()` zählt gegen
die DB. Dazu kommt die Grundstücksprüfung — gebaut wird auf einem freien eigenen `plot`,
nicht ins Leere.

### 3.3 Aktionen als reine Logik

`WORK`, `SLEEP` und `BECOME_CITIZEN` ausformulieren — die Regeln als reine Funktionen in
`buildingAction.logic.ts` mit Vitest-Specs, die Persistenz daneben im Service. Das ist
Festivals `.logic`/`.service`-Trennung und hier besonders wertvoll, weil Spielbalance
sich ständig ändert und genau diese Regeln testbar bleiben müssen.

### 3.4 Charakterseite ausbauen

Energie, Geld, Alter, Wohnort, Arbeitsplatz und Besitz anzeigen statt nur Name und
Titel.

## Phase 4 — Konzept umsetzen

Ab hier wird gebaut, nicht repariert. Inhaltliche Grundlage: `KONZEPT.md`.

**4.1 Zeit.** Zwei Teile, die man auseinanderhalten muss.

_Die Rechnung:_ `tick.logic.ts` als reine Funktion — aus `world.currentTick` und
`character.lastTickProcessed` ergibt sich, wie viele Aktionspunkte nachwachsen
(gedeckelt) und was sonst fällig ist. Alles Weitere hängt daran, deshalb zuerst und mit
gründlichen Specs.

_Der Takt:_ Ein Prozess, der `world.currentTick` hochzählt, auch wenn niemand angemeldet
ist — die Welt läuft weiter (siehe `KONZEPT.md`). Auf einem Uberspace mit einem einzigen
Node-Prozess ist ein Intervall im Server der einfachste Weg; ein Cron gegen einen
geschützten Endpunkt wäre die robustere Variante, weil er einen hängenden Prozess
sichtbar macht. Zwei Dinge muss er können: **nachholen**, wenn der Server eine Weile aus
war (aus `lastTickAt` ergibt sich, wie viele Ticks fehlen), und dabei **deckeln**, damit
ein dreitägiger Ausfall nicht tausende Ticks in einer Schleife abarbeitet. Was beim
Nachholen tatsächlich passieren soll — alles nachrechnen oder stillschweigend
überspringen — ist eine Entscheidung, die hier fällt.

Ab diesem Takt hängen später auch NPC-Handeln (4.6), Ereignisse (4.8) und das Ende von
Wahlperioden (4.7) — alles, was passieren muss, ohne dass jemand hinschaut.

**4.2 Lebenszyklus.** Alterung aus `birthTick`, Sterbewahrscheinlichkeit, Tod des
Spielercharakters, **Erbenwahl durch den Spieler** unter den eigenen Kindern, gesetzlicher
Anteil für die übrigen, Besitzübergang. Kinderlos heißt: Dynastie auf `isExtinct`, Besitz
an die Stadt, neue Dynastie anlegbar.

Dass der Erbteil der Geschwister aus einem Gesetz kommt, heißt für die Umsetzung: Der
Satz ist ein Parameter, kein Literal — auch solange es die Politik aus 4.7 noch nicht
gibt. Sonst muss die Erbschaftslogik später umgebaut werden.

**4.3 Beziehungen.** `relationship.logic.ts` als reine Funktionen: die drei Schichten zu
einer Zuneigung verrechnen, Verfall Richtung Grundwert über die verstrichenen Ticks,
Änderung durch freundliche und feindliche Interaktion, Deckelung nach oben und unten.
Vorgezogen vor Familie und Politik, weil beide darauf aufsetzen — Heirat braucht eine
gute Beziehung, NPC-Stimmen richten sich nach ihr.

Dazu die Hausbeziehungen. Wichtig für die Umsetzung: Der natürliche Anteil wird
**inkrementell fortgeschrieben**, nicht aggregiert. Jede Änderung einer persönlichen
Beziehung schiebt den Stand der beiden Häuser im selben Schritt um einen Bruchteil mit —
eine Auswertung über alle Mitgliederpaare wäre quadratisch und ließe sich, anders als
Verfall und Aktionsbudget, nicht faul beim Lesen nachrechnen. Der erklärte Anteil
(Fehde, Frieden, Bündnis durch das Oberhaupt) setzt denselben Wert direkt.

Der Verfall ist der Kern der Specs: Er muss über beliebig große Tick-Abstände dasselbe
Ergebnis liefern wie über viele kleine, sonst hängt die Zuneigung davon ab, wie oft
jemand die Seite aufruft. Zweiter Testschwerpunkt ist, dass die persönliche Schicht die
Hausfehde überstimmen kann — sonst ist Romeo und Julia mechanisch ausgeschlossen.

**4.4 Familie und Bevölkerung.** Werben, Heirat, Zeugung, Geburt; Geschwister als NPCs
mit indirekten Befehlen (anstellen, verheiraten, ins Amt schicken) und einfachen
Eigenregeln. Bei einer Ehe zweier Spielerhäuser entscheidet ein Münzwurf je Kind, welchem
Haus es zufällt.

Hier entsteht auch die **Bevölkerungsdynamik**: NPCs heiraten und bekommen selbst Kinder,
dazu kommen die überzähligen Kinder der Spielerhäuser. Das gehört an den Welt-Takt aus
4.1, nicht an Seitenaufrufe — und es braucht Beobachtung: Eine Bevölkerung, die
langfristig schrumpft oder explodiert, nimmt Wirtschaft und Politik den Boden. Eine
einfache Statistik über Einwohner, Geburten und Tote je Stadt gehört deshalb gleich mit
dazu.

**4.5 Gebäude und Grundstücke.** `building.logic.ts`: Zustand aus verstrichenen Ticks,
Renovieren, Ausbaustufen, Übergang zur Ruine. Dazu Grundstücke als knappes Gut, An- und
Verkauf von `plot` und `building` über den nullbaren `forSalePrice`, Besitzübergang beim
Erbfall (greift zurück auf 4.2).

Zwei Dinge, die hier leicht untergehen: Die Ruinen-Prüfung muss **an jeder Ladestelle**
greifen, nicht nur auf der Gebäudeseite — sonst hängt es vom Zufall ab, wann ein Haus
zusammenfällt. Und Renovieren kostet zunächst nur Geld; die Kopplung an Baumaterial
kommt mit 4.6 dazu, sobald es Waren gibt.

**4.6 Wirtschaft.** `itemTemplate`/`inventory` mit echtem Nutzen (Nahrung, Kleidung,
Werkzeug, **Baumaterial**), Bedürfnisse als Modifikatoren, `employment` mit Lohn, Produktion im Betrieb.
Der Handel läuft über **Festpreis-Angebote am Gebäude** (`shopOffer`: BuildingId, itemId,
Preis, Menge) — ein Kauf ist eine Transaktion, kein Matching. **NPC-Konsum gehört in
denselben Schritt**, nicht später: Er ist die Nachfrageseite, ohne die der Markt kein
Gleichgewicht findet.

Dabei gilt: NPCs laufen durch **dieselbe** Logik wie Spielercharaktere — Lohn einnehmen,
Unterhalt zahlen, vom Rest kaufen. Kein zweiter Satz Regeln für die Simulation, sonst
driften die beiden Welten auseinander und Balancing wird unmöglich. Die
Zahlungsbereitschaft eines NPCs fällt damit von selbst aus seinem Budget, statt eine
eigene Konstante zu sein.

Am Anfang der Produktionskette stehen die **Abbauflächen**: `lease` als Pachtverhältnis
mit laufender Rate, die sich aus den verstrichenen Ticks ergibt, Gewinnung von Holz,
Stein, Getreide und Erz, Verarbeitung in der Handwerkshütte. Erst damit hat Baumaterial
eine Herkunft und die Renovierungskosten aus 4.5 einen echten Preis.

**4.7 Politik und Stadtkasse.** `office`, `election`, `vote`, `law` — **je Stadt**, nicht
je Welt. Jeder Charakter hat eine Stimme, NPCs entscheiden anhand ihrer Zuneigung zu den
Kandidaten; ein eigenes Wahlkampfsystem braucht es dadurch nicht. Gesetze als
**Datenobjekte, die bestehende Regeln parametrisieren** (Steuersatz, Preisgrenzen,
Baurecht) — nicht als freier Effekt, sonst ist jede Gesetzesart ein Sonderfall im Code.

Dazu die Stadtkasse: Steuern und Pacht hinein, öffentliche Gebäude heraus. Die
Pachtvergabe ist die erste echte Amtshandlung mit Verteilungswirkung — sie verbindet 4.6
mit der Politik.

**4.8 Ereignisse.** Räuber, Seuche, Brand als Zufallsereignisse am Tick, gemildert durch
öffentliche Bauten (Mauer, Brunnen). Protokolliert in `event` und sichtbar als
Stadtchronik — ein Unglück, von dem niemand erfährt, hat politisch keine Folgen. Bewusst
nach der Politik, weil erst dann etwas da ist, das schützen kann.

**4.9 Ausdehnung.** Fernhandel mit `shipment` (Ankunfts-Tick statt Fortbewegung),
Erschließung neuen Baulands aus der Stadtkasse, Gründung einer zweiten Stadt. Fernziele
für etablierte Dynastien — das Datenmodell trägt sie ab Phase 1, gebraucht werden sie
erst, wenn jemand so weit ist.

## Phase 5 — Aufräumen und Ausliefern

### 5.1 Codehygiene

- Sechs Dateien importieren Typen aus `../../../../.svelte-kit/types/src/routes/...`
  statt aus `./$types`, teils mit falschem Route-Bezug. Umstellen.
- Die drei `@ts-ignore` auflösen, `LayoutLoad` → `LayoutServerLoad`.
- `emailAlreadyUsed()` ist ein `return false`-Stub.
- `npm run check` muss sauber durchlaufen.

### 5.2 CI und End-to-End-Tests

Die Unit-Specs entstehen laufend mit den Logikmodulen in Phase 3 und 4 — hier kommt
zusammen, was übrig bleibt: Playwright für den Rundlauf Registrieren → Charakter →
Bauen → Arbeiten und `tests.yml` als CI-Workflow, damit beides bei jedem Push läuft.

### 5.3 Deployment und Datensicherung

Das Grundgerüst steht seit 2.4; hier wird es fertig gemacht. `deploy.yml` mit
`burnett01/rsync-deployments`, Secrets sind pro Repository — für dieses hier neu setzen,
am besten per `gh secret set NAME < keydatei` (beim Einfügen über die Zwischenablage
gehen regelmäßig Zeilenumbrüche verloren). `--chmod=D755,F644` gehört in die
rsync-Switches.

**Datensicherung ist hier kein Beiwerk.** Die Produktionsdatenbank ist das wertvollste
Artefakt des Projekts: Sie enthält Generationen von Spielzeit, die sich nicht
wiederherstellen lassen. Ein fehlgeschlagener Migrationsschritt kann sie zerstören.
Deshalb ein Dump **vor jedem Deploy** als Teil des Workflows, dazu ein regelmäßiger
Dump per Cron mit Aufbewahrung über mehrere Tage — und mindestens einmal ausprobiert,
ob sich daraus tatsächlich wiederherstellen lässt.

### 5.4 Beiwerk

Impressum und Datenschutz mit Inhalt füllen (beide stehen in `noAuthURLs`, sind aber
leer) — die Datenschutzerklärung muss dabei abdecken, was zur Erkennung von
Mehrfachaccounts protokolliert wird, dazu Spielregeln und Nutzungsbedingungen, in denen
das Verbot überhaupt steht; `README.md` um eine Setup-Anleitung ergänzen, `CLAUDE.md`
fürs Projekt anlegen.

**Kontolöschung braucht eine eigene Regel.** Verlangt jemand die Löschung seiner Daten,
kann die Welt seine Dynastie nicht einfach vergessen: An ihr hängen Gebäude, Verträge,
Ämter und die Vorfahren anderer Spieler. Der gangbare Weg ist Anonymisieren statt Löschen
— personenbezogene Daten (Nickname, E-Mail, Anmeldeprotokoll) entfernen, die Spielfigur
als namenloses Haus in der Geschichte stehen lassen, Besitz an die Stadt geben. Festivals
`account-deletion` ist der Ausgangspunkt, die Regel selbst ist hier eine andere.

## Reihenfolge

Nicht beliebig: Phase 1 vor 2 (die Session-Tabelle braucht die DB), 1 und 2 vor 3
(sonst entsteht Spiellogik auf Datei-Persistenz, die gleich wieder umgeschrieben wird).
Innerhalb von Phase 3 sind 3.1 bis 3.3 eine Einheit. Der Aufwandsschwerpunkt liegt auf
Phase 1; danach ist der Rest gut geschnittene Fleißarbeit.

Zwei Dinge stehen bewusst früher, als es die Gliederung nahelegt: der
**Deployment-Durchstich** (2.4), weil sich Deploy-Probleme sonst am Ende häufen, und der
**Weltaufbau** (1.6), ohne den nichts von Phase 3 an überhaupt bespielbar ist.

Was inhaltlich noch offen ist und wann es entschieden sein muss, steht in
**`OFFENE_PUNKTE.md`**. Zwei davon fallen früher als der Rest: die **Zeitskala** vor dem
Weltaufbau (1.6) — ohne Maßstab lässt sich der Seed nicht sinnvoll füllen — und die
**URL-Struktur** vor dem Deploy-Durchstich (2.4), weil ein Base-Path sich sonst
nachträglich durch jeden Redirect ziehen muss.
