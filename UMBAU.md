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

### 1.4 `src/lib/db/db.ts` und Migration `0001-initial-schema.ts` ✓

Assoziationen und `startDB()` nach Festival-Vorbild, **ohne**
`stampBaselineIfLegacySchema` — das ist dort eine Altlast aus der
`sync({ alter: true })`-Zeit, hier gibt es keine Bestands-Datenbank.

**Migrationen laufen auch lokal, nicht nur in Produktion.** Festival teilt hier zwischen
Produktion (Migration) und allem anderen (`sync()`); weil die lokale Datenbank hier aber
eine Datei ist und den Neustart überlebt, wäre `sync()` die falsche Wahl: An einer
bestehenden Tabelle ändert es nichts mehr, eine neue Spalte fehlte stillschweigend.
Nebenbei wird so jede Migration beim Entwickeln ausgeführt, lange bevor sie die echte
Welt anfasst. Nur der Testlauf baut das Schema direkt aus den Modellen.

Dazu `migrations.spec.ts`, das Migration und Modelle **Spalte für Spalte** vergleicht —
Typ, Nullbarkeit, Vorgabewert, Primärschlüssel — und prüft, dass sich alles vollständig
zurückrollen lässt.

Der Abgleich hat sich sofort bezahlt gemacht: Er fand, dass `db.ts` das `world`-Modell
nicht importierte. Die Migration legte die Tabelle an, `sync()` kannte sie nicht — ein
Unterschied, der ohne diesen Test erst in Produktion aufgefallen wäre, und dort als
fehlende Weltzeit.

_Fertig, wenn:_ `await startDB()` als Top-Level-await in `hooks.server.ts` steht
(fail-fast: ohne DB darf der Server nicht „erfolgreich“ starten und dann auf jedem
Request werfen) und `npm run dev` läuft. — Erledigt; der Dev-Server legt beim ersten
Request `.data/dev.sqlite` an, die Migration erzeugt dort alle elf Tabellen samt
`SequelizeMeta`.

### 1.5 Services umstellen, `fileService.ts` löschen ✓

_Ausgeführt nach 1.6:_ Ein Charakter braucht eine Pflicht-Region und einen Geburts-Tick.
Ohne Welt lässt sich keiner anlegen — und damit wäre das Abnahmekriterium dieses
Schritts gar nicht erreichbar gewesen.

`userService`, `dynastyService`, `characterService` und `buildingService` von
Modul-Arrays auf asynchrone Sequelize-Queries. Damit fallen ersatzlos weg:

- die Race Condition zwischen dem Callback-basierten `load()` auf Modulebene und den
  ersten Requests (die leere Arrays sehen und sie anschließend zurückschreiben),
- der fehlende `write()`-Aufruf in `characterService.update()`,
- der Datenspeicher im öffentlich ausgelieferten `static/`-Verzeichnis.

Die Domänentypen unter `$lib/model/` verlieren dabei ihr `bigint`, und `Building` erbt
nicht mehr von `BuildingTemplate` — sonst fröre jedes Gebäude beim Bau die damaligen
Werte ein. Die `convertTo…`-Mapper aus 1.3 kommen jetzt dazu; sie sind zugleich die
Stelle, an der das Passwort aus der Datenbank **nicht** in die Sicht der Oberfläche
gelangt.

Neu ist ein `worldService`, vorerst nur lesend: Wer den Tick hochzählt, entscheidet 4.1.
Bis dahin steht die Zeit still, und alles daraus Abgeleitete steht mit ihr.

Bewusst **nicht** hier erledigt: Passwörter liegen weiter im Klartext, das Cookie enthält
weiterhin den Benutzer als JSON. Beides ist Phase 2. Dieser Schritt tauscht nur den
Speicher, damit ein Fehlschlag eindeutig einer Ursache zuzuordnen ist.

_Fertig, wenn:_ Registrieren → Charakter anlegen → Serverneustart → Charakter ist noch
da. — Erledigt und am laufenden Server durchgespielt: Adelbert, 16 Jahre, 10 Münzen,
48 Aktionspunkte, unverändert nach dem Neustart. Nebenbei ist `npm run check` erstmals
fehlerfrei (0 statt 7) und `npm run lint` ebenfalls (0 statt 11).

### 1.6 Weltaufbau (Seed) ✓

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

Die Welt beginnt nicht bei Tick null, sondern mit **hundert Spieljahren im Rücken**.
Sonst müssten die Geburtstage der Startbevölkerung negativ sein — und eine Stadt, die es
angeblich seit gestern gibt, in der aber Fünfzigjährige wohnen, wäre auch erzählerisch
schief.

_Fertig, wenn:_ Eine frische Datenbank enthält nach dem Start eine bespielbare Stadt. —
Erledigt: Grünau mit zwölf Baugrundstücken, drei Umlandflächen mit sechs Abbauflächen,
acht Fremd-NPCs. Läuft bei jedem Serverstart und legt beim zweiten Mal nichts erneut an.

## Phase 2 — Auth härten

Der jetzige Stand ist lokal harmlos, muss aber vor jedem Deployment weg: Passwörter
liegen im Klartext, das Session-Cookie ist der JSON-serialisierte User und damit frei
fälschbar, und `USER.txt` lag im öffentlich erreichbaren `static/`.

### 2.1 bcrypt ✓

`register` und `loginWithCredentials` mit `hash`/`compare` aus `bcrypt-ts`. Bewusst
asynchron: bcrypt kostet ~290 ms (reine JS-Umsetzung, zehn Runden), die App läuft in
einem Node-Prozess — `hashSync` legte bei jedem Login alle parallelen Requests still.

Zwei Entscheidungen aus der Umsetzung:

- **Bei unbekanntem Nickname wird gegen einen Blindhash verglichen.** Ohne ihn antwortete
  die Anmeldung bei unbekannten Namen sofort und bei bekannten erst nach dem Hashen — aus
  der Zeitdifferenz ließe sich ablesen, welche Namen vergeben sind. Aus demselben Grund
  ist die Fehlermeldung für falschen Namen und falsches Passwort dieselbe.
- **`BackendUser` ist ersatzlos weg.** Der Typ existierte, um den Benutzer _mit_ Passwort
  durch die Schichten zu reichen; jetzt wird der Hash dort verglichen, wo die Zeile
  gelesen wird, und verlässt den Service nicht mehr.

_Fertig, wenn:_ In der Datenbank steht kein Klartext mehr. — Erledigt. **Achtung für den
Bestand:** Vorhandene Konten aus der Klartext-Zeit können sich nicht mehr anmelden, weil
ihr gespeicherter Wert kein Hash ist. Lokal betrifft das den Testbenutzer, in Produktion
niemanden — dort ist noch nichts ausgeliefert.

### 2.2 Opakes Session-Token ✓

Das Cookie enthält nur ein `crypto.randomUUID()`; die Identität kommt aus der
`sessionToken`-Tabelle. `hooks.server.ts` ruft `getCurrentUserBySessionToken()` statt
`JSON.parse(cookie)`. Cookie mit `httpOnly`, `sameSite: 'lax'`, `secure` außerhalb von
dev und `maxAge`; abgelaufene Token beim Auflösen aufräumen.

**Die Frist bekommt eine eigene Spalte `expiresAt`** statt aus `updatedAt` erschlossen zu
werden, wie Festival es macht. Zwei Gründe: Jeder spätere Schreibzugriff auf die Zeile
verlängerte die Sitzung sonst stillschweigend, und der Zeitstempel gehört Sequelize — er
lässt sich nicht einmal für einen Test ausdrücklich setzen, `update()` verwirft den Wert
kommentarlos. Dazu ein **eindeutiger Index auf `token`**: Jeder Request schlägt jetzt über
diese Spalte nach, ohne Index wäre das ein Tabellenscan je Seitenaufruf. Beides bringt
Migration `0002-session-expiry.ts`, die die Tabelle dafür neu anlegt — SQLite kann keine
`NOT NULL`-Spalte ohne Vorgabewert anfügen, und verloren geht dabei nichts, weil die
Tabelle bis hierher nie beschrieben wurde.

Der Abgleich in `migrations.spec.ts` vergleicht seitdem auch **Indizes**, nicht nur
Spalten — sonst wäre genau die Beschleunigung, an der jetzt jeder Request hängt, in
Produktion still verschwunden. Der Indexname steht deshalb ausdrücklich in den Attributen
und wird von Modell und Migration geteilt.

_Fertig, wenn:_ Ein von Hand gefälschtes Cookie zu `/login` führt. — Erledigt und am
laufenden Server durchgespielt: erfundene UUID und ein Cookie im alten JSON-Format landen
beide auf der Anmeldung.

### 2.3 Logout und Rate-Limit ✓

`/logout` als echte Route statt als Sonderfall im Hook. Dazu ein Login-Rate-Limit —
Festivals `login-rate-limit.ts` ist direkt übernehmbar (fünf Fehlversuche je IP und
Nickname in fünfzehn Minuten, gleitendes Fenster im Prozessspeicher).

**Abmelden ist ein POST, kein Link.** Die App lädt Links beim Überfahren vor
(`data-sveltekit-preload-data="hover"` in der `app.html`) — läge das Abmelden in einem
`load`, genügte die Maus über dem Menüpunkt, um die Sitzung zu beenden. Der Menüpunkt ist
deshalb ein kleines Formular mit `use:enhance`; das `load` der Route leitet jeden direkten
Aufruf um. Nebenbei ist die Abmeldung damit auch nicht mehr von einer fremden Seite
auslösbar.

Gesperrt wird **vor** der Passwortprüfung, nicht danach: Sonst kostete jeder Versuch
weiterhin seine 290 ms bcrypt, und das Rate-Limit wäre selbst der Hebel für eine
Überlastung.

_Fertig, wenn:_ Abmelden beendet die Sitzung auch in der Datenbank und der sechste
Fehlversuch wird abgewiesen. — Erledigt und am laufenden Server durchgespielt.

### 2.4 Deployment-Durchstich ✓

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

Der Pfad ist **`/houses`** auf Port **5174** — 5173 gehört Festival. Beide Fallen aus
Festivals Hook sind übernommen; dazu kam eine dritte, die dort anders gelöst ist:
Ohne `ORIGIN` hält SvelteKit die Anfrage für `http://localhost:5174`, der
`Origin`-Header des Browsers passt nicht dazu, und **jedes Formular** wird mit 403
abgewiesen. Festival schaltet dafür den CSRF-Schutz ab (`trustedOrigins: ['*']`); hier
steht stattdessen die richtige Herkunft im Startkommando, der Schutz bleibt an. Am
gebauten Server nachgestellt: mit passendem Origin 200, mit fremdem 403.

Eine vierte zeigte sich erst am Artefakt: `/houses` ohne Schrägstrich am Ende ergibt
einen 308 auf `/houses/`. Links auf die Übersicht und Redirects dorthin schreiben ihn
deshalb mit — `redirect(303, \`${base}/\`)`, nicht `base`. Sonst ginge jeder Weg zur
Übersicht über einen zusätzlichen Sprung.

`/api/health` prüft nicht nur, dass der Prozess lauscht: Ein `curl` gegen `/` liefert
auch bei toter Datenbank eine Antwort, nämlich den Redirect zur Anmeldung. Der Check
setzt ein `SELECT` ab, meldet offene Migrationen und liest die **Weltuhr** — steht
`currentTick`, läuft der Takt nicht, und die Welt steht still, obwohl der Server
antwortet.

Der Rauchtest (`scripts/smoke-test.sh`, im CI vor dem Deploy) startet das gebaute
Artefakt gegen eine echte MariaDB, weil Vitest über SQLite läuft und damit weder
`node build` noch den MariaDB-Zweig anfasst. Zweites Szenario ist bewusst der
**Neustart gegen die bestehende Datenbank**: Der Weltaufbau läuft bei jedem Start mit,
und verdoppelte er das Bauland, fiele das sonst erst in Produktion auf.

Der Deploy sichert die Datenbank, **bevor** er einspielt — `startDB()` migriert beim
Start, ein Fehlschlag träfe also eine Welt, die sich nicht wiederherstellen lässt.

Die Handgriffe auf dem Host stehen in `DEPLOYMENT.md`.

Ein Stolperstein saß nicht im Code: `~/.my.cnf` auf dem Uberspace trug ein veraltetes
Passwort. Das fällt lange nicht auf, weil beide Anwendungen ihre eigene `.env` benutzen —
aber `mysqldump` im Deploy verlässt sich darauf, gerade damit kein Passwort im Workflow
steht. Notiert in `DEPLOYMENT.md`.

_Fertig, wenn:_ Registrieren und Anmelden funktionieren auf dem Server, nicht nur lokal.
— **Erledigt.** Unter https://enzlor.uber.space/houses/ läuft die Welt gegen MariaDB,
ohne offene Migrationen, mit laufender Weltuhr. Registrieren, Anmelden, alle Seiten und
eine Arbeitsschicht am lebenden Server durchgespielt; Festival blieb unberührt.

## Phase 3 — Spielkern reparieren

Die Gebäude-Aktionen funktionieren derzeit überhaupt nicht. Erst danach lohnt der
Ausbau in Richtung Konzept.

### 3.1 Form-Actions statt roher `fetch` ✓

`building/new/+page.svelte` und `building/[building_id]/+page.svelte` auf
`<form method="POST" use:enhance>` umstellen. Erst dann kommen `fail()` und `redirect()`
überhaupt beim Client an. In `building/[building_id]/+page.server.ts` das nicht
abgewartete `request.text().then(...)` durch `await` ersetzen und das unbedingte
`error(404)` am Ende entfernen — es wirft heute in jedem Fall, auch im Erfolgsfall.

_Zum größten Teil schon mit 1.5 erledigt_, als die Routen auf die Services umgestellt
wurden: Die rohen `fetch`-Aufrufe, das nicht abgewartete `request.text()` und das
unbedingte `error(404)` sind seitdem weg. Nachgezogen wurde hier nur noch `use:enhance`
— ohne das lädt jeder Fehlschlag die Seite neu und wirft die Eingaben weg.

### 3.2 Bauen korrekt ✓

Die Preisprüfung ist invertiert (`option.price >= character.money` verbietet den Kauf,
wenn man genug hat). Geld wird zudem nie abgezogen. Beides in einer **Transaktion**:
Geld abziehen und Gebäude anlegen, oder keins von beidem. `limitReached()` zählt gegen
die DB. Dazu kommt die Grundstücksprüfung — gebaut wird auf einem freien eigenen `plot`,
nicht ins Leere.

Die Grundstücksprüfung zog eine Lücke nach sich: Alle zwölf Baugrundstücke gehörten
niemandem, und es gab keinen Weg, eines zu bekommen — die Prüfung hätte also jeden Bau
abgewiesen. **Der Kauf ist deshalb eine eigene Handlung** (`/plot`), nicht ein
Nebeneffekt des Bauens: Das Konzept trennt Grundstück und Gebäude ausdrücklich, und 4.5
braucht den Handel damit ohnehin einzeln. Das Geld geht an die **Stadtkasse** — die Stadt
gibt den Boden her, und ihre Kasse ist ab 4.7 der politische Hebel.

Gesperrt wird die Charakterzeile, und zusätzlich die Grundstückszeile: Die eine Sperre
verhindert, dass dieselbe Münze zweimal ausgegeben wird, die andere, dass dasselbe
Grundstück zweimal verkauft wird. Unter SQLite laufen Schreibvorgänge ohnehin
nacheinander, `lock` wird dort stillschweigend ignoriert — in Produktion wirkt es.

`limitReached()` zählt **je Stadt**, nicht je Welt: Ein Rathaus gehört in jede Stadt.
Die Region ergibt sich aus dem Grundstück, auf dem das Gebäude steht.

### 3.3 Aktionen als reine Logik ✓

`WORK` ausformulieren — die Regeln als reine Funktionen in `buildingAction.logic.ts` mit
Vitest-Specs, die Persistenz daneben im Service. Das ist Festivals `.logic`/`.service`-
Trennung und hier besonders wertvoll, weil Spielbalance sich ständig ändert und genau
diese Regeln testbar bleiben müssen.

**`SLEEP` und `BECOME_CITIZEN` sind entfallen.** Beides waren Prototyp-Reste, die dem
Konzept widersprechen: Aktionspunkte wachsen je Tick von selbst nach, womit Schlafen
nichts bewirkte, und ein Bürgerrecht kennt das Konzept nicht — jeder Charakter hat eine
Stimme. Erholung bekommt mit den Bedürfnissen aus 4.6 eine Wirkung; dann kommt sie
wieder, dann aber mit Folgen.

Der **Lohn steht in der Gebäudevorlage**, nicht als Konstante in der Logik: So zahlt die
Schmiede mehr als die Kate, und eine Balancing-Änderung gilt sofort für alle Betriebe.
Ein Anstellungsverhältnis mit Vertrag und Laufzeit kommt erst mit 4.6; bis dahin arbeitet
man tageweise dort, wo man steht. Die Fehlschläge tragen einen **Code, keinen Satz** — die
Formulierung steht in `$lib/actionMessage.ts`, sonst wäre sie an jeder Route neu
ausgeschrieben.

**Der Weltaufbau bekommt zwei städtische Gebäude.** Ohne sie ist die Welt eine Sackgasse:
Wer neu anfängt, hat zehn Münzen, ein Grundstück kostet vierzig, und es gab keinen
Betrieb, in dem sich etwas verdienen ließe. Rathaus und städtische Schmiede stehen auf
regulären Grundstücken und belegen damit knappen Platz wie jedes andere Haus. Die
endgültige Starthilfe regelt Punkt 14 in `OFFENE_PUNKTE.md`.

_Fertig, wenn:_ Registrieren → arbeiten → Grundstück kaufen → bauen läuft durch. —
Erledigt und am laufenden Server durchgespielt: Ermenrich verdient sich in 44 Schichten
132 Münzen, kauft „Am Markt 4“ und stellt sein Wohnhaus darauf.

### 3.4 Charakterseite ausbauen ✓

Energie, Geld, Alter, Wohnort, Arbeitsplatz und Besitz anzeigen statt nur Name und
Titel.

**Der Arbeitsplatz fehlt mit Absicht:** Ein Anstellungsverhältnis gibt es erst mit 4.6,
bis dahin ist schlicht nichts anzuzeigen. Dafür steht dort jetzt der Aufenthaltsort, der
Bestand an Grundstücken und Gebäuden und das Zuhause. Wer sein erstes Wohnhaus baut,
zieht dabei ein — sonst stünde er mit einem eigenen Haus in der Stadt und trotzdem als
obdachlos auf seiner Seite; ein Umzug als eigene Handlung lohnt erst, wenn es mehrere
Häuser zur Wahl gibt.

## Phase 4 — Konzept umsetzen

Ab hier wird gebaut, nicht repariert. Inhaltliche Grundlage: `KONZEPT.md`.

**4.1 Zeit.** ✓ Zwei Teile, die man auseinanderhalten muss.

_Die Rechnung:_ `tick.logic.ts` als reine Funktion — aus `world.currentTick` und
`character.lastTickProcessed` ergibt sich, wie viele Aktionspunkte nachwachsen
(gedeckelt) und was sonst fällig ist. Alles Weitere hängt daran, deshalb zuerst und mit
gründlichen Specs.

_Der Takt:_ Ein Prozess, der `world.currentTick` hochzählt, auch wenn niemand angemeldet
ist — die Welt läuft weiter (siehe `KONZEPT.md`). Auf einem Uberspace mit einem einzigen
Node-Prozess ist ein Intervall im Server der einfachste Weg; ein Cron gegen einen
geschützten Endpunkt wäre die robustere Variante, weil er einen hängenden Prozess
sichtbar macht. **Entschieden für das Intervall** — der Cron lohnt sich, sobald ein
stehengebliebener Takt jemandem auffiele. Nachgesehen wird jede Minute, weitergestellt
stündlich.

**Verpasste Ticks werden übersprungen** (die Entscheidung aus Punkt 3 der offenen Punkte,
jetzt in `KONZEPT.md`). Damit fällt die geplante Deckelung ersatzlos weg: Es gibt keine
Schleife über die fehlenden Ticks, sondern ein Bulk-Update — gleich teuer für eine Stunde
wie für eine Woche.

Drei Dinge, die sich erst beim Bauen zeigten:

- **Verschoben wird _um_ die Ausfallzeit, nicht _auf_ die neue Weltzeit.** Der erste Wurf
  setzte `lastTickProcessed` für alle auf den neuen Tick — und hätte damit auch das
  Aktionsbudget einkassiert, das jemand rechtmäßig angesammelt hat, während der Server
  lief. Richtig ist ein `increment` um die Zahl der verpassten Ticks. Dasselbe gilt für
  `lastConditionTick`: Ein Ausfall darf keine Häuser verfallen lassen.
- **Der Ankerpunkt wandert um volle Ticks, nicht auf „jetzt“.** Sonst ginge bei jedem
  Durchlauf der angebrochene Rest verloren und die Weltzeit bliebe langsam, aber stetig
  hinter der Echtzeit zurück. Ein Test lässt den Takt deshalb im 40-Minuten-Rhythmus über
  einen Tag laufen und besteht auf genau 24 Ticks.
- **Das Nachwachsen muss auch _innerhalb_ der Handlungs-Transaktionen greifen**, nicht nur
  beim Anzeigen. Sonst rechnet eine Schicht gegen den Stand von gestern, und wer lange
  nicht da war, könnte trotz vollem Vorrat nicht arbeiten. `characterService.loadForAction()`
  ist deshalb der gemeinsame Einstieg für alles, was Ressourcen verbraucht: erst sperren,
  dann nachwachsen, dann abrechnen.

Ab diesem Takt hängen später auch NPC-Handeln (4.6), Ereignisse (4.8) und das Ende von
Wahlperioden (4.7) — alles, was passieren muss, ohne dass jemand hinschaut.

_Fertig, wenn:_ Die Uhr läuft ohne Zutun weiter und ein Ausfall verschenkt nichts. —
Erledigt und am laufenden Server nachgestellt: Weltuhr um drei Stunden zurückdatiert,
Server gestartet, Uhr springt um drei Ticks (zwei davon verpasst), der Ankerpunkt wandert
exakt drei Stunden, und der Charakter mit zehn Ticks rechtmäßigem Rückstand behält sie.

**4.2 Lebenszyklus.** ✓ Alterung aus `birthTick`, Sterbewahrscheinlichkeit, Tod des
Spielercharakters, **Erbenwahl durch den Spieler** unter den eigenen Kindern, gesetzlicher
Anteil für die übrigen, Besitzübergang. Kinderlos heißt: Dynastie auf `isExtinct`, Besitz
an die Stadt, neue Dynastie anlegbar.

Dass der Erbteil der Geschwister aus einem Gesetz kommt, heißt für die Umsetzung: Der
Satz ist ein Parameter, kein Literal — auch solange es die Politik aus 4.7 noch nicht
gibt. Sonst muss die Erbschaftslogik später umgebaut werden.

_Entschieden:_ Das Sterberisiko folgt einer **Gompertz-Kurve** — vor 40 nichts, danach
Verdopplung alle 8 Jahre. Mittleres Sterbealter um 70, aber ohne harte Obergrenze: Ein
Alter, ab dem der Tod sicher ist, machte aus dem Lebensende einen Schalter. Zwei Tests
halten das Balancing fest, statt nur die Formel zu prüfen — die Hälfte muss über die 70
kommen, und einzelne müssen 90 werden.

_Entschieden:_ Der Erbe wird **vorab benannt**, mit Rückfall auf das älteste volljährige
Kind. Die Alternative — das Haus wartet auf den nächsten Login — verträgt sich nicht mit
4.1: Die Welt läuft weiter, und ein eingefrorener Betrieb wäre ein Loch darin.

_Entschieden:_ Geteilt wird nur das **Bargeld** (Vorgabe 25 % unter den Geschwistern),
Grundstücke und Gebäude gehen ungeteilt an den Erben. Ein Viertel eines Hauses ist
nichts, was man bewohnen oder renovieren kann, und über Generationen zersplitterte
Grundbesitz sonst zu Bruchteilen.

Drei Dinge, die sich beim Bauen zeigten:

- **Das Sterben gehört an den Takt, nicht an den Seitenaufruf.** Anders als das
  Aktionsbudget lässt es sich nicht faul beim Lesen nachrechnen: Ein Todesfall betrifft
  Kinder, Besitz und Stadtkasse. Würde er erst beim Hinsehen ausgelöst, stürben nur die
  Charaktere aktiver Spieler. Teuer ist der Durchlauf trotzdem nicht — vor 40 ist das
  Risiko null, die Abfrage holt nur die Alten.
- **Ein Wurf je Herzschlag, nicht je übersprungenem Tick.** Sonst raffte ein
  Wochenendausfall beim Neustart eine halbe Generation dahin, für Spieler, die nicht
  zusehen konnten. Ergibt sich aus 4.1 von selbst, muss aber so gemeint sein.
- **Minderjährige erben notfalls doch.** Die Regel sagt „ältestes volljähriges Kind",
  lässt aber offen, was bei lauter Minderjährigen gilt. Ein Haus, das an seinen Kindern
  vorbei erlischt, bestrafte den Spieler für den Zeitpunkt seines Todes — den er nicht
  steuert. Also erbt dann das älteste Kind.

Nebenbei ein Fund im Bestand: `planWorldAdvance()` reichte ein ungültiges Datum als `NaN`
weiter, bis in ein `UPDATE worlds SET currentTick = NULL`. Die Datenbank fing es ab, aber
mit einer Meldung über das Symptom. Jetzt wirft die Rechnung selbst, und zwar mit Namen.

_Fertig, wenn:_ Ein Charakter stirbt am Alter, das Haus geht an den Erben über oder
erlischt, und der Spieler kann danach neu anfangen. — Erledigt und am laufenden Server
durchgespielt: eine NPC-Greisin starb, ihre 137 Münzen landeten in der Stadtkasse
(80 → 217); ein Spielercharakter ohne Erben nahm sein Haus mit ins Grab, und die
Dynastieseite bot danach die Neugründung an.

**4.3 Beziehungen.** ✓ `relationship.logic.ts` als reine Funktionen: die drei Schichten zu
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

_Gewählt:_ **Exponentieller Verfall** über eine Halbwertszeit, fünf Jahre für Menschen,
fünfzehn für Häuser. Nicht aus Geschmack: Diese Kurve ist die einzige, die sich
zusammensetzen lässt — zweimal fünf Jahre ergeben genau dasselbe wie einmal zehn. Bei
linearem Verfall hinge das Ergebnis daran, wie oft zwischendurch nachgerechnet wurde.
Ein Test lässt beides gegeneinander laufen, Tick für Tick über zwölf Jahre.

_Gewählt:_ Skala von -100 bis +100, Hausschicht mit **halbem Gewicht**. Damit reicht die
persönliche Schicht weiter als die Fehde, und der Kampf gegen den Strom ist gewinnbar,
aber teuer. Die Deckelung steht ganz außen: Ein Verwandtschaftsbonus soll den Hass nicht
heimlich anheben.

_Gewählt:_ Der natürliche Abdruck auf die Häuser ist ein **Zehntel**, auf ganze Punkte
gerundet. Unter fünf Punkten bewegt sich damit gar nichts — ein Gruß auf der Straße ist
keine Außenpolitik.

Drei Dinge, die sich beim Bauen zeigten:

- **Der Verfall zieht Richtung Grundwert, nicht Richtung null.** Gespeichert wird die
  Abweichung; sie klingt gegen null ab, und damit die Zuneigung gegen Verwandtschaft plus
  Hausstand. Ein Bruder, den man Jahre nicht gesehen hat, ist wieder einfach ein Bruder —
  nicht ein Fremder.
- **Die Häuser ziehen in beide Richtungen mit.** Beim Schreiben des Tests fiel auf, dass
  Romeos Zuneigung die Fehde nicht nur überstimmt, sondern sie um neun Punkte mildert.
  Das war nicht geplant, ist aber genau richtig: Wo sich genug Leute über die Grenze
  hinweg anfreunden, hört eine Fehde von selbst auf. Steht jetzt als eigener Test da.
- **`Math.round(-0.4)` ist `-0`.** Rechnerisch dasselbe wie null, aber `Object.is` und
  `JSON.stringify` sehen einen Unterschied — eine Höflichkeit hätte je nach Vorzeichen
  anders ausgesehen.

Nebenbei umgezogen: `ActionFailureReason` stand bei den Gebäudehandlungen und gilt jetzt
für alle. Eigene Datei, weil „nicht genug Kraft" und „zu weit weg" für eine Schicht in
der Schmiede so gelten wie für einen Besuch beim Nachbarn.

Damit 4.3 überhaupt anfassbar ist, kam eine Seite `/people` dazu und **eine** freundliche
Handlung: Zeit mit jemandem verbringen, ein Aktionspunkt, sechs Punkte Zuneigung. Klein
gehalten mit Absicht — wer eine Freundschaft will, muss wiederkommen. Feindliche
Handlungen fehlen noch, sie hängen an Kämpfen und Verletzungen (Punkt 6).

_Fertig, wenn:_ Zuneigung entsteht, verfällt und schlägt auf die Häuser durch, ohne dass
das Nachsehen sie verändert. — Erledigt und am gebauten Server durchgespielt: fünf
Besuche machten aus „gleichgültig" eine „Freundschaft" und kosteten fünf Aktionspunkte.

**4.4 Familie und Bevölkerung.** ✓ Werben, Heirat, Zeugung, Geburt; Geschwister als NPCs
mit indirekten Befehlen (anstellen, verheiraten, ins Amt schicken) und einfachen
Eigenregeln. Bei einer Ehe zweier Spielerhäuser entscheidet ein Münzwurf je Kind, welchem
Haus es zufällt.

Hier entsteht auch die **Bevölkerungsdynamik**: NPCs heiraten und bekommen selbst Kinder,
dazu kommen die überzähligen Kinder der Spielerhäuser. Das gehört an den Welt-Takt aus
4.1, nicht an Seitenaufrufe — und es braucht Beobachtung: Eine Bevölkerung, die
langfristig schrumpft oder explodiert, nimmt Wirtschaft und Politik den Boden. Eine
einfache Statistik über Einwohner, Geburten und Tote je Stadt gehört deshalb gleich mit
dazu.

_Entschieden:_ Kinder kommen **von selbst am Takt**, bei Verheirateten im fruchtbaren
Alter. Nicht als Handlung mit Aktionspunkten — sonst bräuchten NPCs eine eigene Regel,
die dasselbe nachbildet, und zwei Simulationen nebeneinander machen Balancing unmöglich.
Der Spieler entscheidet über die Ehe, nicht über jedes Kind.

_Entschieden:_ **Wohnraum begrenzt die Bevölkerung.** Kinder kommen nur, wo Platz ist —
vier in einem Wohnhaus. Damit hängt die Geburtenrate an den Bauwerken aus 4.5, und
knappes Bauland wirkt bis in die Kinderstube: Eine volle Stadt stagniert von selbst,
statt bis zum Kollaps zu wachsen. Nahrung als zusätzliche Bremse kommt mit 4.6 dazu.

Vier Dinge, die sich beim Bauen zeigten:

- **Erst gebären, dann empfangen.** Andersherum belegte das Neugeborene sofort den Platz,
  über den die nächste Empfängnis entscheidet — die Geburtenrate hinge dann an der
  Reihenfolge zweier Schleifen statt an der Welt.
- **Ein Antrag endet auf zwei Arten.** Bei einem NPC steht die Ehe sofort, bei einem
  Spielercharakter liegt der Antrag und wartet. Am laufenden Server fiel auf, dass die
  Meldung beides gleich nannte — „Der Antrag ist gestellt", obwohl schon geheiratet war.
- **Bei der Annahme wird alles noch einmal geprüft.** Zwischen Antrag und Annahme können
  Jahre liegen: Der andere kann inzwischen anderweitig geheiratet haben, die Zuneigung
  kann verfallen sein, einer kann tot sein.
- **Gefragt ist, wie der Umworbene zum Werbenden steht** — nicht umgekehrt. Wer heiratet,
  muss gewollt sein, nicht wollen. Die Beziehung aus 4.3 ist gerichtet, und hier zeigt
  sich, warum das keine Spitzfindigkeit war.

Die Verwandtenehe ist ausgeschlossen, und zwar über dieselbe `kinshipBetween` aus 4.3:
Jede erkannte Verwandtschaft verbietet die Ehe. Weil der Stammbaum nur bis zu den
Großeltern reicht, dürfen Vettern heiraten — mittelalterlich zutreffend und eine Suche
über beliebig viele Generationen gespart.

Der **Stammbaum** steht auf der Dynastieseite und führt die Toten mit: Ein Stammbaum, der
nur die Lebenden zeigt, ist eine Anwesenheitsliste. Bewusst eine Liste mit
„Kind von …" statt gezeichneter Linien — das lohnt erst, wenn es etwas zu verzweigen gibt.

Die **Bevölkerungsstatistik** kommt ohne eigene Tabelle aus: Geburten und Tote ergeben
sich aus `birthTick` und `deathTick`. Ein Protokoll wäre eine zweite Wahrheit, die mit
der ersten auseinanderlaufen kann.

_Fertig, wenn:_ Zwei heiraten, bekommen Kinder, und die Stadt trägt sich selbst. —
Erledigt und am gebauten Server durchgespielt: viermal geworben (aus „gleichgültig" wurde
„Verbundenheit"), einem NPC einen Antrag gemacht und sofort geheiratet, einem
Spielercharakter einen Antrag gemacht, der liegen blieb. Eine hochschwangere Reinhild
brachte beim nächsten Herzschlag Ingram zur Welt — der steht jetzt im Stammbaum, in der
Erbfolge und in der Einwohnerzahl.

**4.5 Gebäude und Grundstücke.** `building.logic.ts`: Zustand aus verstrichenen Ticks,
Renovieren, Ausbaustufen, Übergang zur Ruine. Dazu Grundstücke als knappes Gut, An- und
Verkauf von `plot` und `building` über den nullbaren `forSalePrice`, Besitzübergang beim
Erbfall (greift zurück auf 4.2).

Zwei Dinge, die hier leicht untergehen: Die Ruinen-Prüfung muss **an jeder Ladestelle**
greifen, nicht nur auf der Gebäudeseite — sonst hängt es vom Zufall ab, wann ein Haus
zusammenfällt. Und Renovieren kostet zunächst nur Geld; die Kopplung an Baumaterial
kommt mit 4.6 dazu, sobald es Waren gibt.

**4.5a Fertigkeiten.** `skill.logic.ts`: Übung in Stufen umrechnen, steigender Aufwand je
Stufe, Wirkung einer Stufe auf Ertrag und Erfolg. Dazu die `skill`-Tabelle (spärlich —
wer nie geschmiedet hat, hat keine Zeile) und die **Lehre** als Handlung, die bei Meister
und Schüler Aktionspunkte kostet.

Die krumme Nummer ist Absicht: Der Schritt gehört **zwischen 4.5 und 4.6**, weil Lohn und
Ausstoß ab 4.6 an ihm hängen. Ein Umnummerieren würde fünfzehn Verweise in Codekommentaren
entwerten, die auf 4.6 und 4.7 zeigen — und die sind mehr wert als eine glatte Reihe.

Für die Umsetzung wichtig: Der Fortschritt innerhalb einer Stufe lässt sich **nicht** faul
beim Lesen nachrechnen, anders als Aktionsbudget, Zuneigung und Verfall. Er hängt daran,
was jemand getan hat, nicht daran, wie viel Zeit vergangen ist — also wird bei jeder
Handlung geschrieben. Das ist die erste Stelle im Spiel, an der das nötig ist.

Zweitens: Fertigkeiten greifen dort ein, wo heute Pauschalen stehen. `work()` gibt jedem
denselben Lohn aus der Gebäudevorlage; das wird zur Rechnung aus Vorlage **und** Können.
Die Vorlage bleibt die Obergrenze — eine Kate wirft auch beim Meister wenig ab.

Der Katalog und die Wirkung je Stufe sind Punkt 17 der offenen Punkte, die Grenzen der
Lehre Punkt 18. Beide müssen vor diesem Schritt fallen.

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

Dazu die **Stadtwache** als erstes Amt mit unmittelbar spürbarem Nutzen: bezahlt aus der
Stadtkasse, wirksam gegen Raub und Räuberzüge. Ob sie ein Amt, eine Anstellung oder
beides ist, steht als Punkt 19 offen — davon hängt ab, ob sie in `office` gehört oder in
`employment`.

**4.8 Ereignisse.** Räuber, Seuche, Brand als Zufallsereignisse am Tick, gemildert durch
öffentliche Bauten (Mauer, Brunnen) **und durch die Wache aus 4.7**. Protokolliert in `event` und sichtbar als
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

**4.5a gehört vor 4.6**, auch wenn die Nummer es nicht sofort verrät: Ab der Wirtschaft
hängen Lohn und Ausstoß an Fertigkeiten, und die nachträglich in eine fertige Produktion
einzuziehen hieße, jede Formel noch einmal aufzumachen.

Zwei Dinge stehen bewusst früher, als es die Gliederung nahelegt: der
**Deployment-Durchstich** (2.4), weil sich Deploy-Probleme sonst am Ende häufen, und der
**Weltaufbau** (1.6), ohne den nichts von Phase 3 an überhaupt bespielbar ist.

Was inhaltlich noch offen ist und wann es entschieden sein muss, steht in
**`OFFENE_PUNKTE.md`**. Zwei davon fallen früher als der Rest: die **Zeitskala** vor dem
Weltaufbau (1.6) — ohne Maßstab lässt sich der Seed nicht sinnvoll füllen — und die
**URL-Struktur** vor dem Deploy-Durchstich (2.4), weil ein Base-Path sich sonst
nachträglich durch jeden Redirect ziehen muss.
