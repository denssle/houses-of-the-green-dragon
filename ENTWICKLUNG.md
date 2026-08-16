# Entwicklung

**Warum das Spiel so gebaut ist, wie es gebaut ist.**

Diese Datei begann als Umbauplan: Der Prototyp sollte auf eine tragfähige Architektur
gehoben werden — Sequelize statt JSON-Dateien, echte Sessions, reine Logikmodule mit
Tests, Deployment über GitHub Actions. Dieser Umbau ist abgeschlossen; die Phasen 1
bis 3 sind Geschichte, und Phase 4 hat aus dem Gerüst eine Welt gemacht.

Geblieben ist der Teil, der sich nicht aus dem Code ablesen lässt: **warum** eine Sache
so entschieden wurde und was beim Durchspielen schiefging. Der Gompertz-Verlauf beim
Sterben, das Spieljahr aus fünfzig statt achtundvierzig Ticks, das Henne-Ei bei der
ersten Zimmerei, die Grundstücke, die versteigert **und** zum Festpreis angeboten
wurden — das steht nirgends sonst.

Gelesen wird sie deshalb rückwärts: Wer wissen will, warum etwas so ist, sucht den
Schritt, in dem es entstand.

**Ab Phase 5 liest sie sich wieder vorwärts.** Nachdem das Konzept in mehreren Runden
gewachsen ist, steht dort die Reihenfolge, in der das Übrige gebaut werden soll — dieselbe
Rolle, die Phase 4 einmal hatte, bevor sie Häkchen bekam. Die Arbeitsteilung bleibt: **Was
zu entscheiden ist**, steht in `OFFENE_PUNKTE.md`, **was das Spiel werden soll** in
`KONZEPT.md`, und **in welcher Reihenfolge es entsteht**, hier.

Ein ✓ markiert einen abgeschlossenen Schritt. Die ohne Haken sind Vorhaben, die
beschrieben, aber nicht gebaut wurden.

Stand des ursprünglichen Plans: Bestandsaufnahme vom 12.08.2026, Commit `ee6d703`.

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
braucht Geburtsticks. Maßstab ist **1 Tick = 1 Stunde, 50 Ticks = 1 Spieljahr** (siehe
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

**4.4a Persönlichkeit.** ✓ Sechs Achsen am Charakter, vererbt mit Streuung, festgelegt bei
der Geburt; `personality.logic.ts` für Vererbung und Etikett; Anzeige auf der
Charakterseite und **in der Erbfolge**, wo sie sofort etwas ändert.

**Der Zeitpunkt ist der Punkt.** Was hier entsteht, sind Anlagen bei der Geburt — jeder
Charakter, der ohne sie zur Welt kommt, braucht sie später nachgereicht, und dann sind
es erfundene Zahlen statt vererbter. Seit 4.4 werden Kinder geboren; jeder Tag ohne
diesen Schritt vergrößert den Bestand, für den nichts Besseres bleibt als Würfeln. Das
ist der ganze Grund, warum er vor 4.5 steht und nicht bei 4.6.

**Gebaut wird nur die eine Hälfte:** die Anlagen und ihre Vererbung. Was NPCs damit
_tun_, gehört zu 4.6 — vorher gibt es kaum Entscheidungen, die sie treffen könnten. Die
Achsen ohne Verhalten sind trotzdem kein toter Wert: Sie stehen ab sofort in der
Erbfolge, und damit ist die Wahl des Erben nicht mehr allein eine Frage des
Geburtsdatums.

Für den Bestand — die acht Fremd-NPCs aus dem Weltaufbau und die vorhandenen
Spielercharaktere — bleibt nur Würfeln. Das ist vertretbar: Sie sind die erste Generation,
sie haben keine Eltern, von denen sie etwas erben könnten.

Drei Dinge, die sich beim Bauen zeigten:

- **Die Migration darf die Spiellogik nicht importieren.** Sie würfelt den Bestand aus,
  und die Zahlen dafür stehen in ihr ausgeschrieben — nicht als Aufruf von
  `randomPersonality()`. Eine Migration muss in fünf Jahren noch dasselbe tun; importierte
  Logik entwickelt sich mit dem Spiel weiter und veränderte diesen Schritt rückwirkend.
- **Der Mittelwert dreier Würfe statt eines einzelnen.** Das ergibt eine Glockenkurve
  statt einer Gleichverteilung. Sonst wäre ein Charakter mit +95 Gier so häufig wie einer
  mit 0, und eine Stadt voller Extreme ist keine Bevölkerung, sondern ein Panoptikum. Am
  ausgewürfelten Bestand nachgezählt: Werte um die Mitte überwiegen deutlich.
- **Ein Wort je Richtung genügt.** Im Deutschen dekliniert sich das Adjektiv schwach —
  „der Gierige" und „die Gierige" sind dieselbe Form, nur der Artikel unterscheidet sich.
  Damit braucht es keinen zweiten Satz Formen, der beim Erweitern vergessen würde.

Eine Ungenauigkeit bleibt und ist bewusst in Kauf genommen: Ingram, das erste in dieser
Welt geborene Kind, hat gewürfelte statt geerbter Anlagen — er kam vor der Migration zur
Welt, seine Eltern hatten damals selbst noch keine. Genau dieser Fall wäre bei jedem
weiteren Kind entstanden, hätte der Schritt bis 4.6 gewartet.

_Fertig, wenn:_ Jeder Charakter hat Anlagen, Kinder erben sie, und die Erbfolge zeigt sie.
— Erledigt und am gebauten Server durchgespielt: Die Migration hat zehn Charaktere
ausgewürfelt, Reinhild ist „die Friedfertige", ihr Sohn Ingram steht als „der Faule" in
der Erbfolge.

**4.5 Gebäude und Grundstücke.** ✓ `building.logic.ts`: Zustand aus verstrichenen Ticks,
Renovieren, Ausbaustufen, Übergang zur Ruine. Dazu Grundstücke als knappes Gut, An- und
Verkauf von `plot` und `building` über den nullbaren `forSalePrice`, Besitzübergang beim
Erbfall (greift zurück auf 4.2).

Zwei Dinge, die hier leicht untergehen: Die Ruinen-Prüfung muss **an jeder Ladestelle**
greifen, nicht nur auf der Gebäudeseite — sonst hängt es vom Zufall ab, wann ein Haus
zusammenfällt. Und Renovieren kostet zunächst nur Geld; die Kopplung an Baumaterial
kommt mit 4.6 dazu, sobald es Waren gibt.

_Entschieden:_ **Ruine nach zwanzig Spieljahren** ohne jede Pflege — vierzig Realtage.
Renovieren wird damit zu einer Sache von drei, vier Mal im Leben statt zur Wochenaufgabe,
und ein geerbtes Haus ist ein echtes Erbe und kein Sanierungsfall.

_Entschieden:_ Beim Wohnhaus **Kate 4 → Haus 6 → Großhaus 9** Bewohner. Spürbare Sprünge,
aber kein Vervielfachen: Wer viele Kinder will, muss zweimal ausbauen — und danach ein
zweites Grundstück kaufen. So bleibt knappes Bauland die härtere Grenze und nicht der
Ausbau der bequeme Ausweg.

Der Verfall ist bewusst **linear** und nicht exponentiell wie die Zuneigung. Dort nähert
sich der Wert einem Grundwert an, hier soll ein Ende stehen: die Ruine. Eine Kurve, die
sich der Null nur nähert, käme nie an — und dann gäbe die Welt kein Bauland zurück.

Vier Dinge, die sich beim Bauen zeigten:

- **Der Zustand mindert den Lohn, aber nie auf null.** Eine verfallene Hütte produziert
  weniger — sonst wäre der Verfall erst am Ende spürbar. Ein Aktionspunkt, der gar nichts
  einbringt, wäre allerdings ein Verlust ohne Ansage; deshalb bleibt mindestens eine
  Münze übrig, solange überhaupt gezahlt wird.
- **Ein Ausbau macht das alte Gemäuer nicht neu.** Wer ein verfallenes Haus ausbaut, hat
  ein größeres verfallenes Haus. Deshalb rührt der Ausbau `lastConditionTick` nicht an —
  im Gegensatz zur Renovierung, wo genau das Vergessen dieser Zeile die Renovierung im
  selben Moment wieder verbraucht hätte.
- **Der Bewohner-Fremdschlüssel trägt nicht.** `ON DELETE SET NULL` greift nur, wenn die
  Datenbank Fremdschlüssel durchsetzt, und SQLite tut das nur mit eingeschaltetem Pragma.
  Die Bewohner werden deshalb ausdrücklich ausgetragen, bevor die Zeile verschwindet.
- **Öffentliche Gebäude verfallen vorläufig nicht.** Ohne diese Ausnahme wäre die
  städtische Schmiede nach zwanzig Jahren eine Ruine — und mit ihr der einzige Weg, auf
  dem ein Neuling überhaupt Geld verdienen kann. Ihre Instandhaltung ist eine
  Amtshandlung aus der Stadtkasse, und die gibt es erst mit 4.7.

_Fertig, wenn:_ Häuser verfallen, lassen sich renovieren, ausbauen und verkaufen, und am
Ende steht die Ruine. — Erledigt und am gebauten Server durchgespielt: Ein Wohnhaus stand
nach zehn Jahren bei genau 50, die Renovierung kostete die fehlenden 50 Punkte zu zwei
Münzen, der Ausbau machte aus der Kate ein Haus, und nach weiteren 25 Jahren waren alle
drei Privathäuser der Welt Ruinen — Grundstücke beim Eigentümer, Bewohner ohne Dach,
Rathaus und städtische Schmiede unversehrt.

**4.5a Fertigkeiten.** ✓ `skill.logic.ts`: Übung in Stufen umrechnen, steigender Aufwand je
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

_Entschieden:_ **Zehn Stufen, Verdopplung je Stufe ab fünf Übungen.** Stufe 10 kostet
insgesamt 2.555 Übungen — ein Charakter sammelt von der Volljährigkeit bis zum mittleren
Sterbealter rund 2.600 Aktionspunkte, Meisterschaft ist also buchstäblich ein Lebenswerk.
Stufe 6 kostet 155 und läuft nebenbei mit. Zwei Tests halten genau das fest, statt nur
die Formel zu prüfen.

_Entschieden:_ **Jeder darf lehren, gegen Geld, und der Schüler bleibt zwei Stufen
zurück.** Nicht nur die eigenen Kinder: Ein Neuling ohne Familie hätte sonst keinen
Zugang zu Können, und die Startbedingungen (Punkt 14) sind ohnehin die empfindlichste
Stelle des Spiels. Das Lehrgeld geht an den Meister — damit hat Meisterschaft ein
Einkommen jenseits der Werkbank, und die Zunft entsteht von selbst, ohne dass es sie als
eigenes System geben müsste.

Der Katalog beginnt bewusst mit **zwei** Fertigkeiten, und beide wirken heute schon:
**Schmieden** hebt den Lohn, **Bauen** senkt die Renovierungskosten. Handel (4.6),
Redekunst (4.7) und Kämpfen (Punkt 6) kommen mit den Handlungen, zu denen sie gehören —
eine Fertigkeit ohne Wirkung wäre eine Zahl, die niemand liest. Dasselbe Maß, das schon
bei den Persönlichkeitsachsen galt.

Drei Dinge, die sich beim Bauen zeigten:

- **Abrunden verschluckte die ersten drei Stufen.** Bei einem Grundlohn von drei Münzen
  ist `floor(3 × 1,3)` wieder drei: Nach zwanzig Schichten stand am laufenden Server
  immer noch „Feierabend. 3 Münzen verdient." Kein Rechenfehler, aber eine Rückmeldung,
  die dem Spieler seine Mühe verschweigt. Jetzt wird gerundet, und Stufe 2 ist sichtbar.
- **Eine Lehrstunde springt über mehrere Stufen.** Zwanzig Übungen auf einmal reichen auf
  den unteren Stufen für zwei oder drei Sprünge — die Schleife in `practice()` ist
  deshalb keine Zierde, sondern verhindert, dass der Überschuss verfällt.
- **Übung über der Höchststufe verfällt.** Sonst ließe sie sich horten und beim nächsten
  Anheben der Obergrenze schlagartig einlösen.

Eigene Tabelle statt Spalten am Charakter — anders als bei der Persönlichkeit, wo es
genau einen Satz Werte gibt: Der Fertigkeitenkatalog wächst, und als Spalten hieße jede
neue Fertigkeit eine Migration am Charakter.

_Fertig, wenn:_ Arbeit macht besser, Können zahlt sich aus, und ein Meister kann lehren.
— Erledigt und am gebauten Server durchgespielt: Zwanzig Schichten brachten Reinhild auf
Schmieden Stufe 3, der Lohn stieg von 3 auf 4 Münzen; eine Lehrstunde bei Adelbert
(Stufe 9) kostete 45 Münzen und hob sie in einem Zug auf Stufe 4.

**4.5b Jahreszeiten.** ✓ Frühling, Sommer, Herbst und Winter als **reine Rechnung** aus
der Weltuhr — keine Spalte, kein Takt, keine zweite Wahrheit neben `currentTick`.

Vorgezogen aus demselben Grund wie 4.5a: Ab 4.6 hängen Ernte, Bedürfnisse und Preise an
der Jahreszeit. Sie nachträglich in fertige Formeln einzuziehen hieße, jede einzelne
wieder aufzumachen.

**Das Spieljahr ist dabei von 48 auf 50 Ticks gewachsen.** Bei achtundvierzig Stunden
wäre ein Jahr exakt zwei Realtage — und damit läge jede Uhrzeit für immer an derselben
Stelle des Kalenders: Wer täglich um sieben spielt, sähe bis in alle Ewigkeit dieselben
zwei Jahreszeiten und kaufte nie Winterkleidung. Nachgerechnet: bei 48 Ticks **nie** alle
vier, bei 50 nach fünfzehn Tagen, bei 60 nach fünf. Fünfzig ist der Kompromiss, der die
Zeitskala kaum anfasst; zwei Tests halten beides fest — dass es wandert und dass es bei
48 stehenbliebe.

Die Änderung war ein Einzeiler, weil `TICKS_PER_YEAR` sauber zentralisiert war: 293 Tests
liefen unverändert durch. Zwei Stellen hatten die 48 doch ausgeschrieben, beide in der
Bevölkerungsstatistik aus 4.4 — genau die Art Rest, die eine solche Änderung findet.

Gebaut ist bisher **eine** Wirkung: Frost verteuert Bauarbeiten um ein Viertel. Ernte zur
Saison und Winterkleidung gehören zu 4.6, wo es Waren gibt, die man ernten und tragen
kann.

**4.6 ist kein Schritt, sondern vier.** So, wie er unten steht, enthält er Waren,
Bedürfnisse, Anstellung, Produktion, Pacht, Läden und NPC-Konsum — jedes davon mit
eigenen offenen Fragen. Geteilt in **4.6a** (Waren und Bedürfnisse), **4.6b** (Produktion
und Pacht), **4.6c** (Handel) und **4.6d** (Anstellung).

Nebenbei eine Korrektur am Zuschnitt: Die Punkte 5 (Krankheiten) und 6 (Kämpfe) galten
als „fällig vor 4.6". Das stimmt nicht — sie werden für **einzelne Waren** gebraucht
(Heiltrank, Gift, Rüstung), nicht für die Wirtschaft selbst. Fällig sind sie vor diesen
Waren, und die kommen ohnehin zuletzt.

**4.6a Waren und Bedürfnisse.** ✓ `itemTemplate` als Code, `inventory` spärlich, Hunger
als faul ausgewertete Sättigung, Essen als Handlung. Dazu der **städtische
Kornspeicher** — eine Krücke wie die städtische Schmiede aus 3.3, bis es mit 4.6b Bauern
und mit 4.6c Läden gibt. Ohne eine Quelle für Nahrung verhungerte die Stadt, bevor die
Produktion gebaut wäre.

_Entschieden (Punkt 4):_ **Gestaffelt — erst Leistung, dann Leben.** Wer hungert, sammelt
zuerst weniger Aktionspunkte; erst weiter unten steigt das Sterberisiko. Das gibt eine
Vorwarnung, die der Spieler selbst verschuldet hat, statt ihn ohne Ansage zu töten — bei
Permadeath der Unterschied zwischen einer harten und einer unfairen Regel.

_Entschieden:_ **Vier Realtage bis zum Verhungern** (hundert Ticks, zwei Spieljahre).
Essen ist damit etwas, das man alle paar Tage regelt; wer übers Wochenende nicht
hereinschaut, kommt nicht hungernd zurück. Ein Test hält genau das fest.

Vier Dinge, die sich beim Bauen zeigten:

- **Die Not braucht ein eigenes Sterberisiko, keinen Faktor.** Der naheliegende Weg wäre,
  das Altersrisiko zu vervielfachen — und wäre falsch: Vor vierzig ist es null, und jedes
  Vielfache von null bleibt null. Ein Zwanzigjähriger hätte nicht verhungern können,
  ausgerechnet der, den es am ehesten trifft. Jetzt addiert sich die Not, und die
  Todesabfrage muss beide Wege kennen.
- **`NaN` lief in die höchste Gefahr.** Die Abfrage lud die Sättigungsspalte nicht mit,
  `undefined` wurde zu `NaN`, und `NaN` fiel durch jeden Vergleich hindurch bis zum
  Höchstrisiko: Beim ersten Testlauf starben die Alten reihenweise. Dieselbe Klasse wie
  das `NaN` in der Weltuhr aus 4.2 — die Funktion fängt es jetzt selbst ab.
- **Jeder neu angelegte Charakter startete hungernd.** `lastNeedTick` steht per Vorgabe
  auf null, und die Sättigung rechnet gegen die Weltzeit: Ein Neugeborener war rechnerisch
  seit Weltbeginn ohne Nahrung. Betraf alle drei Anlegestellen — Spielercharakter,
  Neugeborene und Weltaufbau.
- **Hunger senkt die Obergrenze, nicht den Zufluss.** Beim Zufluss müsste man wissen, wie
  satt jemand in der Zwischenzeit war; die Rechnung wäre nur noch näherungsweise richtig.
  Über die Obergrenze bleibt sie exakt — und niemandem wird genommen, was er sich satt
  erarbeitet hat.

_Fertig, wenn:_ Hunger tut weh, Essen hilft, und die Stadt hat eine Quelle dafür. —
Erledigt und am gebauten Server durchgespielt: fünf Brote für zwanzig Münzen, nach
siebzig Ticks ohne Mahlzeit „hungrig (30 von 100)", ein Laib brachte auf 70 zurück.

**4.6b NPCs handeln.** ✓ Vorgezogen, und zwar dringend: Mit 4.6a bekam **jeder** Charakter
Hunger — aber nur Spieler konnten essen. Ein Verhungernder trägt 4,5 % Risiko je Tick;
nach drei Realtagen leben noch 3,6 %. Die Welt hätte sich binnen einer Woche entvölkert,
und keine der damals 319 Prüfungen hätte angeschlagen.

Der eigentliche Fehler lag nicht in der Umsetzung, sondern in der Reihenfolge: eine
Anforderung an alle stellen und die Fähigkeit, sie zu erfüllen, nur der einen Hälfte
geben. Dasselbe galt still schon länger für Ehe und Wohnraum, nur ohne tödliche Folge.

_Entschieden:_ **NPCs kommen so oft zum Zug wie Spielercharaktere.** Damit ist die
Kadenz keine eigene Regel, sondern die schon vorhandene: dasselbe Aktionsbudget,
dieselben Kosten. Wer nichts mehr hat, tut nichts mehr — ein Punkt je Tick ist die
natürliche Bremse, und die teuerste Schleife im Spiel drosselt sich selbst.

`npc.logic.ts` entscheidet als reine Funktion, `npcService.ts` führt aus. Die Rangfolge
ist Dringlichkeit, nicht Willkür: erst überleben, dann ein Dach, dann eine Familie.
**Innerhalb** jeder Stufe entscheidet die Persönlichkeit aus 4.4a, ob und wie früh — nicht,
was zuerst kommt. Ein Träger stirbt nicht am Hunger, weil er faul ist; er kümmert sich nur
später darum. Drei der sechs Achsen tragen damit endlich eine Handlung: Fleiß das Essen
und Arbeiten, Gier die Rücklage, Geselligkeit das Werben.

Dazu die **städtische Unterkunft** aus dem Konzept — zwanzig Plätze, der Stadt gehörend.
Ohne Wohnraum keine Kinder (4.4), und ohne Kinder keine Bevölkerung. Die dritte Krücke
dieser Art nach Schmiede und Kornspeicher, und wie diese vermerkt.

Zwei Dinge, die sich beim Bauen zeigten:

- **NPCs entschieden auf Grundlage veralteter Aktionspunkte.** Der gespeicherte Stand ist
  der von der letzten Handlung; wer nichts tat, stand auf null und kam nie wieder zum Zug.
  Beim ersten Simulationslauf starb die Stadt trotzdem aus. Der Einstieg muss derselbe
  sein wie beim Spieler: erst nachwachsen lassen, dann entscheiden.
- **Auch der Trägste muss für sein Essen arbeiten.** Ein Fleiß-Schwellenwert vor der
  Arbeit machte Faulheit zum Todesurteil statt zur Eigenart. Wer hungert und nichts hat,
  arbeitet — die Persönlichkeit entscheidet erst darüber, wie viel er darüber hinaus
  zurücklegt.

Der Nachweis steht als eigener Test: `selfSustaining.spec.ts` lässt die Welt **fünf
Spieljahre ohne einen einzigen Spieler** laufen und prüft, dass danach noch jemand lebt,
niemand hungert, geheiratet wurde, Geld verdient wurde, jemand unter dem Dach der Stadt
wohnt und Kinder geboren sind, die nicht aus dem Weltaufbau stammen. Ein Test, der kein
Verhalten prüft, sondern ein Zusammenspiel — genau die Lücke, durch die 4.6a gefallen ist.

**4.6c Produktion und Pacht.** ✓ Getreide, Mehl, Brot — die erste Kette mit
nachvollziehbarer Herkunft. Abbauflächen werden **gepachtet**, nicht gekauft; Mühle und
Bäckerei sind Gebäudevorlagen mit einem Rezept.

_Entschieden (Punkt 8):_ **Die Pacht fällt beim Tod an die Stadt zurück.** Genau das
unterscheidet sie von Eigentum — sonst wäre sie gekauftes Land mit Extraschritten, die
erste Generation sicherte sich die guten Flächen auf Dauer, und die Politik ab 4.7 hätte
nichts mehr zu vergeben.

_Abweichung mit Ansage:_ Die Pacht ist im Konzept eine **laufende** Belastung. Laufend
hieße ein Durchlauf über alle Pachtverhältnisse je Tick — die zweite teure Schleife nach
den NPCs. Der **Zehnt** auf jede Ernte erreicht dasselbe ohne sie: Wer nichts erntet,
zahlt nichts; wer viel erntet, zahlt viel. Er trifft den Ertrag statt der Zeit, was für
einen Acker sogar treffender ist. Die zeitabhängige Pacht kommt zurück, sobald es Ämter
gibt, die sie eintreiben (4.7).

**Gearbeitet wird auf eigene Rechnung.** Wer mahlt, mahlt sein eigenes Getreide und
behält das Mehl; der Vorrat des Handwerkers ist der Zwischenspeicher. Ein Betrieb, der
Angestellte für Lohn arbeiten lässt und den Ertrag behält, braucht
Anstellungsverhältnisse — die kommen mit 4.6d. Bis dahin ist die Mühle ein Werkzeug,
kein Arbeitgeber.

Der Ertrag hängt an drei Dingen, die alle schon da waren: dem Rezept, dem **Können**
(4.5a) und dem **Zustand** des Betriebs (4.5). Die Ernte zusätzlich an der
**Jahreszeit** — Getreide gibt es im Sommer und Herbst, sonst nicht. Das ist die erste
Wirkung der Jahreszeiten, die etwas **erzeugt** statt nur etwas zu verteuern, und damit
der Grund für Vorratshaltung.

Ein Fund beim Durchspielen: Ein Wald ließ sich pachten und warf **Holz** ab — das im
Warenkatalog nicht steht. `changeStock` legte es brav ab, `getStock` ließ es
stillschweigend fallen: dreißig Stämme, die niemand je zu sehen bekam. Holz, Stein und Erz
fehlen jetzt bewusst, bis sie eine Verwendung haben, und `harvestRecipe` weist ein Rezept
ab, dessen Ertrag nicht im Katalog steht. Dieselbe Regel wie bei Fertigkeiten und
Persönlichkeitsachsen — nur diesmal mit einem Wächter dahinter.

**Was noch fehlt:** NPCs nehmen an der Kette nicht teil. Sie arbeiten weiter für Lohn und
kaufen beim Kornspeicher. Ohne Markt könnte ein NPC-Bäcker nur sich selbst versorgen —
das löst sich mit 4.6d, und dann kann auch der Kornspeicher verschwinden.

_Fertig, wenn:_ Brot hat eine Herkunft. — Erledigt und am gebauten Server durchgespielt:
Mühlenfeld gepachtet, 96 Getreide geerntet, in der eigenen Mühle zu Mehl gemahlen, in der
eigenen Bäckerei zu 28 Broten gebacken, satt geworden.

**4.6d Handel.** ✓ **Jedes Handelshaus ist zugleich Verkaufsstelle.** Der Marktplatz ist
deshalb kein zweites System, sondern ein öffentliches Gebäude mit einer anderen Regel
darüber, wer dort ein Preisschild aushängen darf: im eigenen Laden nur der Eigentümer, am
Markt jeder. Eine Tabelle, zwei Regeln.

_Entschieden:_ Die Ware liegt im **Betriebslager**, nicht in der Kammer des Eigentümers.
Das macht aus einem Gebäude ein Ding mit eigener Bilanz — und vor allem den Ort, in den
ab der Anstellung fremde Hände produzieren. Ohne ihn wäre ein Betrieb nur ein
Schaufenster.

_Entschieden:_ Am Marktplatz kostet ein Stand **Standgeld** an die Stadt, im eigenen
Laden nichts. Damit hat Grundbesitz einen weiteren Wert, die Stadtkasse eine Einnahme,
und der Neuling ohne Haus trotzdem einen Weg.

Die Ware wandert beim Aushängen **ins Angebot** und nicht daneben: aus dem Betriebslager
im eigenen Laden, aus der eigenen Habe am Markt. Damit kann niemand dieselben zehn Laibe
an drei Ständen gleichzeitig anbieten, und ein Kauf braucht keine zweite Prüfung, ob es
sie noch gibt. Zurückgezogen geht sie dorthin zurück, wo sie herkam.

**NPCs kaufen jetzt beim billigsten Angebot** und erst dann beim Kornspeicher. Damit
findet ein Bäcker Kundschaft, und die Krücke aus 4.6a wird zum Notnagel.

Ein Fehler beim Durchspielen, und ein lehrreicher: Die NPCs kauften weiter beim Amt,
obwohl ein Angebot dahing. Ich hatte die **Menge am Kornspeicherpreis** gerechnet und
dann versucht, so viele beim Bäcker zu kaufen — bei sechs statt vier Münzen scheiterte das
am Geld, und sie fielen auf die Krücke zurück. Die Menge muss am Preis des Angebots
hängen, an dem gekauft wird.

_Fertig, wenn:_ Ein Spielerbetrieb kann die Stadt ernähren. — Erledigt und am gebauten
Server durchgespielt: zwanzig Brote zu sechs Münzen in der eigenen Bäckerei ausgehängt,
nach ein paar Herzschlägen ausverkauft, 120 Münzen eingenommen. Die Stadtkasse wuchs
dabei nur um einen einzigen Kornspeicherkauf.

**4.6e Anstellung.** ✓ Bis hierher war ein Betrieb ein **Werkzeug** — wer mahlte, mahlte
sein eigenes Getreide. Jetzt ist er ein **Arbeitgeber**: Der Angestellte setzt seine
Aktionspunkte ein, der Ertrag geht ins Betriebslager, der Lohn aus der Kasse des
Eigentümers an ihn.

Damit hat Geld zum ersten Mal einen **Ursprung mit Deckung**. Die städtische Schmiede
zahlt aus dem Nichts — ein privater Betrieb kann nur zahlen, was er hat. Die Prüfung
darauf steht **vor** dem Verbrauch der Aktionspunkte: Ein Angestellter, der umsonst
arbeitet, weil die Kasse leer war, hätte seinen Tag verloren, ohne es vorher wissen zu
können.

Der **Aushang** steht am Gebäude, der **vereinbarte Lohn** am Verhältnis. Senkt der
Eigentümer morgen den Aushang, gilt das für den Nächsten — nicht rückwirkend für den, der
schon da ist. Stellen gibt es je Ausbaustufe eine: Wer mehr Hände will, muss ausbauen,
dieselbe Leiter wie beim Wohnraum und derselbe Grund.

NPCs nehmen eine Stelle, wenn sie mehr bringt als die Tagelöhnerei in der städtischen
Schmiede — und sehen sich danach nicht mehr um. Ein NPC, der jede Stunde den Arbeitgeber
wechselt, wäre kein Handwerker, sondern ein Flattermann.

_Fertig, wenn:_ Ein Betrieb kann Leute beschäftigen. — Erledigt und am gebauten Server
durchgespielt: Aushang zu fünf Münzen, Gertrud stellte sich von selbst ein, verarbeitete
zwei Mehl aus dem Betriebslager zu zwei Broten und bekam ihren Lohn aus Gerlints Kasse
(1560 → 1555).

**Damit ist Phase 4.6 abgeschlossen.** Der Kreis steht: Ein Acker wird gepachtet,
Getreide geerntet, in der Mühle gemahlen, in der Bäckerei gebacken — von Angestellten,
die dafür Lohn bekommen —, im selben Haus verkauft und von jemandem gegessen, der das
Geld dafür anderswo verdient hat.

Von den drei Krücken kann jetzt die **städtische Schmiede** fallen, sobald genug private
Betriebe stehen; sie ist die einzige Stelle, an der Geld ohne Deckung entsteht. Der
**Kornspeicher** ist bereits zum Notnagel geworden. Die **nicht verfallenden öffentlichen
Gebäude** warten auf 4.7 — und sind dort mit 4.7c gefallen. (Nahrung, Kleidung,
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

**4.7a Ämter und Wahlen.** ✓ Die Stadt wählt sich einen Bürgermeister.

**Es gibt keine Ämtertabelle.** Wer das Amt innehat, wird gerechnet und nicht gespeichert:
Es ist der bestplatzierte Kandidat der letzten abgeschlossenen Wahl, der noch lebt. Das
ist die eine Entscheidung, an der hier alles hängt. Punkt 10 fragte, was beim Tod des
Amtsinhabers geschieht — mit dieser Bauart ist die Antwort keine Sonderbehandlung,
sondern dieselbe Rechnung: Der Zweitplatzierte rückt nach, weil er nach dem Toten der
Beste ist. Es gibt kein Ereignis, das beim Sterben mitlaufen müsste, und keine zweite
Ablage, die vom Wahlergebnis abweichen könnte.

**Es zählen Köpfe, nicht Münzen.** Jeder Erwachsene hat eine Stimme — nicht der
Grundbesitz, nicht das Haus. Wahlberechtigt ab der Volljährigkeit (Punkt 9): dieselbe
Grenze wie fürs Heiraten, Arbeiten und Erben, eine Zahl weniger, die man kennen muss, und
keine Wahl, die gewinnt, wer die meisten Kleinkinder hat. Damit ist die Hausmacht der
Hebel: viele Kinder, gut behandelte Angestellte, gepflegte Beziehungen. NPCs wählen den,
zu dem sie die größte Zuneigung haben — deshalb braucht es kein eigenes Wahlkampfsystem.

Der Ehrgeiz aus 4.4a bekommt hier endlich eine Handlung: NPCs über der Schwelle stellen
sich von selbst auf. Bleibt der Zettel trotzdem leer, wird beim Auszählen der
Ehrgeizigste aufgestellt, den es gibt — eine kleine Stadt stünde sonst ohne Bürgermeister
da, bis der Zufall einen Ehrgeizigen gebiert. Genau das passierte im ersten Anlauf: Unter
den acht Gründern lag niemand über der Schwelle von 40, und die Wahl lief dreimal ins
Leere. Die Schwelle liegt jetzt bei 30, der Notnagel dahinter.

Amtszeit fünf Spieljahre (zehn Realtage), Wahlkampf ein Spieljahr — lang genug, dass auch
wählen kann, wer nur alle paar Tage hereinschaut. Zwischenstände sind sichtbar: Ein
Wahlkampf, in dem niemand weiß, wo er steht, ist keiner.

_Fertig, wenn:_ Die Stadt hat ohne Zutun eines Spielers einen Bürgermeister. — Erledigt;
`selfSustaining.spec.ts` prüft es über fünf Spieljahre mit, und das Rathaus zeigt Amt,
Amtszeit, Wahlzettel und Stadtkasse. **Macht** hat das Amt noch keine — die kommt mit den
Gesetzen (4.7b) und den öffentlichen Bauten (4.7c).

**4.7b Gesetze und Steuern.** ✓ Das Amt bekommt Macht.

**Ein Gesetz erfindet keine Regel, es setzt eine Zahl.** Jede Gesetzesart zeigt auf eine
Stellschraube, die es ohnehin schon gibt: den Zehnt auf die Ernte, das Standgeld am
Markt, die Verkaufssteuer auf jeden Kauf, die Grundsteuer auf Besitz. Der Bürgermeister
verschiebt sie, mehr nicht. Ein Gesetz als freier Effekt wäre für jede Art ein Sonderfall
im Code, und nach fünf Gesetzen wüsste niemand mehr, was zusammen mit was gilt.

**Gespeichert wird der Vorgang, nicht der Zustand.** Jeder Erlass ist eine eigene Zeile
mit Tick und Urheber; es gilt der jüngste je Art — dieselbe Bauart wie beim Amt aus 4.7a.
Der Gewinn ist derselbe und obendrein die Chronik: Wer hat wann die Steuern erhöht, und
wie ist ihm die nächste Wahl bekommen? Ohne jeden Erlass gilt der Rückfallwert, und der
ist der bisherige Wert der Konstante. Deshalb ändert 4.7b für sich genommen nichts.

**Die Grenzen sind die Verfassung.** Sie stehen im Code und nicht zur Abstimmung: Ein
Zehnt von hundert Prozent wäre das Ende der Wirtschaft, und zwar unwiderruflich, weil
danach niemand mehr genug hätte, um zu handeln. Nach unten ist überall die Null erlaubt —
ein Bürgermeister darf die Stadt aushungern, das ist eine politische Entscheidung und
keine kaputte. Zwischen den Grenzen wird nichts geprüft: Der Erlass gilt sofort, ohne
Vorlauf und ohne Bestätigung. Missbrauch wird nicht verhindert, sondern bestraft — bei
der nächsten Wahl.

Die **Verkaufssteuer** kommt oben auf den Preis, statt vom Erlös abgezogen zu werden: Der
Verkäufer bekommt, was am Schild steht. Andersherum wäre jede Steuererhöhung eine
Enteignung dessen, der seinen Preis nie gesenkt hat.

Die **Grundsteuer** (Punkt 11) ist die einzige Abgabe, die an der Zeit hängt statt an
einer Handlung — und deshalb die einzige, die einen Durchlauf braucht: einmal im
Spieljahr über die Grundstücke einer Stadt. Sie trifft die Besitzenden und nicht die
Neulinge, und sie macht Horten teuer; das war der Grund für die Wahl. Wer nicht zahlen
kann, zahlt, was er hat — der Rest wird **erlassen** und nicht als Schuld vorgetragen.
Eine Steuerschuld ohne Vollstreckung wäre nur eine Zahl, die wächst und nie etwas tut;
die Zwangsversteigerung gehört zur Erschließung von Bauland (Punkt 13). Bei einem
Serverausfall fällt die Erhebung aus, statt nachgeholt zu werden — dieselbe Regel wie beim
Nachwachsen und beim Sterben.

_Fertig, wenn:_ Ein Bürgermeister kann etwas erlassen, das alle spüren. — Erledigt und am
gebauten Server durchgespielt: Verkaufssteuer auf zehn Prozent erlassen, ein Zehnt von 90
Prozent abgewiesen („So weit reicht die Macht des Amtes nicht"), dann fünf Brote zu sechs
Münzen gekauft — der Bäcker bekam 30, die Stadtkasse 3, der Käufer zahlte 33.

**4.7c Öffentliche Bauten und Stadtwache.** ✓ Das Amt bekommt Aufgaben und Ausgaben.

**Die letzte der drei Krücken fällt.** Öffentliche Gebäude verfallen seit diesem Schritt
wie private — dieselbe Regel, kein Sonderfall: Der Zustand senkt den Ertrag, die
Unterkunft nimmt weniger Leute auf, die Schmiede zahlt weniger. Bis hierher waren sie
ausgenommen, weil es niemanden gab, der sie hätte herrichten können; jetzt gibt es ihn.

**Einstürzen können sie trotzdem nicht.** Das ist der eine Unterschied, und er hat einen
Grund: Ein eingestürztes Rathaus nähme der Stadt die Wahl, eine eingestürzte Unterkunft
setzte alle Obdachlosen auf die Straße — und beides wäre unwiederbringlich, weil neu
bauen niemand kann. Verwahrlost und herrichtbar ist die Strafe für ein schlechtes Amt;
unwiederbringlich zerstört wäre das Ende der Stadt.

Dazu eine Migration, die den Verfall **ab jetzt** beginnen lässt: Ohne sie rechnete die
neue Regel die ganze bisherige Weltzeit nachträglich in Verfall um, und die Stadt wäre in
dem Moment halb verrottet, in dem jemand den Code einspielt. Eine Regel gilt ab ihrer
Einführung, nicht davor.

**Zwei Amtshandlungen mit Kosten.** Herrichten und Errichten: Die Aktionspunkte kommen
vom Bürgermeister, die Münzen aus der Stadtkasse. Damit ist die Kasse zum ersten Mal kein
Sparstrumpf. Gebaut werden darf auf städtischem **und auf herrenlosem** Grund — ohne das
könnte niemand je etwas errichten, weil die vier Plätze am Markt vom ersten Tag an bebaut
sind. Das ist eine Verteilungsentscheidung mit Widerstand: Jedes Grundstück, das die
Stadt nimmt, kann kein Spieler mehr kaufen. Fremder Grund bleibt tabu — eine Enteignung
braucht mehr als eine Amtshandlung.

**Ein NPC im Amt kümmert sich von selbst**, sobald ein Bau unter die halbe Güte fällt.
Ohne das verrottete jede Stadt, in der gerade kein Spieler regiert — und das ist der
Normalfall. Ein Spieler im Amt bekommt diese Hilfe nicht: Er soll es selbst tun, sonst
wäre die Amtshandlung nur eine Schaltfläche, die erledigt, was ohnehin geschieht.

**Die Stadtwache ist eine Anstellung, kein Amt** (Punkt 19). Der Bürgermeister setzt den
Sold aus, die Stadtkasse zahlt ihn — damit ist die Stärke der Wache eine Haushaltsfrage
und keine Verfassungsfrage, und sie braucht keinen eigenen Weg: Die Stadt ist einfach ein
Arbeitgeber wie jeder andere, nur steht ihr Geld in `treasury` statt in `money`. Es gilt
dieselbe Regel wie überall — **wer nicht zahlen kann, dessen Schicht findet nicht statt**.
Ein Schlupfloch fiel beim Durchspielen auf und ist geschlossen: Der Amtsinhaber kann
keine städtische Stelle antreten, sonst setzte er sich den Höchstsold aus und hobe ihn
selbst ab.

**Was die Wache noch nicht kann, ist wirken.** Sie schützt vor nichts, weil es noch
nichts gibt, wovor man schützen müsste — Raub und Räuber kommen mit 4.8. Das steht gegen
unseren eigenen Grundsatz, nichts ohne Wirkung zu bauen, und ist eine bewusste Ausnahme
auf einen Schritt: Ab 4.8 hat sie ihre Aufgabe.

_Fertig, wenn:_ Der Bürgermeister kann Geld ausgeben und die Stadt spürt es. — Erledigt
und am gebauten Server durchgespielt: Wachhaus für 300 Münzen auf herrenlosem Grund
errichtet, Sold auf 4 Münzen gesetzt, Dienst angetreten, eine Schicht geschoben — 4
Münzen aus der Stadtkasse an den Wächter.

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

**4.7d Die Chronik.** ✓ Ein Buch, in dem steht, was geschehen ist: Geburten, Hochzeiten,
Todesfälle, Wahlergebnisse, neue Gebäude, angetretene Stellen.

**Der Grund ist nicht Zierde, sondern Sichtbarkeit.** Die Welt läuft weiter, während
niemand zusieht — das ist ihr größter Vorzug und zugleich ihr Problem: Wer nach zwei Tagen
wiederkommt, findet eine veränderte Stadt vor und erfährt nirgends, was sie verändert hat.
Heute steht all das ausschließlich im Serverlog, wo es kein Spieler je sieht. Ein
Unglück, von dem niemand erfährt, hat keine Folgen; eine Hochzeit, von der niemand
erfährt, auch nicht.

**Ein Ereignis ist eine Zeile, kein Text.** Art, Tick, Ort und die Beteiligten als
Kennungen — der Satz entsteht erst beim Anzeigen, wie bei den Fehlergründen in
`actionFailure.ts`. Sonst fröre jede Meldung ihre damalige Formulierung ein, und beim
ersten Umbenennen stünde in der Chronik ein Name, den es nicht mehr gibt.

Geschrieben wird dort, wo das Ereignis entsteht — in den Diensten, nicht im Takt: Eine
Hochzeit kann ein Spieler auslösen, eine Geburt der Takt, eine Anstellung beides. Die
Chronik ist damit die erste Stelle, an der alle Wege zusammenlaufen.

**Die Stadtsicht steht ohne Anmeldung offen.** Sie ist das Schaufenster der Welt: Wer
hereinschaut, soll sehen, dass hier etwas geschieht — wer geboren wurde, wer gewählt
wurde, wo es gebrannt hat —, bevor er sich für ein Konto entscheidet. Eine Stadtchronik,
die man nur als Bürger lesen darf, wäre auch inhaltlich verkehrt herum. Die persönlichen
Sichten bleiben angemeldeten Spielern vorbehalten, weil es sonst nichts zu filtern gäbe.

Angezeigt wird sie **dreifach gefiltert**: die Stadt (was hier geschah), das Haus (was
uns betrifft) und die Person (ihr Lebenslauf). Dieselben Zeilen, drei Fragen. Der
Lebenslauf ist dabei der Nebengewinn, der den Stammbaum ergänzt: Wann wurde sie geboren,
wen hat sie geheiratet, welches Amt hatte sie, woran ist sie gestorben.

**Festgehalten wird vorerst alles, und alles ist öffentlich.** Solange die Welt eine
Testumgebung ist, wiegt Vollständigkeit schwerer als Ordnung: Was nicht mitgeschrieben
wurde, lässt sich nicht nachträglich beschaffen, und woran niemand denkt, fehlt später am
meisten. Verdichten und verbergen kann man immer noch — dann aber mit Daten in der Hand
statt mit einer Vermutung darüber, was interessant gewesen wäre.

_Fertig, wenn:_ Ein Spieler, der zwei Tage weg war, kann nachlesen, was inzwischen
geschehen ist. — Erledigt. Vierzehn Ereignisarten werden mitgeschrieben, von der Geburt
bis zum Schultag; die Seite zeigt sie in drei Sichten, und der Lebenslauf auf der
Charakterseite ist dieselbe Abfrage mit einem anderen Filter.

Ein Kniff verdient eine Notiz: **Ein Fehler beim Schreiben kippt die Handlung nicht.** Wer
heiratet, ist verheiratet, auch wenn die Chronik gerade klemmt — `record` schluckt und
protokolliert. Andersherum hinge das Spiel an seinem Protokoll.

**4.7e Schulen und eine wachsende Stadt.** ✓ Der Katalog öffentlicher Bauten wird länger,
und die Stadt darf von jeder Art **mehrere** haben.

**Die Begrenzung auf eins war eine Startannahme, keine Regel.** Ein Rathaus je Stadt ist
richtig; eine einzige Unterkunft ist es nicht. Wächst die Bevölkerung, braucht sie mehr
Dach, und ein Bürgermeister, der zusehen muss, wie Leute obdachlos bleiben, weil das
Limit bei eins steht, verwaltet eine Regel statt einer Stadt. Künftig gilt: **einmalig**
sind nur die Bauten, die die Stadt als Ganzes betreffen (Rathaus, Marktplatz, Mauer);
alles andere darf so oft stehen, wie die Kasse es hergibt und Bauland da ist.

Das verschiebt die Grenze vom Limit auf die Knappheit — und genau dorthin gehört sie: Was
die Stadt bebaut, kann kein Spieler mehr kaufen, und was sie unterhält, kostet dauerhaft.
Eine Stadt mit drei Unterkünften hat drei Bauten, die verfallen.

**Die Schule** ist der erste Bau, für den der Bürger selbst zahlt. Wer sein Kind
hinschickt, zahlt Schulgeld an die Stadt; das Kind lernt schneller oder beginnt sein
Erwachsenenleben nicht bei null. Damit bekommt die Kindheit zum ersten Mal einen Inhalt
— bisher ist sie eine Wartezeit bis zur Volljährigkeit — und der Spieler eine Ausgabe,
die sich erst in der nächsten Generation auszahlt. Das ist genau die Art Entscheidung,
um die es in einem Dynastiespiel geht: Man investiert in jemanden, den man später selbst
spielt.

**Die Schule ist ein Lehrmeister, den sich jeder leisten kann.** Sie erfindet keine neue
Mechanik: Ein Schultag ist eine Lehrstunde nach den Regeln aus 4.5a, und er kostet das
Kind **Aktionspunkte wie Arbeit**. Damit steht Lernen gegen Verdienen — der Konflikt, der
die Entscheidung erst zu einer macht. Wer sein Kind lernen lässt, verzichtet auf dessen
Hände.

Damit eine Schule unterrichten kann, braucht sie **Lehrer**: angestellt wie die Wache,
bezahlt aus der Stadtkasse. Was ein Kind lernen kann, hängt deshalb daran, wen die Stadt
gewinnt — eine Schule ohne Lehrer ist ein leeres Haus, und ein Lehrer kann nur
weitergeben, was er selbst beherrscht.

Das **Schulgeld ist ein Gesetz** (4.7b). Der Bürgermeister setzt es; steht es auf null,
zahlt die Stadt die Bildung ihrer Kinder ganz allein. Damit ist Bildung ein politischer
Streitpunkt und keine Konstante: Eine Stadt kann sich entscheiden, arme Kinder
auszubilden — und die Steuern dafür bei denen zu holen, die es sich leisten können.

_Fertig, wenn:_ Eine wachsende Stadt kann sich ein zweites Dach bauen, und ein Spieler
kann Geld für die Zukunft seines Kindes ausgeben. — Erledigt und am gebauten Server
durchgespielt: Schule für 350 Münzen errichtet, eine Schmiedin mit Stufe 6 als Lehrerin
angestellt, den zehnjährigen Tilman hingeschickt. Der Tag kostete ihn zwei Aktionspunkte,
seinen Vater drei Münzen Schulgeld an die Stadt — und die Lehrerin zwei Aktionspunkte,
aber keinen Verdienst: Sie bekommt ihren Sold aus der Stadtkasse.

**4.8 Unglücke.** ✓ Raub und Brand am Tick, gemildert durch die Wache aus 4.7c.

**Ein Unglück erfindet keinen Zustand, es nimmt von dem, was da ist.** Der Raub
verschiebt Münzen und Waren, der Brand senkt einen Gebäudezustand — beides Größen, die es
seit 4.5 und 4.6 gibt. Deshalb ist ein Unglück sofort spürbar und braucht keine eigene
Buchhaltung: Wer bestohlen wird, kann weniger kaufen; wessen Werkstatt brennt, produziert
weniger, bis jemand sie herrichtet.

**Es trifft, wo etwas zu holen ist.** Die Zielauswahl ist nach Beutewert gewichtet — wer
das Zehnfache besitzt, wird zehnmal so wahrscheinlich heimgesucht. Das ist stimmig und
zugleich der Schutz gegen die Todesspirale: Ein Räuber, der dem Verhungernden das letzte
Brot nimmt, macht aus einer Notlage eine Sackgasse. Wer nichts hat, lohnt den Weg nicht.

Geraubt wird aus **allen drei Töpfen zugleich** — Stadtkasse, Habe der Leute,
Betriebslager. Sie stehen in derselben Liste, gewichtet nach Wert; damit braucht es keine
Regel darüber, wie oft welche Art an der Reihe ist, und ein volles Lager ist von selbst
das lohnendere Ziel als eine leere Kammer. Ausgenommen bleibt der **persönliche Vorrat**:
Das Brot in der Kammer ist das, was zwischen einem Charakter und dem Verhungern steht
(4.6a) — es zu nehmen wäre kein Verlust, sondern ein Todesurteil mit Umweg.

**Die Wache bekommt endlich ihre Aufgabe.** Jeder angestellte Wächter drittelt die
verbleibende Gefahr, aber niemand kommt auf null: Eine Stadt, die sich vollständig
freikaufen kann, hätte das Problem gelöst statt es zu verwalten, und die Wache wäre eine
einmalige Ausgabe. So bleibt sie eine laufende — und der Bürgermeister muss die Steuern
dafür rechtfertigen. Im Rathaus steht die Zahl, damit ihr Sold einen sichtbaren Gegenwert
hat. Gegen Feuer hilft sie nicht; dafür bräuchte es einen Brunnen (Punkt 12).

Ein Brand legt **kein Haus in Schutt und Asche**: Er nimmt ein Drittel des Zustands. Den
Rest erledigt der Verfall, wenn niemand herrichtet — ein Feuer, das ein Lebenswerk in
einem Tick auslöscht, wäre keine Wendung, sondern eine Strafe.

Beides steht in der Chronik aus 4.7d. Ein Unglück, von dem niemand erfährt, hat
politisch keine Folgen.

_Fertig, wenn:_ Die Wache ist ihren Sold wert. — Erledigt und am gebauten Server
durchgespielt (mit hochgesetzter Wahrscheinlichkeit, sonst hätte der Test Tage gedauert):
„Raubzug: Gerlint um 385 erleichtert" stand im Log und als Satz in der Chronik.

Die **Seuche** fehlt mit Absicht: Ohne Krankheitssystem (Punkt 5) wäre sie nur ein
Zufallstod, und den gibt es schon. Sie kommt mit ihrem System.

**4.9a Bauland erschließen und versteigern.** ✓ Die Stadt wächst — und die Vergabe wird
politisch.

**Erschließen ist eine Amtshandlung, die Vergabe ein Wettbewerb.** Der Bürgermeister lässt
aus der Stadtkasse Grundstücke ausweisen; was dabei entsteht, geht nicht in den Verkauf,
sondern unter den Hammer. Damit hat die Stadtkasse zum ersten Mal eine Einnahme, die
größer sein kann als die Ausgabe — wie viel, entscheidet die Knappheit. Erschließen ist
deshalb kein sicheres Geschäft: Sind alle satt, bleibt die Stadt auf den Kosten sitzen.

**Der Zuschlag ist eine Rechnung, kein gespeicherter Zustand** — das höchste Gebot, dessen
Bieter noch zahlen kann. Wer bis dahin sein Geld ausgegeben hat, wird übergangen, und der
Nächste rückt nach. Dieselbe Bauart wie bei der Amtsnachfolge (4.7a), und derselbe Gewinn:
Es braucht keine Reservierung, die mitgeführt werden müsste, und keinen Zustand, der von
der Wirklichkeit abweichen kann. Wer bietet, ohne zu zahlen, verliert nichts außer dem
Zuschlag — die einzige Strafe, die ohne ein Schuldrecht auskommt.

Ein Mindestschritt von fünf Münzen hält die Sache in Gang: Ohne ihn endete jede
Versteigerung in einem Wettlauf um einzelne Münzen, und bei Spielern, die zu
verschiedenen Zeiten online sind, gewönne schlicht der, der zuletzt hereinschaut. NPCs
bieten mit, sonst bekäme die Stadt für ihr Land nie mehr als das Mindestgebot — aber nur
ein Viertel ihres Vermögens und nur, wenn sie noch kein Grundstück haben.

_Fertig, wenn:_ Die Stadt kann wachsen, und das Wachstum bringt ihr etwas ein. — Erledigt
und am gebauten Server durchgespielt: zwei Grundstücke für 120 Münzen ausgewiesen, 40
geboten, ein zu niedriges Nachgebot abgewiesen, der Takt schlug zu — „Brunnenweg 1" für 40
Münzen, beides in der Chronik.

**Beim Durchspielen fiel ein Loch auf:** Die versteigerten Grundstücke standen zugleich
als freies Bauland zum Festpreis da — wer wollte, kaufte für 40, statt zu bieten, und die
Versteigerung wäre eine Zierde gewesen. Jetzt sind sie aus der Liste **und** aus dem
Kaufweg genommen: Die Liste ist die Anzeige, aber wer die Kennung kennt, käme sonst über
das Formular doch heran.

**4.10 Die Baukette.** ✓ Drei neue Betriebe, zwei neue Fertigkeiten — und ein Haus, das
nicht mehr aus Münzen allein besteht.

**Die leeren Abbauflächen bekommen einen Sinn.** Eichwald und Steinbruch standen seit
4.6c ohne Rezept da, weil Holz und Stein nichts bewirkt hätten — und eine Ware ohne
Wirkung ist Dekoration. Jetzt haben sie eine: **Bauen und Renovieren verbrauchen
Material.** Das ist der Angelpunkt des ganzen Schritts; ohne ihn wären Bretter eine Zahl
im Lager.

Die Kette ist vollständig und kurz: Holz, Stein und Erz aus dem Umland (Fertigkeiten
**Holzarbeit** und **Bergbau**, beide neu), verarbeitet in **Zimmerei**, **Steinmetzhütte**
und **Schmiede** zu Brettern, Quadern und Eisen, verbaut in jedem Haus. Die Schmiede
bekommt damit endlich ein Rezept — bis hierher war sie ein Arbeitsplatz ohne Werk: Man
konnte dort Lohn verdienen, aber es entstand nichts.

**Der Materialbedarf bemisst sich am Preis**, statt je Vorlage aufgezählt zu werden: Ein
Großhaus für 400 Münzen braucht viermal so viel wie eine Kate für 100. Damit bringt jede
künftige Gebäudeart ihren Bedarf von selbst mit, und niemand muss zehn Tabellenzeilen
pflegen.

**Zwei Fallen, die beim Durchspielen sichtbar wurden:**

Die erste ist ein Henne-Ei-Problem: Für die Zimmerei bräuchte es Bretter, und Bretter gibt
es nur aus der Zimmerei. Die Auflösung ist eine einzige Ausnahme — **wer einen Betrieb
errichtet, der Baumaterial herstellt, braucht selbst keins.** Die erste Zimmerei zimmert
man sich aus dem, was im Wald liegt. Sie löst sich von selbst auf, sobald die erste steht.

Die zweite betrifft das Handwerk allgemein: `craft` nahm die Zutaten **nur aus der eigenen
Kammer**. Wer sein Holz in die Werkstatt einlagerte und dann sägen wollte, bekam „Davon
hast du nichts mehr" zu hören — obwohl es sichtbar dort lag. Jetzt zählt beides zusammen,
und verbraucht wird zuerst das Lager: Eingelagertes Material ist erklärtermaßen für den
Betrieb bestimmt.

Die **öffentliche Hand baut ohne Material.** Die Stadt hat kein Lager, sie vergibt
Aufträge und bezahlt sie; ein Stadtvorrat wäre ein eigenes System, und für die Wirkung der
Kette braucht es ihn nicht — der Bedarf der Spieler reicht als Nachfrage.

Dazu eine Migration für Bestandswelten: Die **Erzgrube** gab es im Seed noch nicht. Ohne
sie kein Erz, ohne Erz kein Eisen — und ohne Eisen könnte in einer laufenden Welt niemand
mehr bauen. (Dieselbe Regel wie beim Deploy zuvor: Wer den Seed erweitert, schreibt eine
Migration dazu.)

_Fertig, wenn:_ Ein Haus braucht mehr als Geld, und jemand verdient daran. — Erledigt und
am gebauten Server durchgespielt: Wald gepachtet, dreimal Holz geschlagen, Zimmerei
errichtet (ohne Material), Holz eingelagert, viermal gesägt — und aus den Brettern, zwei
Quadern und einem Eisen ein Wohnhaus gebaut.

**4.11 Schneider und Alchemist.** ✓ Zwei Berufe, die auf Menschen wirken statt auf Häuser.

**Beide wirken auf die Zuneigung** — sie steht seit 4.3, und damit ist der Prüfstein
erfüllt, an dem Waren sonst scheitern. Kleidung gegen Kälte müsste dagegen auf Krankheit
wirken, und die gibt es noch nicht (Punkt 5); deshalb wärmt das Gewand hier nicht, es
kleidet.

**Der Unterschied liegt darin, wie sie sich verbrauchen.** Ein Gewand wird _getragen_: Es
wirkt bei jedem Umgang und hält drei Spieljahre, dann ist es hin. Ein Duftwasser wird
_aufgebraucht_: einmal, beim Werben. Daraus ergeben sich zwei verschiedene Berufe — der
Schneider lebt von Dauerkundschaft, der Alchemist vom Anlass.

Damit ist **Punkt 20 für diese Ware beantwortet**, ohne auf ein großes Verschleißsystem zu
warten: Ohne Haltbarkeit kauft jeder genau ein Gewand, und das Handwerk hätte nach einer
Generation nichts mehr zu tun. Gespeichert wird dafür nur der Zeitpunkt des Anziehens —
ob das Stück noch heil ist, ist eine Rechnung, wie beim Gebäudezustand und beim Hunger.

Der **Stärkungstrank** wirkt auf Aktionspunkte, die Hauptressource. Er füllt nur auf, was
fehlt: Über die Obergrenze hinaus wirkt er nicht, sonst hortete man Punkte für einen Tag,
an dem alles auf einmal geschieht — und die Drosselung über das Aktionsbudget wäre
ausgehebelt. Acht Punkte sind ein Sechstel des Tagesbudgets: spürbar, wenn es klemmt, und
zu wenig, um damit ein zweites Leben zu führen.

**Ein Betrieb kann jetzt mehreres herstellen.** Die Alchemistenküche macht Duftwasser und
Trank aus denselben Kräutern; ein Feld für genau ein Rezept hätte dafür zwei Gebäude
verlangt, die sich nur im Erzeugnis unterscheiden — eine Trennung, die niemand erklären
könnte. Aus `recipe` wurde `recipes`, und der Angestellte stellt weiterhin das erste
Erzeugnis her: Wer wählt, ist der Eigentümer; wer arbeitet, tut das, wofür der Laden
bekannt ist.

**Beim Durchspielen fiel ein Fehler auf, der älter ist als dieser Schritt:** Die
Werbe-Aktion las `request.formData()` ein zweites Mal, nachdem eine Hilfsfunktion den Body
bereits verbraucht hatte — das Duftwasser wäre nie angekommen. Umschifft war das schon
einmal worden (die Lehr-Aktion trug einen Kommentar darüber); jetzt liest die Route die
Daten einmal und reicht sie weiter, und der Sonderweg konnte verschwinden.

_Fertig, wenn:_ Es gibt einen Beruf, der von Menschen lebt statt von Häusern. — Erledigt
und am gebauten Server durchgespielt: Schneiderei und Alchemistenküche errichtet (beide
brauchten erst Quader vom Steinmetz), Gewand genäht, Duftwasser und Trank aus derselben
Küche, angezogen, geworben — 30 Zuneigung statt 15, genau die Summe aus Werben, Duftwasser
und Gewand.

**4.12 NPCs als Kundschaft.** ✓ Die erste Stufe auf dem Weg zu einer Welt, die niemanden
braucht.

**Bis hierher kauften NPCs ausschließlich Nahrung.** Alles, was seit 4.10 und 4.11
dazugekommen war, hatte damit keinen Markt: Ein Schneider nähte für sich selbst, der
Alchemist hatte außer dem Spieler keinen Kunden, und die Baukette funktionierte nur, weil
der Spieler selbst baute. Die Angebotsseite war besetzt — NPCs stellen als Angestellte
alles her —, die Nachfrageseite nicht.

Der Grund war historisch: `decideNpcAction` entstand mit 4.6b, als es nur Brot zu kaufen
gab. Die Rangfolge nach Dringlichkeit war richtig und ist geblieben; sie hat jetzt vier
Stufen mehr am Ende — **erst überleben, dann ein Dach, dann eine Familie, dann ein gutes
Gewand**.

**Gekauft wird nur über der Rücklage.** Ein NPC, der sein letztes Geld für ein Gewand
ausgibt, verhungert darin. Die Rücklage gibt es seit 4.6b und sie hängt an der Gier: Der
Genügsame kauft früher, der Raffende später. Damit wirkt die Persönlichkeit auf den Konsum,
ohne dass eine einzige neue Achse nötig wäre. Dazu die Geselligkeit: Wer nie unter Leute
geht, kauft kein Gewand — dem Eigenbrötler ist gleich, wie er aussieht.

Der **Trank** folgt einer anderen Regel: Ihn nimmt nur mit, wer arbeitet, und getrunken
wird er erst, wenn kaum noch Kraft übrig ist. Beides folgt aus seiner Wirkung — er füllt
nur auf, was fehlt, und im Müßiggang wäre er ein teures Getränk. Beim Schreiben der Spec
fiel auf, dass die erste Fassung ihn auch dem Müßiggänger eingeflößt hätte.

_Fertig, wenn:_ Ein Handwerker findet Kundschaft, ohne dass ein Spieler kauft. — Erledigt;
`attire.spec.ts` prüft es gegen die Datenbank: Ein versorgter NPC kauft das Gewand und
zieht es an, ein knapper lässt es liegen.

**Was noch fehlt, bis die Welt wirklich niemanden braucht:** NPCs kaufen keine
Grundstücke (nur ersteigern), bauen keine Häuser, pachten keine Flächen, gründen keine
Betriebe, hängen keine Angebote aus und schicken ihre Kinder nicht zur Schule. Solange
alle Betriebe Spielern gehören, ist die Angebotsseite geliehen. Der nächste Schritt in
diese Richtung wäre der **NPC als Unternehmer** — und der ist größer als dieser hier.

**4.13 NPCs als Unternehmer — und die Bedürfnishierarchie als Struktur.** ✓ Die Welt
bringt ihre Wirtschaft selbst hervor.

**Die Rangfolge ist jetzt die Bauform der Entscheidung.** `decideNpcAction` war eine Liste
nummerierter Regeln; sie ist eine Kette aus fünf benannten Stufen geworden —
`ueberleben() ?? sicherheit() ?? zugehoerigkeit() ?? ansehen() ?? entfaltung()`. Das
leistet mehr als Ordnung: Es beantwortet die Frage, die jede neue NPC-Handlung sonst
einzeln aufwerfen würde — **wann tut er das?** Antwort: wenn alles Darunterliegende
gedeckt ist. Wer hungert, denkt nicht an ein Gewand; wer kein Dach hat, gründet keinen
Betrieb.

Innerhalb einer Stufe entscheidet weiterhin die Persönlichkeit, **ob** und **wie früh** —
nicht, was zuerst kommt. Ein Träger stirbt nicht am Hunger, weil er faul ist; er kümmert
sich nur später darum.

**Die fünfte Stufe macht aus Einwohnern Unternehmer** (Punkt 29): Grundstück kaufen,
Werkstatt bauen, Fläche pachten, ernten, herstellen, verkaufen. Bis hierher gehörte jeder
Betrieb der Welt einem Spieler — fiel der letzte weg, stellte niemand mehr etwas her.

Zwei Entscheidungen tragen die Stufe:

**Gebaut wird, was fehlt.** Der Katalog wird durchgegangen, die günstigste in der Stadt
noch nicht vorhandene Werkstatt gewinnt. Damit ergibt sich die Vielfalt der Berufe von
selbst, ohne dass jemand eine Quote pflegen müsste — und wer wenig hat, fängt klein an.
Ein NPC, der die vierte Bäckerei danebenstellt, ruiniert sich und den Markt.

**Innerhalb der Stufe geht es vom Vorhandenen zum Neuen:** erst verwerten (verkaufen,
herstellen, ernten), dann erweitern (pachten, bauen, kaufen). Sonst häufte einer
Grundstücke an, während in seiner Werkstatt die Ware verdirbt.

**Zwei Fehler wurden dabei sichtbar:**

`craft` legt das Erzeugnis in die **Kammer**, `placeOffer` nimmt es im eigenen Laden aber
aus dem **Betriebslager**. Ein NPC hätte endlos hergestellt, ohne je etwas anzubieten —
im Selbsterhaltungstest stand am Ende ein Betrieb ohne ein einziges Preisschild. Jetzt
wandert die Ware beim Aushängen zuerst ins Lager, über dieselbe Tür, die ein Spieler mit
„Einlagern" benutzt.

Und der neue Test teilte sich die Datenbank mit dem alten: Der zweite Block erbte eine
Welt, die schon fünf Jahre gelaufen war — mit alten, verheirateten, mittellosen
Einwohnern. Er schlug fehl, und zwar aus einem Grund, der nichts mit seiner Frage zu tun
hatte. Jetzt hat er eine eigene Datei und läuft in fünfzehn statt vierhundert Sekunden.

_Fertig, wenn:_ Eine Stadt ohne Spieler bringt einen Betrieb hervor und arbeitet darin. —
Erledigt; `selfSustainingEconomy.spec.ts` prüft genau das. Am laufenden Modell ist die
Kette gut zu sehen: Tick 0 ziehen alle acht unter ein Dach, Tick 1 bis 7 wird geworben
(bis die Aktionspunkte leer sind), Tick 8 kauft der Erste ein Grundstück, Tick 9 baut er
die Zimmerei, Tick 10 pachtet er den Wald, Tick 11 erntet er.

**Was bleibt:** NPCs stellen keine Leute ein, hängen keinen Lohn aus, bauen ihre Betriebe
nicht aus und schicken ihre Kinder nicht zur Schule (Punkt 24). Und sie bauen nur
Werkstätten — kein Wohnhaus für die eigene Familie, obwohl gerade das der Engpass der
Bevölkerung ist.

**4.14 Eigene Häuser, Instandhaltung und Leute.** ✓ Die Bevölkerung baut sich ihr Dach
selbst — der Engpass, an dem alles hing.

**Ohne Platz keine Kinder** (4.4), und die städtische Unterkunft fasst zwanzig. Bis
hierher baute kein NPC je ein Wohnhaus; die Bevölkerung hing an einer Krücke aus dem
Weltaufbau, und war die voll, wuchs niemand mehr nach — egal wie viele heirateten.

Der Hausbau steht in der **Sicherheitsstufe**, nicht bei der Entfaltung: Er ist kein
Unternehmen, sondern Vorsorge. Wer heiratet, baut — **auch wenn in der Unterkunft noch
ein Bett frei wäre**. Die freie Pritsche ist kein Grund, keine Kinder zu bekommen.

Dazu zwei weitere Handlungen: **renovieren**, was verfällt (dieselbe Schwelle wie beim
Bürgermeister — bei halber Güte), und **Lohn aushängen**, damit aus der Einmannsache ein
Betrieb wird.

**Drei Fehler, die erst der Selbsterhaltungstest zeigte:**

Die NPCs versuchten in **jedem** Tick zu bauen und scheiterten am Material — sieben von
acht standen Tick für Tick vor demselben leeren Bauplatz und kamen nie dazu, etwas anderes
zu tun. Die Entfaltungsstufe prüft jetzt auch das Material, bevor sie zum Bau rät.

Sie kauften Baumaterial **stückweise** und brauchten vier Ticks für vier Bretter. Jetzt
kaufen sie, was fehlt — begrenzt durch Angebot und Beutel.

Und das größte: Ein Wohnhaus verlangte Bretter, Quader **und Eisen**. Damit hing das
Wachstum der Bevölkerung an einer Erzgrube, einer Schmiede und dem Zufall, dass jemand
beides betreibt. Eine Kate ist aber Fachwerk, keine Festung: Sie braucht nur Holz. Erst
was Ertrag abwirft, verlangt Fundament und Beschläge.

**Und einer, der auch Spieler betraf:** Wer ein Wohnhaus baute, zog nur ein, wenn er
vorher obdachlos war. Wer in der Unterkunft wohnte — und das tun alle NPCs zu Beginn —,
ließ sein neues Haus leer stehen. Jetzt zieht der Bauherr ein, und sein Ehepartner mit:
Man baut kein Haus, um allein darin zu wohnen, und Kinder hängen am Wohnraum der Mutter.

_Fertig, wenn:_ Eine Stadt ohne Spieler bringt eigene Wohnhäuser hervor, in denen jemand
wohnt. — Erledigt. Am laufenden Modell: Tick 1 kaufen alle acht ein Grundstück, Tick 2
steht die erste Zimmerei, Tick 6 sägt sie Bretter, Tick 7 verkauft sie, Tick 9 kaufen drei
NPCs Material — **Tick 10 steht das erste eigene Wohnhaus**, Tick 13 das zweite.

**4.15 Der Bürgermeister führt sein Amt.** ✓ Ein NPC im Amt ist keine Kulisse mehr.

Seit 4.7c richtete er öffentliche Bauten her — mehr nicht. Kein Gesetz, kein Bauland,
keine Wache: Unter ihm wuchs die Stadt nur, soweit sie ohnehin wuchs. Ein Amt, das nichts
tut, ist kein Amt, und für einen Spieler wäre es kein Ziel gewesen, es ihm abzunehmen.

**Eine Stadt hat Bedürfnisse wie ein Mensch**, und sie lassen sich genauso ordnen wie die
eines Einwohners (4.13): erst was schützt, dann was trägt, dann was wächst.

1. **Die Wache bezahlen.** Ein Wachhaus ohne Sold ist ein leeres Haus, und Raubzüge kosten
   die Stadt mehr als der Sold. Kostet nichts außer dem Aushang — deshalb ganz vorn.
2. **Erhalten, was steht.** Billiger als neu bauen, und der Verfall frisst still.
3. **Bauen, was fehlt** — Wachhaus, Schule, Unterkunft. Nur Bauten mit Wirkung: Ein
   zweites Rathaus ändert nichts.
4. **Land ausweisen**, wenn keines mehr frei ist.
5. **An der Steuer drehen** — zuletzt, weil sie andere trifft. Wer sie anhebt, nimmt
   seinen Wählern etwas weg und wird daran gemessen.

**Die Rücklage der Stadt** ist die Bremse: Gebaut wird nur, was die Kasse über zwei
Erschließungen hinaus hergibt. Löhne und Instandhaltung laufen weiter, auch wenn gerade
nichts eingeht — eine Stadt, die alles verbaut, kann ihre Wache nächste Woche nicht
bezahlen. Gerechnet wird sie in Erschließungskosten, damit sie mit den Preisen mitwandert
statt eine Konstante zu sein, die beim ersten Balancing danebenliegt.

Die Steuer steigt, wenn die Kasse die Rücklage nicht hergibt, und **sinkt wieder**, wenn
die Stadt hortet: Wer hortet, nimmt seinen Bürgern Geld ab, das sie besser selbst ausgäben.
Die Grenzen aus 4.7b gelten dabei auch für einen NPC — die Verfassung steht im Code, nicht
zur Abstimmung.

**Höchstens eine Handlung je Tick.** Ein Bürgermeister, der in derselben Stunde die
Steuern erhöht, ein Wachhaus baut und Land erschließt, wäre kein Amtsinhaber, sondern ein
Automat. Und ein **Spieler** im Amt bekommt diese Hilfe nicht: Er soll selbst entscheiden.

Nebenbei ist `TAGELOHN` aus dem NPC-Dienst nach `economy.ts` gewandert. Die Zahl ist die
Messlatte für jedes Lohnangebot — auch der Bürgermeister zahlt sie seiner Wache —, und
eine Balancing-Größe gehört zu den anderen.

_Fertig, wenn:_ Eine Stadt unter NPC-Führung verändert sich sichtbar. — Erledigt;
`mayorService.spec.ts` prüft jede Stufe gegen die Datenbank.

**4.16 Wählen ist eine Handlung.** ✓ Nicht mehr ein Sammelvorgang beim Auszählen.

Bis hierher stimmten alle NPCs **gleichzeitig ab, kurz vor der Auszählung**. Der Grund
war gut gemeint: Wer am ersten Tag wählt, hatte weniger Zeit, sich eine Meinung zu bilden
— und weil NPCs nach Zuneigung wählen, soll der Wahlkampf wirken.

Zwei Folgen fielen erst im Betrieb auf, und beide sind ernst:

**Der Zwischenstand stand zwei Realtage lang auf null.** Wer ins Rathaus schaute, sah eine
Wahl, in der nichts geschah — nicht zu unterscheiden von einer kaputten.

**Wer während des Wahlkampfs starb, hatte nie gewählt.** Bei fünfzig Ticks und einer
Bevölkerung, in der ständig jemand stirbt, ist das kein Randfall: Gerade die Alten, deren
Zuneigung am meisten Geschichte hätte, fielen systematisch heraus.

Jetzt ist Wählen eine Handlung wie jede andere — ein Eintrag in der Bedürfnishierarchie,
Stufe **Zugehörigkeit**, denn Wählen ist Teilhabe. Damit verteilt sich die Stimmabgabe
über den Wahlkampf, der Zettel lebt, und wer stirbt, hat meist schon gewählt.

**Wann einer geht, sagt sein Wesen.** `votingDelay` mischt Fleiß und Ehrgeiz: Fleiß sagt,
wie früh einer erledigt, was ansteht (dieselbe Rolle wie beim Essen), Ehrgeiz, ob ihn
Ämter überhaupt kümmern. Wer beides hat, steht am ersten Tag da; wer träge und
gleichgültig ist, wartet bis kurz vor Schluss — und stirbt er vorher, hat er eben nicht
gewählt. Trägheit soll etwas kosten.

**Wählen kostet keine Aktionspunkte**, wie Essen. Wer erst dafür arbeiten müsste,
verzichtete ausgerechnet dann darauf, wenn es ihm schlecht geht; die Ärmsten gingen nie
zur Wahl, und das wäre eine Aussage über diese Welt, die wir nicht treffen wollen.

**Die Hierarchie zeigt sich dabei von selbst**, und das ist der schönste Teil: Beim
Umbauen der Tests wählte zunächst niemand — weil die Test-NPCs kein Geld hatten und
deshalb arbeiten gingen. Sicherheit kommt vor Teilhabe. Wer nichts zu essen hat, geht
nicht zur Wahl; sobald die Rücklage steht, schon. Das steht jetzt als eigener Test da.

_Fertig, wenn:_ Der Wahlzettel füllt sich im Laufe des Wahlkampfs. — Erledigt.

**4.17 Jeder Name führt zu der Person, die er meint.** ✓ Ein Vorspann zu Phase 5, und er
deckte einen Fehler auf, der seit 3.4 im Code stand.

**Die Charakterseite zeigte immer den eigenen Charakter.** `/character/<kennung>` las den
Parameter gar nicht, sondern nahm, was in `locals` stand. Die Verweise aus Chronik und
Rathaus gab es längst — sie führten alle auf einen selbst. Wer auf „Alheid" klickte, sah
sich.

Jetzt entscheidet der Parameter, und damit stellt sich eine Frage, die es vorher nicht
gab: **Was geht einen Fremden an?** Die Trennung folgt dem, was auf der Gasse sichtbar
wäre. Alter, Aufenthalt, Familie, Wohnhaus, Besitz, Können und die Chronik stehen jedem
offen — Geld, Aktionspunkte und Sättigung nur einem selbst. Und wer tot ist, wird als tot
ausgewiesen: Ein Verweis aus der Chronik führt oft zu jemandem, den es nicht mehr gibt.

**Die Chronik nennt jetzt jeden Genannten einzeln.** Vorher war der ganze Satz ein Link
auf das Subjekt — bei „Alheid und Bertram haben geheiratet" führten damit beide Namen zu
Alheid. Die Sätze entstehen deshalb mit Platzhaltern statt Namen: `chronicleMessage` setzt
sie ein, `chronicleParts` liefert sie in Stücken, und beide kommen aus derselben Vorlage.
Zwei Fassungen nebeneinander liefen auseinander, sobald jemand eine Formulierung ändert.

Verlinkt sind damit: die Leute in der Stadt, der Stammbaum samt Eltern, Ehepartner und
Kinder, Verkäufer auf dem Markt und im Laden, Angestellte, Lehrer, und jeder Name in jeder
Chronikzeile. **Gäste bekommen keine** — ihnen stehen die Charakterseiten nicht offen, und
ein Link, der auf die Anmeldung führt, ist ein Versprechen, das die Seite bricht.

Beim Durchklicken fiel nebenbei auf, dass die **Gebäudeseite ihren Kopf zweimal zeigte** —
Lage, Zustand und Ausbaustufe standen in zwei gleichen `dl`-Blöcken untereinander. Der
zweite ist gefallen.

_Fertig, wenn:_ Man kann sich von einem Namen aus durch die Stadt klicken. — Erledigt und
am laufenden Server durchgeklickt: von der Leuteliste zu Alheid (62, verheiratet mit
Bertram, Schmieden auf Stufe 6 — aber ohne Geld und Aktionspunkte), von dort über ihren
Lebenslauf zu Tilman, aus der Chronik ins Wohnhaus.

**4.9b Fernhandel und weitere Städte.** Waren zwischen Orten bewegen (`shipment` mit
Ankunfts-Tick statt Fortbewegung), Gründung einer zweiten Stadt. Fernziele für etablierte
Dynastien — und die Voraussetzung dafür, dass ein Räuber jemanden unterwegs überfallen
kann (Punkt 23). Die zweite Stadt ist der größere Brocken: Alles, was heute stillschweigend
„die Startstadt" annimmt, muss dann zwei Orte vertragen.

Dieser Schritt ist nicht liegengeblieben, sondern gewachsen: Er ist inzwischen **Phase 8**
und heißt dort anders, weil Karte, Reisen und Bürgerrecht dazugehören.

## Der Weg von hier

Das Konzept ist in mehreren Runden gewachsen und beschreibt inzwischen mehr, als in einem
Zug zu bauen wäre. Was folgt, ist die Reihenfolge — mit dem Maßstab, nach dem sie
zustande kam.

**Drei Regeln haben sie bestimmt.**

**Erstens: Löcher vor Neubau.** Mehrere Dinge, die es gibt, sind unvollständig — beim Tod
eines Hausherrn steht die Witwe im Nichts, ein Kind erbt eine Werkstatt, die niemand
führen kann, ein Gebäude lässt sich nicht verkaufen. Solche Stellen kosten wenig und
werden mit jedem neuen System teurer.

**Zweitens: Was viele tragen, kommt früh.** Der **Ruf** ist die Bremse, die ein halbes
Dutzend offener Punkte voraussetzt, ohne dass es ihn gibt — Räuber, Konvertit, Schuldner,
Zunftbewerber. Solche Querschnitte nachträglich einzuziehen hieße, jede Regel noch einmal
aufzumachen; dieselbe Überlegung, die schon 4.5a vor 4.6 gezogen hat.

**Drittens: Keine Härte ohne Ausweg.** Wo ein Schritt etwas verbietet, gehört der Weg
daran vorbei in denselben Schritt. Die Meisterpflicht ohne die Lehre im eigenen Betrieb
wäre eine Falle für jeden Erben; der Schuldturm ohne die Auslösung eine Sackgasse. Solche
Paare werden nicht getrennt.

**Und eine Regel gilt quer durch alles:** Ein Schritt ist erst fertig, wenn **NPCs ihn
auch tun**. Das ist der Maßstab aus dem Konzept — funktioniert es ohne Spieler? Eine
Zunft, in der nur Spieler Mitglied sind, ist keine; ein Geldverleiher, der nur montags
verleiht, weil dann jemand online ist, auch nicht. Punkt 30 wird deshalb nicht als eigener
Schritt abgearbeitet, sondern in jedem.

## Phase 5 — Bis Fremde spielen können

**Das Ziel ist `1.0.0`, und es ist näher, als der Berg an offenen Punkten vermuten lässt.**
Das Spiel ist spielbar: Man wird geboren, arbeitet, lernt, baut, heiratet, wählt, stirbt
und vererbt, und die Stadt läuft ohne Zuschauer weiter. Was fehlt, ist nicht Inhalt,
sondern die Gewissheit, dass ein Fremder nicht binnen einer Stunde in etwas läuft, das
kaputt oder unfair ist.

Diese Phase baut deshalb **nichts Neues an Systemen**. Sie schließt Löcher und macht das
Vorhandene betriebsfest. Alles Übrige kommt danach — an einem laufenden Spiel mit echten
Spielern, was allemal besser ist, als es vorher am Reißbrett auszudenken.

**5.1 Der Erbfall wird vollständig.** ✓ (Punkt 48) Beim Nachzeichnen fanden sich mehr
Löcher als die zwei geplanten, und eines davon war ein Fehler.

**Die Ehe endete bisher gar nicht.** `die()` räumte `spouseId` nicht auf — die Witwe blieb
mit einem Toten verheiratet. Das hatte zwei Folgen, und beide waren falsch: Sie konnte
nicht wieder heiraten, weil `canMarry` eine bestehende Ehe sieht, und sie konnte weiterhin
**empfangen**, weil die Empfängnis nur prüft, ob ein Partner eingetragen ist. Die
Wiederheirat, die das Konzept vorsieht, war damit unerreichbar.

**Beim Heiraten zog niemand zusammen.** `trauen()` setzte nur die beiden Verweise; Wohnen
blieb, wie es war. Zwei Verheiratete konnten in verschiedenen Häusern leben oder beide auf
der Straße — und weil die Empfängnis am freien Platz im Haus **der Mutter** hängt,
entschied allein ihr Dach über Kinder. Ein Mann mit einem Großhaus half seiner obdachlosen
Frau nicht. Damit war auch das geplante Wohnrecht der Witwe eine Regel ohne Gegenstand: Sie
wohnte ja nie bei ihm.

Jetzt zieht einer zum anderen — dorthin, wo Platz ist, bei gleichem Platz ins größere Haus,
weil dort später die Kinder unterkommen. Passt nirgends jemand dazu, bleibt alles beim
Alten; eine Ehe soll nicht am Wohnraum scheitern. **Der Besitz bleibt getrennt**, und damit
ist das Wohnrecht der Witwe genau das, was es sein soll: Sie bleibt wohnen, wo sie wohnte,
auch wenn das Haus nun dem Kind gehört. Dafür war nichts zu bauen — `HomeBuildingId` zeigt
weiter aufs Haus, und niemand kann jemanden hinauswerfen.

**Der Anteil am Bargeld geht vorweg**, vor der Teilung unter den Kindern. Sonst hinge das
Auskommen der Witwe daran, wie viele Geschwister sich den Rest teilen, und eine
kinderreiche Ehe ließe sie ärmer zurück als eine kinderlose. Ein Viertel: genug zum
Weiterleben, wenig genug, dass eine Ehe kurz vor dem Tod kein Weg wird, ein Haus
auszunehmen. Erlischt das Haus, behält sie ihren Anteil trotzdem — ein Haus endet, ein
Mensch nicht.

**Der minderjährige Erbe brauchte nichts.** Die Sorge war, ein Sechsjähriger könne nicht
handeln und der geerbte Betrieb stehe still. Tatsächlich ist es umgekehrt: Gesperrt sind
heute nur Heirat, Wahl und eine feste Anstellung — arbeiten, herstellen, bauen, kaufen und
einstellen kann ein Kind längst. Die Grenze „anweisen ja, Hand anlegen nein" ist damit
keine Erlaubnis, die zu geben, sondern eine Sperre, die zu ziehen wäre. Sie gehört zu
**6.2**, wo die Lehre im eigenen Betrieb Kinder ausdrücklich in die Werkstatt schickt —
zweimal an derselben Altersgrenze zu drehen wäre einmal zu viel.

_Fertig, wenn:_ Ein Erbfall mit überlebendem Partner und kleinen Kindern hinterlässt
niemanden ohne Dach und keinen Betrieb, der stillschweigend verfällt. — Erledigt.

**5.2 Namen.** ✓ (Punkte 42, 36) Kinder benennen, solange sie klein sind; Gebäude
benennen, solange sie einem gehören. Wenig Arbeit und viel Bindung — ein Haus, dessen
Kinder man selbst benannt hat, ist ein anderes als eine Liste erzeugter Vornamen.

Die Regeln stehen in `naming.logic.ts`, weil sie für beide Fälle dieselben sind: Länge,
Leerraum zusammenziehen, und keine zwei **lebenden** Geschwister mit demselben Namen —
verglichen ohne Rücksicht auf Groß- und Kleinschreibung, denn zwei Kinder, die man in einer
Liste nicht auseinanderhält, sind eine Falle. Tote zählen nicht mit: Ein Kind nach der
verstorbenen Großmutter zu benennen ist genau das, was Häuser tun.

**Zwei Grenzen, die aus dem Konzept folgen.** Mit der Volljährigkeit steht der Name fest —
ein Erwachsener, den man umbenennen kann, ist für alle anderen niemand, auf den man sich
beziehen könnte, und die Chronik hielte Ereignisse fest, deren Handelnder später anders
heißt. Und über **städtische** Bauten verfügt niemand, auch der Bürgermeister nicht: Der
Name des Rathauses ist der der Stadt.

Doppelte Gebäudenamen sind dagegen erlaubt. Zwei Bäckereien dürfen beide „Zum goldenen
Weck" heißen; wer das tut, verwirrt vor allem sich selbst. Eine Sperre müsste stadtweit
prüfen und brächte nichts, was die Kennung nicht schon leistet.

_Fertig, wenn:_ In der Chronik stehen Namen, die jemand gewählt hat. — Erledigt.

**5.3 Der Lebenslauf wird vollständig.** ✓ (Punkt 52) Die Chronik konnte längst, was
gebraucht wird — `getChronicle({ characterId })` liefert die Ereignisse, an denen jemand
beteiligt war, und die Charakterseite zeigt sie. Es fehlte nicht die Sicht, sondern der
Stoff.

Zwei Arten kommen dazu. **`MOVED_IN`**: Wo jemand wohnt, war nirgends festgehalten — das
Zusammenziehen nach der Hochzeit, der NPC, der endlich ein Dach findet, und der Ehepartner,
der in ein neu gebautes Haus mitzieht, setzten alle nur die Kennung. Dabei ist der
Wohnort eine der wenigen Angaben, die ein ganzes Leben umspannen. **`PLOT_BOUGHT`**: Beim
Zuschlag einer Versteigerung stand der Erwerb längst, beim Kauf zum Festpreis nicht —
dabei ist ein Grundstück der Anfang von allem, was ein Haus je baut.

**Wo der Bauherr selbst einzieht, wird nichts nachgetragen.** `BUILDING_BUILT` sagt schon
alles: Wer ein Haus baut, wohnt darin. Für den Ehepartner gilt das nicht, und für ihn ist
es der Umzug seines Lebens — also steht er dort. Das ist die Auswahlregel in einem Fall:
Aufgenommen wird, was jemand nach sechzig Jahren noch erzählen würde, und nichts, was ein
anderer Eintrag ohnehin erzählt.

`recordMoveIn` liegt beim Chronikdienst und nicht bei der Familie, obwohl es dort entstand:
`buildingService` ruft es ebenfalls, und die Familie hängt ihrerseits schon an den
Gebäuden. Ein Ringschluss zwischen zwei Diensten wäre ein hoher Preis für eine Zeile.

_Fertig, wenn:_ Der Lebenslauf eines Verstorbenen liest sich wie ein Leben und nicht wie
ein Auszug aus dem Kassenbuch. — Erledigt.

**5.4 Gebäude verkaufen.** ✓ **Entfällt — war längst gebaut.**

Dieser Schritt stand im Plan, weil die Bestandsaufnahme ihn als Lücke ausgewiesen hatte.
Das war ein Irrtum meinerseits: Gesucht worden war nach `salePrice`, und das Feld heißt
`forSalePrice`. Tatsächlich stehen `setBuildingPrice` und `buyBuilding` samt Action und
Oberfläche seit 4.5, mitsamt der Regel, dass das Grundstück mitwandert — ein Haus auf
fremdem Boden wäre eine Pacht, und dafür gibt es keine.

Die Lehre daraus ist kein Verlust, sondern eine Warnung an die übrige Liste: Ein Punkt, der
aus einer Suche nach einem geratenen Bezeichner entstanden ist, ist keine Bestandsaufnahme.
Bei den anderen „entschieden, aber ungebaut"-Einträgen gehört deshalb nachgesehen, bevor
jemand anfängt.

Nebenbei beantwortet sich damit eine Frage aus 5.1: Das Wohnrecht überdauert einen
Hausverkauf, denn `buyBuilding` überträgt den Eigentumstitel und rührt die Bewohner nicht
an.

**5.5 Der abwesende Spieler.** ✓ (Punkt 40) Wer lange nicht hereinschaut, dessen Charakter
isst, arbeitet und hält sein Haus instand. Erhalten ja, entscheiden nein.

**Woran Abwesenheit hängt, war die eigentliche Frage.** Keines der vorhandenen Felder
taugte: `lastTickProcessed` wird bei jedem Zugriff fortgeschrieben — auch von der
Selbstverwaltung selbst, die sich damit durch ihr eigenes Handeln für anwesend erklärt
hätte. Also `lastSeenTick`, gesetzt allein in `getCharacterForUser`. Das ist der Weg über
die Sitzung, den nur ein Mensch nimmt; die Verwaltung kommt dort nie vorbei. Geschrieben
wird höchstens einmal je Tick — fünf Seitenaufrufe in derselben Stunde sind derselbe Blick.

**Die Schwelle ist der Deckel der Aktionspunkte**, achtundvierzig Ticks, und die Begründung
ist dieselbe: Ab da steht das Budget an und jede weitere Stunde verfällt ungenutzt.
Abwesenheit heißt hier nicht „offline", sondern „Zeit liegt brach". Wer nie gesehen wurde,
gilt als abwesend — das trifft NPCs und Spieler nach einem Serverstart, und beides ist
richtig.

**Gehandelt wird durch dieselbe Schleife wie bei den NPCs**, nur mit engeren Befugnissen:
essen, einkaufen, arbeiten, unter ein Dach ziehen, Material kaufen, renovieren. Ein
zweiter Durchlauf mit eigener Taktung wäre dieselbe Arbeit an zwei Stellen gewesen.

Das Dach gehört ausdrücklich dazu, obwohl es eine Festlegung ist: Ein Obdachloser erholt
sich nicht und bekommt keine Kinder — ihn draußen stehen zu lassen wäre keine
Zurückhaltung, sondern Vernachlässigung. Werben, heiraten, bauen, Grundstücke kaufen,
eine Stelle antreten und wählen bleiben dagegen dem Spieler. Schlägt die Hierarchie
etwas davon vor, wird stattdessen gearbeitet — wer abwesend ist, soll wenigstens nicht
ärmer werden.

_Fertig, wenn:_ Zwei Wochen Abwesenheit kosten Fortschritt, aber nicht das Haus. —
Erledigt.

**5.6 Womit ein Neuling anfängt.** ✓ (Punkt 14) Die empfindlichste Entscheidung vor dem
öffentlichen Betrieb — und beim Nachsehen stellte sich heraus, dass es weniger um
Starthilfe ging als um eine fehlende Tür.

**Ein Spieler konnte nirgends einziehen.** NPCs zogen seit 4.14 in die städtische
Unterkunft; für einen Spielercharakter gab es keinen Weg dorthin. Wer nicht selbst baute
oder heiratete, blieb obdachlos — und das heißt keine Erholung und keine Kinder. Ein
Neuling stand damit vor der Wahl, hundertvierzig Münzen für Grundstück und Kate
zusammenzuarbeiten oder gar nicht erst anzufangen, und wessen Haus zur Ruine verfiel, dem
half die Unterkunft nicht, für die er als Bürger mitbezahlt hat.

Jetzt gibt es `moveInto` mit denselben Schranken wie bei den NPCs: Wohnraum muss es sein,
ein Platz frei, und es muss der Allgemeinheit oder einem selbst gehören. Dazu ein Knopf auf
der Gebäudeseite und die Zahl daneben — „noch zwei Plätze frei" ist die Auskunft, die über
Bleiben oder Weitersuchen entscheidet.

**Und ein frischer Charakter zieht von selbst ein**, wenn die Stadt Platz hat. Das ist
keine Starthilfe, die etwas schenkt, sondern die Umsetzung dessen, wofür das Haus gebaut
wurde. Ist es voll, beginnt man im Freien und muss sich sputen — dann ist es an der Stadt,
eine zweite Unterkunft zu bauen.

**Sonst bleibt alles, wie es war:** zehn Münzen, achtundvierzig Aktionspunkte, die
städtische Schmiede. Mehr Kapital wäre ein Geschenk, und der Grundweg ist begehbar —
eine Schicht bringt drei Münzen, ein Brot kostet vier, und wer arbeitet, kommt voran.

`freierWohnraum` ist dabei vom Familien- zum Gebäudedienst gewandert. Sie stand dort, weil
die Empfängnis sie zuerst brauchte; sie ist aber eine Frage an das Gebäude, und seit der
Einzug hier liegt, wäre der alte Ort ein Ringschluss.

_Fertig, wenn:_ Ein frisch angelegter Charakter hat einen begehbaren Weg nach oben, ohne
dass ihm jemand hilft. — Erledigt.

**5.6a Und die NPCs?** ✓ Die Anschlussfrage deckte einen zweiten Fehler auf, denselben in
Grün.

NPCs zogen längst von selbst unter ein Dach — aber ihre Wohnungssuche kannte **nur
städtische Häuser**. Das eigene stand nicht auf der Liste, und der Anlass dafür liegt
näher, als man denkt: Wer ein Wohnhaus **erbt**, bekommt den Eigentumstitel, aber keinen
Wohnsitz — `besitzUebertragen` rührt die Bewohner nicht an. Ein obdachloser Erbe zog
daraufhin in die städtische Unterkunft, während sein eigenes Haus leer stand und den Platz
belegte, den ein Besitzloser gebraucht hätte.

Jetzt sucht er zuerst im Eigenen und erst dann bei der Stadt. Und der Einzug selbst läuft
über denselben `moveInto` wie beim Spieler: Zwei Fassungen desselben Vorgangs waren eine zu
viel — die eine kannte das eigene Haus nicht, die andere schon.

_Fertig, wenn:_ Wem ein Haus gehört, der wohnt auch darin. — Erledigt.

**5.7 Ein Rundlauf, der klickt.** ✓ (Punkt 25) Acht Schritte als **eine Geschichte**:
registrieren, Charakter anlegen, die Stadt sehen, einem Namen folgen, eine Schicht
arbeiten, vierzig Schichten später ein Grundstück kaufen, die Chronik lesen, abmelden.
Seriell, weil sie aufeinander aufbauen — wer keinen Charakter hat, kauft kein Grundstück,
und die Folgefehler verdeckten nur den einen, auf den es ankommt.

Er läuft gegen das **gebaute** Artefakt (`npm run build && node build`), nicht gegen den
Entwicklungsserver: Der Unterschied zwischen beiden hat dieses Projekt schon Deploy-Fehler
gekostet (2.4). `PLAYWRIGHT=true` schaltet dabei auf SQLite im Arbeitsspeicher — jeder Lauf
beginnt in einer frischen Welt und lässt `.data/` in Ruhe.

**Der Weltaufbau brauchte dafür eine Ausnahme.** Im Testmodus lief er bisher nicht, weil
jede Vitest-Spec ihre Welt selbst aufbaut. Ein Browser kann das nicht: Er braucht eine
Stadt, in der sich spielen lässt.

**Und schon beim Schreiben fand er vier Dinge**, die ich falsch angenommen hatte — genau
das, wofür er da ist:

- Das Feld heißt „Name der Dynastie", nicht „Name des Hauses", und die Registrierung will
  das Passwort zweimal.
- Nach dem Registrieren landet man auf der Übersicht, nicht beim Charakterformular.
- Tagelöhnerei gibt es nicht auf der Arbeitsseite, sondern in der städtischen Schmiede.
- Auf der Gebäudeseite stehen **zwei Knöpfe namens „Arbeiten"**: „Arbeiten (1 AP)" fürs
  Herstellen aus eigenem Vorrat und „Arbeiten" für die Schicht. Wer Erz hat, trifft
  vielleicht den richtigen; wer keines hat, klickt und bekommt „Davon hast du nichts mehr".
  Das ist ein Fund für sich und gehört bei nächster Gelegenheit auseinandergezogen.

Dazu zwei Eigenheiten von Playwright, die man kennen muss: Ein absoluter Pfad in `goto`
**ersetzt** den Pfad der `baseURL`, statt ihn zu ergänzen — der Unterpfad steht deshalb im
Test. Und jeder Test bekommt sonst einen frischen Browser-Kontext, womit der Anmeldecookie
verlorenginge; die Geschichte teilt sich deshalb eine Seite.

_Fertig, wenn:_ Ein kaputter Weg durch die Anwendung bricht den Build. — Erledigt, als
eigener Job neben Unit-Tests und Rauchtest.

**5.8 Eine Sicherung, die geprüft ist.** (Punkt 26) Zwei Skripte, die mit dem Deploy auf
den Host wandern — `scripts/backup.sh` und `scripts/restore-check.sh`.

**Warum der Deploy-Dump nicht reicht:** Er läuft seit 2.4 vor jeder Auslieferung, und
genau darin liegt seine Lücke. Wer zwei Wochen nichts ausliefert, hat zwei Wochen keine
Sicherung — und ausgerechnet die ruhigen Zeiten sind die, in denen die Welt am meisten
Spielzeit ansammelt.

**`backup.sh`** zieht täglich per Cron einen Dump und behält die letzten vierzehn.
Zwei Dinge macht er anders als der Deploy-Dump, und beide sind Lehren aus dem Hinsehen:

- **Erst schreiben, dann benennen.** Bricht `mysqldump` mittendrin ab, bleibt sonst eine
  halbe Datei liegen, die aussieht wie eine Sicherung. Genau darauf verlässt man sich im
  Ernstfall. Die Umbenennung ist der Moment, in dem sie eine wird.
- **Die Größe wird geprüft.** `mysqldump` gibt bei Teilfehlern gelegentlich 0 zurück; eine
  Datei unter einem Kilobyte ist keine Welt.

**`restore-check.sh`** ist die Probe aufs Exempel — und der eigentliche Punkt 26. Er spielt
die jüngste Sicherung in eine **Prüfdatenbank** und sieht nach, ob darin eine Welt steht:
Tabellenzahl, Weltzeit, lebende Einwohner. Ohne diese Prüfungen wäre er wertlos, denn ein
leeres Schema spielt sich anstandslos ein.

Die Produktionsdatenbank bleibt dabei unberührt. Das ist der Unterschied zwischen einer
Übung und einem Ernstfall, und die Übung soll man ohne Bauchschmerzen machen können —
sonst macht man sie nie. Der Ernstfall selbst steht als **Anleitung** am Ende des Skripts
und nicht als ausführbarer Zweig: Eine Wiederherstellung überschreibt Generationen von
Spielzeit und gehört nicht in einen Aufruf, den man versehentlich absetzt.

**Was auf dem Host zu tun ist** (einmalig, per SSH):

```sh
# 1. Der Deploy bringt die Skripte mit — nachsehen, dass sie da sind:
ls -l ~/houses-app/scripts/

# 2. Eine Sicherung von Hand ziehen und prüfen:
bash ~/houses-app/scripts/backup.sh
bash ~/houses-app/scripts/restore-check.sh

# 3. Erst wenn das durchläuft: den Cron einrichten.
crontab -e
#   17 4 * * * bash $HOME/houses-app/scripts/backup.sh >> $HOME/logs/backup.log 2>&1
```

Die krumme Minute mit Absicht: Zur vollen Stunde laufen auf einem geteilten Host die
Aufgaben aller Nutzer gleichzeitig.

**Aufgerufen wird über `bash`**, und dafür gibt es einen Grund, der beim ersten Versuch
sofort zuschlug: rsync setzt mit `--chmod=D755,F644` **jede** Datei auf 644 — das
Ausführbar-Bit aus dem Repository überlebt den Upload nicht, und der direkte Aufruf
scheitert mit „Permission denied" bei einer Datei, die sichtbar da ist. Der Deploy hängt
inzwischen ein `chmod +x scripts/*.sh` an, womit auch der direkte Aufruf geht; `bash` davor
schadet trotzdem nie und ist dieselbe Konvention, mit der die CI den Rauchtest ruft.

`.gitattributes` nagelt `*.sh` dabei auf LF fest. Mit CRLF wird aus der Shebang-Zeile ein
Interpreter namens „bash\r", und die Meldung dazu nennt eine Datei, die sichtbar
existiert — ein Fehler, der jeden einmal eine Stunde kostet.

_Fertig, wenn:_ Eine Sicherung wurde eingespielt und die Welt stand vollständig darin. —
Erledigt: Beide Skripte sind auf dem Host gelaufen, die Rückspielprobe hat bestätigt, und
der Cron zieht die Sicherung täglich um 4:17 Uhr.

**5.9 Was ein Betreiber schuldet.** ✓ (Punkte 27, 28) Vier Seiten und eine Funktion.

**Die Kontolöschung ist der Teil, der Code braucht.** Sie löscht nicht, sie anonymisiert:
Nickname, E-Mail und Passwort fallen weg, alle Sitzungen enden, die Figuren heißen
„Namenlos" und das Haus „Ein vergessenes Haus". Die Chronik behält ihre Einträge, zeigt
aber keinen Namen mehr — sie speichert Kennungen, und der Satz entsteht beim Lesen. Genau
darauf hatte das Konzept gesetzt, und es trägt.

**Aus dem gespielten Charakter wird ein NPC.** Das ist die Entscheidung, die im Konzept
noch offen war (Punkt 40: „ob eine Dynastie ohne Spieler zum NPC-Haus wird"). Die Figur
bleibt in der Welt, wohnt, arbeitet und stirbt irgendwann wie jede andere. Sie sterben zu
lassen wäre die einfachere Antwort gewesen und die schlechtere: Ihre Nachbarn hätten von
einem Tag auf den anderen einen Toten und ein herrenloses Haus, weil anderswo jemand ein
Formular abgeschickt hat.

Bestätigt wird durch **Abtippen des eigenen Nicknames**. Ein Knopf allein ist zu wenig für
etwas, das sich nicht zurücknehmen lässt, und eine Sicherheitsabfrage, die man wegklickt,
ist keine.

**Die Datenschutzerklärung konnte präzise werden**, weil die Bestandsaufnahme kurz ausfiel:
Nickname, optionale E-Mail, bcrypt-Hash, Sitzungstoken mit Ablauf — mehr steht nicht in der
Datenbank. IP-Adressen hält allein der Rate-Limiter, im Arbeitsspeicher, fünfzehn Minuten
lang. Kein Anmeldeprotokoll, keine Analysewerkzeuge, keine Dritten. Das Konzept sprach von
einem „Anmeldeprotokoll", das es zu löschen gälte — es gibt keines.

Damit ist der Text nichts Abgeschriebenes, sondern eine Beschreibung des Codes. Wer ihn
ändert, ohne den Code zu ändern, macht ihn zur Behauptung.

**Die Angaben stammen aus dem Nachbarprojekt** (`festival`) — derselbe Verantwortliche,
derselbe Hoster, dasselbe Vorgehen. Übertragen und nicht abgeschrieben: Dort gibt es
Profilbilder, Kommentare und Freundschaften, hier eine Chronik, die auch Gästen offensteht,
und eine Löschung, die anonymisiert statt zu löschen. Beides steht ausdrücklich drin.

Zwei Dinge kamen von dort, die hier gefehlt hätten: die **Server-Protokolle beim Hoster**
(beim Aufruf fallen IP-Adressen an, die der Hoster verantwortet) und der Kniff, die
**E-Mail-Adresse erst im Browser zusammenzusetzen** — mit `onMount` statt `$derived`, weil
Letzteres beim SSR mitliefe und die fertige Adresse doch wieder ins HTML schriebe.

Die **Spielregeln** enthalten, was das Konzept voraussetzt: **ein Konto je Person.** Ein
Verbot von Mehrfachkonten setzt voraus, dass es irgendwo geschrieben steht.

Ob die Texte vollständig sind, gehört trotzdem von jemandem geprüft, der das beurteilen
darf — das ist keine Zurückhaltung, sondern die Grenze meiner Zuständigkeit.

Alle drei Rechtstexte stehen **ohne Anmeldung** offen. Wer wissen will, was mit seinen
Daten geschieht, soll das entscheiden können, bevor er welche hergibt.

_Fertig, wenn:_ Jemand kann verlangen, dass seine Daten verschwinden, ohne dass die Welt
Lücken bekommt. — Erledigt; die Anbieterangaben fehlen noch.

**5.10 Jeder hat einen Nachnamen.** ✓ Bisher trugen nur Spielerfiguren einen — die
Einwohner der Stadt hießen Alheid, Bertram, Cunne, als wäre die Stadt ein Dorf mit acht
Leuten.

**Der Hausname _ist_ der Nachname.** Das war die eine Entscheidung, aus der alles Übrige
folgte. Ein zweites Feld `lastName` neben der Dynastie wäre schneller gebaut gewesen und
hätte dieselbe Auskunft an zwei Stellen gespeichert — die erste Frage wäre gewesen, welche
gilt, wenn sie sich widersprechen. Stattdessen bekommt jeder Fremd-NPC ein eigenes Haus,
und der Name kommt von dort.

**Jeder für sich, keine geteilten Häuser.** Zwei Fremde mit demselben Nachnamen wären eine
Verwandtschaft, die es nicht gibt — und Verwandtschaft heißt in diesem Spiel Erbfolge.

**Die Häuser sind vollwertig.** Dieselben Regeln für alle: Die Zuneigungsschicht „Haus zu
Haus" greift auch unter NPCs, ein Spieler kann sich mit einer NPC-Familie verfeinden, und
**ein NPC-Haus kann aussterben**. Letzteres verlangte einen Eingriff in `hausFortfuehren`,
das bis dahin auf „war gespielt" prüfte: Wer ohne Erben stirbt, dessen Linie endet, egal
wer ihn geführt hat. Gezählt werden dabei die **lebenden** Angehörigen — ein Haus endet
erst mit dem letzten, nicht mit dem ersten Toten.

**Ein Fund, der ohne diesen Schritt nie aufgefallen wäre:** `assignDynasty` würfelt das
Haus jedes Kindes aus, sobald _beide_ Eltern eines haben. Solange NPCs keines hatten,
fielen alle Kinder ans Spielerhaus — mit 5.10 wäre das stillschweigend gekippt, und eine
Ehe mit einem NPC hätte im Schnitt die Hälfte des Nachwuchses an eine Familie verloren,
die der Spieler nicht führt. Die Regel heißt jetzt: **Ist nur ein Elternteil gespielt,
fällt das Kind an dessen Haus.** Der Münzwurf bleibt, wo er hingehört — zwischen zwei
Spielern und zwischen zwei NPCs. Die Häuser sind gleichwertig; die Aufmerksamkeit dahinter
ist es nicht.

**`nameService` statt einer Schleife an neun Stellen.** Die Aufgabe war überall dieselbe:
aus Kennungen Namen machen, in zwei Abfragen statt in zweimal so vielen wie Personen. Das
Modul kennt nur Charaktere und Häuser und darf deshalb von jedem Dienst benutzt werden,
ohne einen Zyklus zu erzeugen.

**Wo der volle Name steht und wo nicht** ist eine Regel und keine Geschmacksfrage: voll,
wo Menschen verschiedener Häuser nebeneinanderstehen — Chronik, Leuteliste, Rathaus,
Markt, Belegschaft, Lehrer, Gesetzestafel, Versteigerung. Vorname allein, wo der
Zusammenhang das Haus schon geklärt hat: eigene Kinder, eigener Stammbaum. Sie steht bei
`fullName` in `naming.logic.ts`, damit die nächste Anzeigestelle sie nicht neu erfinden
muss.

Nebenbei fiel auf, dass die Anonymisierung aus 5.9 ihr Haus „Ein vergessenes Haus" nannte
— was als Nachname „Namenlos Ein vergessenes Haus" ergab, einen Satz, wo ein Name stehen
sollte. Jetzt heißt es **„Vergessen"** und tut dasselbe.

_Fertig, wenn:_ Kein Mensch in der Stadt steht ohne Nachnamen da, und keine Anzeige
verrät, wer Spielerfigur ist und wer nicht. — Erledigt.

**5.11 Warum die Stadt stillstand.** ✓ (Punkte 55, 56) Ein Durchklick durch die laufende
Anwendung förderte den Befund zutage: Grünau steht im Jahr 96, und es ist nichts geschehen.
Kein privates Gebäude, keine Pacht, kein Preisschild, null Kinder, null Tote.

**Die erste Diagnose war naheliegend und zur Hälfte falsch.** Die NPCs werden ohne Geld
angelegt, die Spalte hat den Standardwert 0 — also fehlte Startkapital. Das stimmte, war
aber nicht der Grund.

**Gemessen statt geraten.** Der neue Test `worldComesAlive.spec.ts` baut die Welt so auf,
wie `seedWorld()` sie erzeugt, setzt nichts nach und lässt Zeit vergehen. Ergebnis nach
zwei Spieljahren: 508 von 800 Runden Müßiggang, voller Aktionsvorrat bei jedem, zwanzig bis
fünfzig Münzen in der Tasche. Sie _konnten_ handeln und _wollten_ nicht.

Der Grund stand in `npc.logic.ts`: Gearbeitet wurde, **solange das Geld unter der Rücklage
lag**. War sie voll, hörte man auf. Ein Grundstück verlangt aber Rücklage _plus_ Kaufpreis
— und über die Rücklage kam niemand. Es fehlte nicht das Geld, sondern **ein Grund, mehr zu
verdienen als für das Brot von morgen.**

**`savingsTarget` ist die Antwort:** Wer etwas vorhat, arbeitet über die Rücklage hinaus.
Gespart wird auf den **nächsten Schritt** und nicht auf das ganze Vorhaben — erst das
Grundstück, dann das Haus darauf. Kleine Ziele halten den Fortschritt sichtbar, und niemand
hängt an einer Summe, die er in seinem Leben nicht erreicht. Die Reihenfolge folgt der
Bedürfnishierarchie: Das Dach der Familie geht dem eigenen Unternehmen vor.

Erst danach das **Startkapital** — und der zweite Messlauf zeigte prompt, wie man es falsch
macht. Mit bis zu 240 Münzen stand die Stadt vollständig still: vierhundert Ticks, kein
einziger Arbeitseinsatz. Wer mehr besitzt, als seine Rücklage verlangt, arbeitet nicht;
die acht lebten von ihrem Vermögen. Jetzt sind es zwanzig bis neunzig — genug für ein
Grundstück und etwas Anlauf, zu wenig zum Ausruhen.

**Und die dritte Zutat:** Drei der acht Gründer bringen Unternehmergeist mit, festgelegt
statt gewürfelt. Zwei Läufe an derselben Welt hatten einmal zwei Unternehmungslustige und
drei gekaufte Grundstücke ergeben, einmal keinen einzigen und vierhundert Ticks Stillstand.
Eine Wirtschaft, die daran hängt, ob `randomPersonality` unter acht Menschen zufällig einen
über der Schwelle hervorbringt, ist keine. Das ist keine Bevorzugung, sondern Weltaufbau —
dieselbe Sorte Entscheidung wie die acht Namen.

**Was bleibt, wird ehrlich benannt:** Grundstücke werden gekauft, eine Werkstatt entsteht in
vierhundert Ticks noch nicht. Und ein Nebenbefund, der bewusst stehen bleibt (Punkt 61): Ein
Lediger wirbt in jeder Runde, in der er Punkte hat, und kommt nie zur Entfaltungsstufe.
Solange jeder irgendwann heiratet, ist das folgenlos — sobald Partner knapp sind, nicht
mehr.

Die **Produktionswelt bleibt unangetastet.** Kein Migrationsgeschenk an acht Menschen, die
sich ihr Geld erarbeitet haben; der Sparwille wirkt auch dort, nur langsamer.

**Damit wirkt auf dem Server nur eine der drei Änderungen** — und das gehört festgehalten,
bevor jemand aus der laufenden Welt falsche Schlüsse zieht: `seedWorld()` läuft nur, wenn
noch keine Welt steht. Startkapital und der festgelegte Unternehmergeist der Gründer
greifen deshalb ausschließlich in frisch aufgesetzten Welten. Bleibt Grünau stehen,
widerlegt das die Messungen nicht — es beantwortet die andere Frage: ob der Sparwille
allein genügt.

_Fertig, wenn:_ Eine Welt, die niemand anfasst, bringt aus eigener Kraft Eigentum hervor. —
Erledigt, gemessen und im Test festgehalten.

**5.14 Die Schmiede, die nie jemanden einstellte.** ✓ (Punkt 63) Zwei Tage unbeobachteter
Lauf auf dem Server, und der Blick ins Rathaus zeigte: „Städtische Schmiede — Niemand ist
angestellt." Seit dem ersten Tag der Welt, 97 Spieljahre lang.

Der Grund war eine Zeile Suchbedingung. Der NPC-Bürgermeister suchte in seinen Häusern
allein nach dem **Wachhaus** und hängte dort einen Sold aus; für jedes andere städtische
Haus geschah nichts. Und ohne Aushang bewirbt sich niemand — die Schmiede aus `seed.ts`
war damit per Konstruktion unbesetzbar. Ausgerechnet die, die das Konzept als Starthilfe
vorsieht: der Ort, an dem ein Neuling seine ersten Münzen verdient.

Aus `PAY_GUARD` wurde **`PAY_WAGE`**, und gesucht wird jetzt das erste Haus der Stadt mit
einer offenen Stelle ohne Aushang. **Welche Häuser das sind, sagt die Vorlage und keine
Liste im Dienst:** `positionsAt` kennt eine Stelle nur, wo es Lohn oder Rezept gibt — das
Rathaus fällt von selbst heraus, und ein künftiger öffentlicher Bau ist ohne Zutun dabei.
Die Frage „hat dieses Haus eine offene Stelle?" stand vorher zweimal im Code, einmal für
den NPC und einmal hier; sie steht jetzt als `hasUnofferedPosition` an einer Stelle.

Eine Rangfolge unter den Häusern gibt es bewusst nicht. Erst die Wache, dann das Handwerk
wäre eine zweite Meinung darüber, was der Stadt wichtiger ist, und einen Tick später ist
ohnehin das nächste dran.

_Fertig, wenn:_ Ein Arbeitsplatz, den die Stadt besitzt, wird auch ausgeschrieben. —
Erledigt, mit zwei Tests: einer für die Schmiede, einer dagegen, dass derselbe Aushang in
jedem Tick neu gesetzt wird.

**5.15 Auf einer Pacht arbeiten lassen.** ✓ Bis hierher war eine Abbaufläche etwas, das
man selbst bestellt: Wer nicht persönlich aufs Feld ging, bekam nichts. Jetzt kann ein
Pächter Leute anstellen, die für ihn ernten.

**Die Hürde war das Datenmodell.** Eine Anstellung hängt im ganzen Spiel an einem
_Gebäude_ — Aushang, Stellenzahl, Schicht, Lohnkasse, Lager. Eine Pachtfläche ist ein
`Plot` mit einem `Lease` und hat von alldem nichts. Der Weg, `Employment` polymorph zu
machen, hätte eine Migration und jede Stelle gekostet, die heute eine `BuildingId`
voraussetzt.

**Stattdessen bekommt die Fläche ein Haus:** den **Hof**, der mit der Pacht entsteht und
mit ihr fällt. Damit greift die vorhandene Maschinerie unverändert — der Pächter hängt
einen Lohn aus wie jeder Betrieb, und der Bürgermeister-Umbau aus 5.14 gilt automatisch
mit.

Zwei Entscheidungen tragen das:

**Der Hof hat kein eigenes Rezept — seines steht im Boden.** Ein Hof am Mühlenfeld erntet
Getreide, derselbe Hof an der Erzgrube bricht Erz. Eine Vorlage je Rohstoffart wären sechs
Vorlagen, die sich in einer Zeile unterscheiden; `workForEmployer` holt das Rezept deshalb
aus dem Grundstück. Die Jahreszeit gilt dabei auch für den Knecht — sonst wäre eine
Anstellung der Weg, die Kräutersaison zu umgehen.

**Der Hof ist ein eigener Gebäudetyp und ausdrücklich kein `CRAFT`.** Wer einen Hof hat,
hat noch keinen Betrieb. Zählte er als Werkstatt, hielte sich jeder Pächter für einen
Unternehmer: Ein NPC baute nie eine echte, weil er ja schon eine zu haben glaubt, und in
der Bauliste des Spielers stünde ein Haus zum Preis von null, das man nicht baut.

Der **Zehnt trifft auch den Ertrag des Knechts**. Sonst wäre eine Handvoll Angestellter
der Weg, ihn zu umgehen, und der Satz, den die Stadt beschließt, gälte nur für die, die
selbst aufs Feld gehen.

Migration `0021` trägt den Hof für Pachten nach, die es vorher schon gab — sonst könnte
ausgerechnet der erste Pächter der Welt als einziger niemanden beschäftigen.

_Fertig, wenn:_ Ein Pächter kann jemanden für sich ernten lassen. — Erledigt, mit fünf
Tests. **Und ein Nebenbefund aus dem Testschreiben** (Punkt 65): Der Zehnt wird in der
Region der _Fläche_ nachgeschlagen, und die Umlandflächen liegen in eigenen Regionen. Der
Erlass des Bürgermeisters erreicht sie nie.

**5.16 Die erste Werkstatt der Welt.** ✓ (Punkt 63) Die Stadt bringt zum ersten Mal aus
eigener Kraft einen Betrieb hervor — und danach läuft die ganze Kette durch.

**Die Diagnose war falsch, das Messen hat es gezeigt.** Punkt 63 beschrieb einen
geschlossenen Kreis: Jeder Bau brauche Material, Material gebe es nur zu kaufen, verkauft
werde nur, was ein Betrieb hervorbringt. Die erste Zeile stimmt nicht.
`producesBuildingMaterial` nimmt genau die Betriebe aus, die Baustoff herstellen, und die
billigste fehlende Werkstatt in Grünau ist die **Zimmerei für 180 Münzen**. Die Tür stand
die ganze Zeit offen; es ging nur nie jemand hindurch.

**Woran es wirklich lag, stand in `savingsTarget`.** Alle acht Gründer waren verheiratet
und ohne Haus, also griff der erste Zweig: das Dach der Familie. Für die Kate fehlen
Bretter, Bretter bot niemand an — `materialPrice` war `null`, und die Funktion gab `null`
zurück. Kein Sparziel heißt `sparziel = Rücklage`, und wer die voll hat, hört auf zu
arbeiten. Gemessen an der frischen Seed-Welt über 400 Ticks: **2911 von 3200 Runden
Müßiggang**, 122 Arbeitseinsätze, kein privates Gebäude. Dieselbe Falle wie bei Punkt 55,
nur eine Ebene höher: nicht das Geld fehlte, sondern ein erreichbares Ziel.

Drei Änderungen:

**Ein Ziel, das man nicht kaufen kann, ist kein Ziel.** Fehlt das Baumaterial und bietet es
niemand an, wird nicht mehr aufgegeben, sondern durchgefallen auf die Werkstatt. Das ist
keine Ausweichhandlung, sondern die Lösung — die billigste fehlende ist die Zimmerei, und
die stellt genau die Bretter her, an denen es scheitert. Wer kein Holz findet, macht sich
welches.

**Der Betrieb braucht Nachschub.** Wer eine Werkstatt hat, aber keine Fläche, spart auf die
Pacht. Ohne das war der erste Betrieb eine Sackgasse: Die Zimmerei stand nach 900 Ticks
noch ohne Holz da, weil ihre Besitzerin ihr Ziel erreicht hatte und keinen Grund mehr
sah, über die Rücklage hinaus zu arbeiten.

**`plotPrice` ist `null`, wenn kein Bauland frei ist.** Als feste Konstante war der Preis
eine Zusage, die die Stadt nicht einlösen konnte — 466 Fehlversuche in 600 Ticks, weil der
Kauf scheiterte, `hasFreePlot` falsch blieb und derselbe NPC es im nächsten Tick erneut
versuchte. Dieselbe Bauart wie `leaseAvailable`, und derselbe Grund.

Gemessen nach dem Umbau, 600 Ticks, frische Seed-Welt, nichts nachgesetzt:

```
BUILD: 1        Zimmerei          BUY_MATERIAL: 4   andere kaufen die Bretter
LEASE: 1        Hof am Eichwald   BUILD_HOME: 2     Familien bauen eigene Häuser
HARVEST: 123    Holz              SELL: 3           am Markt
CRAFT: 349      Bretter           BUY_PLOT: 5       statt 466
```

Der Hof aus 5.15 trägt dabei zum ersten Mal: Die Zimmerei pachtet den Eichwald und holt
sich ihr Holz selbst.

_Fertig, wenn:_ Eine Welt, die niemand anfasst, bringt einen Betrieb hervor und hält ihn
am Laufen. — Erledigt, gemessen und in fünf Tests festgehalten.

**Was das für Punkt 66 heißt:** Der Tagelohn hat noch immer keinen Zahler und ist damit
die Geldquelle der Welt. Aber jetzt gibt es einen zweiten Weg an Geld — Waren herstellen
und verkaufen —, und das war die Voraussetzung dafür, die Quelle überhaupt schließen zu
können, ohne die Wirtschaft stillzulegen.

**5.17 Zutaten kaufen.** ✓ Die zweite Stufe jeder Produktionskette hat keine Fläche: Mehl
wächst nicht, es wird gemahlen. Bis hierher konnte ein NPC nur **Baumaterial** kaufen —
für Rezeptzutaten gab es keine Handlung. Ein Müller kommt noch durch, weil er Getreide
selbst pachten und ernten kann; ein Bäcker hätte sein Leben lang vor einem leeren Backhaus
gestanden.

`BUY_INPUT` schließt das, samt Sparziel — sonst hätte der Bäcker wieder keinen Grund zu
arbeiten, dieselbe Falle wie in 5.16. Gekauft wird genau so viel, wie ein Durchgang
braucht: Wer das Mehl der Stadt aufkauft, nimmt es dem nächsten weg und bindet Geld in
Vorrat, den er in dieser Woche nicht verarbeitet. Die gekaufte Zutat geht der Pacht vor,
weil sie der kürzere Weg ist — und für die zweite Stufe der einzige.

**5.18 Der zweite Verkaufsweg.** ✓ (Punkt 30) Ein Messlauf über 2000 Ticks zeigte den
Stau: **1233 Durchgänge Bretter**, von denen die Stadt nie mehr als das erste Schild zu
sehen bekam. Die Zimmerei produzierte in eine Kammer hinein, und weil die nächsten
Werkstätten Bretter als Baumaterial brauchen, kam niemand über sie hinaus — keine Mühle,
kein Backhaus, `BUY_INPUT: 0`.

Zwei Ursachen, beide behoben:

**Ein liegengebliebenes Angebot sperrte den Nachschub für immer.** `unverkauftes` übersprang,
wofür schon ein Schild hing. Nötig war die Sperre nie: `placeOffer` nimmt die Ware aus
Lager und Kammer ins Angebot hinein, wer alles ausgehängt hat, hat nichts mehr übrig. Damit
daraus kein Schilderwald wird, **stockt gleiche Ware zu gleichem Preis das bestehende
Angebot auf**, statt danebenzuhängen. Bei anderem Preis entsteht ein eigenes: Das ist eine
andere Aussage und keine Nachlieferung.

**Und es verkaufte nur, wer einen Betrieb hatte.** Der Marktplatz — der einzige Laden, der
niemandem gehört — wurde von der Simulation nie betreten. Jetzt geht der Überschuss dorthin,
gegen Standgeld. Behalten wird, was man braucht: Essen bis zum Wochenvorrat (wer sein letztes
Brot verkauft, verhungert am eigenen Geschäftssinn), Zutaten des eigenen Betriebs, und
Baumaterial, solange ein Bau ansteht. Wer das Standgeld nicht aufbringt, wählt die Handlung
gar nicht erst — sonst scheiterte sie in jedem Tick aufs Neue.

Damit steht die Regel aus `KONZEPT.md` auch für NPCs: **Eine Ware ohne Verkaufsweg ist eine
tote Ware.**

**Ein Befund nebenbei** (Punkt 67): Vierzig Ticks einer Acht-Einwohner-Stadt brauchen rund
fünfundzwanzig Sekunden. Mit `git stash` gegengeprüft — auf dem Stand von 5.16 ist es
genauso langsam, es liegt also nicht an diesen beiden Schritten, sondern an der Summe
vieler. `lageAufnehmen` nimmt für jede einzelne Entscheidung die halbe Welt auf, obwohl
sich das meiste davon innerhalb eines Ticks für alle Einwohner derselben Stadt nicht
ändert. Das Zeitlimit von `worldComesAlive.spec.ts` steigt deshalb auf zehn Minuten, und
sein Kommentar sagt jetzt die Wahrheit statt der Zahl von 5.11.

**Danach `1.0.0`.** Damit endet auch das Versionsschema aus `CLAUDE.md`, das
`0.<Phase>.<Schritt>` vorsieht; ab dem öffentlichen Betrieb zählt die erste Stelle nicht
mehr die Phase. Naheliegend ist, jede weitere Phase als Minor zu führen — Phase 6 wird
`1.1.x`. Das gehört entschieden, bevor der Tag da ist.

## Phase 6 — Ruf und Handwerk

Der erste Block nach dem Start, und der, der am meisten trägt: Er bringt die Größe, die
ein halbes Dutzend späterer Regeln braucht, und macht aus dem Handwerk einen Stand statt
einer Zahl.

**6.1 Ansehen und Ruf.** (Punkt 47) Eine Zahl am Charakter, die aus Taten entsteht,
abklingt und zum Teil auf den Erben übergeht; als Schicht in der Zuneigung sofort
wirksam. Sie kommt **zuerst**, weil alles Folgende sie als Bremse voraussetzt.

_Fertig, wenn:_ Wer sich anständig verhält, merkt es an der Stadt — und wer nicht, auch.

**6.2 Die Lehre im eigenen Betrieb.** (Punkt 45) Kinder arbeiten in der Werkstatt mit,
bringen wenig ein und lernen dabei. Steht **vor** der Meisterpflicht, nicht daneben: sonst
wäre die Pflicht eine Falle für jeden Erben.

_Fertig, wenn:_ Ein Kind, das mit zehn in die Werkstatt geht, kann sie mit sechzehn
führen.

**6.3 Wer ein Handwerk führen darf.** (Punkt 34) Eine Werkstatt braucht jemanden, der das
Handwerk beherrscht — den Eigentümer oder einen Angestellten. Damit bekommen Fertigkeiten
wirtschaftliches Gewicht, und der plötzliche Tod eines Meisters hat die Folge, die
Permadeath tragen soll.

_Fertig, wenn:_ Eine Schmiede ohne Schmied steht still, und man sieht, warum.

**6.4 Zünfte.** (Punkt 46) Die Körperschaft, die die Meisterwürde verleiht, die Lehre
ordnet, Preise setzt und den Zutritt begrenzt. Der größte Schritt der Phase — und der
erste Ort im Spiel, an dem sich mehrere Spieler zusammentun können. Die Preisregeln
wandern dabei vom Bürgermeister zur Zunft.

_Fertig, wenn:_ Zwei Häuser streiten sich um eine Zunftmeisterwahl, und der Rat kann
nichts dagegen tun.

**6.5 Über den Lohn wird verhandelt.** (Punkt 33) Bisher hängt ein Betrieb einen Satz aus
und wer will, tritt ein. Künftig geht, wem zu wenig geboten wird — und wer über Jahre
gehalten hat, zahlt weniger, weil Zuneigung etwas wert ist.

_Fertig, wenn:_ Eine Stadt mit drei Schmieden und zwei Gesellen hat steigende Löhne.

**6.6 Familie: Ehe für alle, Adoption, Mitgift.** (Punkte 38, 51) Die Ehe wird für jedes
Paar geöffnet; die Adoption ist der zweite Weg zum Erben und gehört in denselben Schritt,
weil die Öffnung ohne sie eine Falle wäre. Dazu die Mitgift, die aus der Heirat zwischen
zwei Häusern eine Verhandlung macht, und das Testament.

_Fertig, wenn:_ Ein Haus ohne leibliche Kinder hat einen Weg weiter, und eine Heirat
kostet etwas.

## Phase 7 — Recht, Schuld und Gewalt

Der Block, in dem die Stadt lernt zu vollstrecken. Er hängt eng zusammen: Ohne Richter
kein Urteil, ohne Turm keine Vollstreckung, ohne Vollstreckung kein Kredit — und ohne
Kampf kein Räuber, den man einsperren könnte.

**7.1 Die Ämter und der Richter.** (Punkt 32) Der dritte Zweig, den die Stadt noch nicht
hat. Dazu der Zuschnitt der übrigen Ämter und die Entscheidung, was gewählt und was
ernannt wird. Der Richter wird gewählt, weil ein Richter, den der Bürgermeister absetzen
kann, kein Gegengewicht ist.

_Fertig, wenn:_ Ein Bürgermeister muss mit einem Richter auskommen, den er nicht wollte.

**7.2 Der Schuldturm.** (Punkt 44) Haft als Zustand: Wer sitzt, handelt nicht. Und die
Auslösung, ohne die es eine Sackgasse wäre. Er nimmt auch überführte Räuber auf, die es
noch nicht gibt — deshalb steht er hier und nicht später.

_Fertig, wenn:_ Jemand sitzt, jemand anderes holt ihn heraus, und beides steht in der
Chronik.

**7.3 Verträge zwischen Charakteren.** Der unscheinbarste und nützlichste Schritt der
Phase. Es gibt bisher genau einen Vertrag — die Anstellung. Es kommen drei dazu:
Bauauftrag (Punkt 35), Kredit (Punkt 43) und Lehrvertrag. Statt dreimal „A bietet, B nimmt
an" zu bauen, entsteht die Form einmal.

_Fertig, wenn:_ Ein Angebot, das jemand annehmen oder ablehnen kann, ist eine Sache und
nicht drei.

**7.4 Geldverleih.** (Punkt 43) Die Leihstube, der Zins, das Pfand — und der Turm als
letzte Stufe. Er bringt die Fallhöhe, die ein Spiel über Generationen braucht, und löst
die Klemme zwischen Vermögen und Liquidität, an der ein Neuling, ein Erbe und eine
ausgefallene Ernte gleichermaßen hängen.

_Fertig, wenn:_ Jemand hat sich verschuldet, gebaut, und es hat sich gelohnt — oder eben
nicht.

**7.5 Der Bauherr.** (Punkt 35) Wer nicht selbst Holz einkaufen will, beauftragt jemanden.
Die Baukette bleibt unangetastet; der Unternehmer verdient an der Spanne. Nutzt die
Vertragsform aus 7.3.

_Fertig, wenn:_ Man kann ein Haus bestellen, statt es zu bauen.

**7.6 Kämpfe und Verletzungen.** (Punkt 6) Die Fertigkeit steht, der Ausgang nicht: Wer
darf wen angreifen, was schützt, was kostet es, und kann ein Kampf tödlich enden. Das
Letzte hängt an der Erbfolge und ist die eigentliche Entscheidung.

_Fertig, wenn:_ Ein Überfall geht aus, ohne dass jemand die Regeln kennen muss, um ihn zu
überleben.

**7.7 Räuber als Beruf.** (Punkt 23) Bande, Überfall, Beute — und das Gegengewicht aus
Wache, Ruf und Turm, das seit 4.7c auf diese Aufgabe wartet. Erst hier ist alles
beisammen, was ein Räuber braucht: etwas zu holen, jemanden, der ihn fängt, und einen Ort,
an den er kommt.

_Fertig, wenn:_ Ein NPC ergreift den Beruf, und die Stadt reagiert darauf.

## Phase 8 — Die Welt wird größer

Aus 4.9b geworden und deutlich gewachsen. Der teuerste Block, weil alles, was heute
stillschweigend „die Startstadt" annimmt, danach zwei Orte vertragen muss.

**8.1 Die Karte als Sechseckraster.** (Punkt 31) Kacheln mit Lage und Art, Entfernung
gerechnet statt gespeichert, `regionLink` fällt. Der Zielkonflikt zwischen Bebauung und
Ertrag ist der Kern: Wer baut, nimmt der Kachel, was sie hergibt.

_Fertig, wenn:_ Eine Stadt verdichtet sich von selbst, ohne dass es eine Vorschrift gibt.

**8.2 Die zweite Stadt.** Gründung auf einer Kachel ohne Nachbarstadt; alles, was
regionsblind ist, wird regionsfähig. Der eigentliche Umbau.

_Fertig, wenn:_ Zwei Städte laufen nebeneinander, jede mit eigener Kasse, Wahl und
Chronik.

**8.3 Reisen.** (Punkt 41) Ziel und Ankunfts-Tick am Charakter; unterwegs handelt er
nicht. Dazu die Durchsicht jeder bestehenden Handlung: Handgriff oder Anweisung.

_Fertig, wenn:_ Wer in Falkenstein etwas will, ist erst einmal acht Ticks unterwegs.

**8.4 Fernhandel.** `shipment` mit Ankunfts-Tick, Preisunterschiede zwischen Städten. Erst
jetzt gibt es etwas zu überfallen, das nicht in derselben Stadt steht.

_Fertig, wenn:_ Eine Karawane bindet Kapital und kommt an — oder nicht.

**8.5 Bürgerrecht und Stand.** (Punkt 49) Besitz und Wahlrecht nur für Bürger, erworben
durch Bleiben; ein Hauptwohnsitz, mehrere Bürgerrechte. Der Titel vor dem Namen macht den
Stand sichtbar. Steht hier, weil er ohne zweite Stadt die halbe Wirkung hätte.

_Fertig, wenn:_ Ein Zuwanderer arbeitet ein Jahr, bevor er mitreden darf.

**8.6 Zoll, Bannrechte, Bauordnung und die Grenzen für Auswärtige.** (Punkt 50) Vier neue
Gesetzesarten, die alle erst jetzt etwas bewirken können.

_Fertig, wenn:_ Zwei Städte führen unterschiedliche Politik, und man merkt es am Preis.

## Phase 9 — Glaube und Geselligkeit

Der Block, der die Stadt bevölkert statt sie zu erweitern. Er kommt spät, weil er nichts
blockiert — und er wäre trotzdem der erste, den man vorziehen sollte, wenn das Spiel
lebendiger wirken soll.

**9.1 Religion und Taufe.** (Punkt 39) Zwei Konfessionen, gleichwertig, Zugehörigkeit
durch Taufe, Wirkung auf die Zuneigung. Damit bekommt die Wahl eine zweite Achse neben
der persönlichen Zuneigung.

**9.2 Die Kirche als Betrieb.** Sie gehört jemandem und lebt von Taufe, Hochzeit,
Begräbnis. Der erste Dienstleistungsbetrieb — er verkauft keine Ware, sondern eine
Handlung, die es ohnehin gibt.

**9.3 Brauer und Taverne.** Bier gibt dem Acker seinen zweiten Abnehmer, die Taverne gibt
dem Werben einen Ort. Zusammen mit 9.2 die Bauart für alles, was Leistung statt Ware
verkauft.

**9.4 Feste im Jahreslauf.** Aus dem Tick gerechnet, nicht gespeichert. Sie geben dem Jahr
einen Rhythmus und der Zuneigung eine Gelegenheit, viele auf einmal zu treffen.

**9.5 Die Stadtreligion.** Die Gesetzesart, die Andersgläubige besteuert — und die
Auswanderung als ihr Gegengewicht. Braucht 8.2 und 8.5, sonst hat sie keine Folgen.

_Fertig, wenn:_ Eine Stadt hat eine Mehrheit, eine Minderheit und einen Streit darüber.

## Phase 10 — Leib und Leben

Zuletzt, was am Körper hängt. Es blockiert nichts, aber ein halbes Dutzend Waren wartet
darauf, eine Wirkung zu bekommen.

**10.1 Krankheiten.** (Punkt 5) Ursache, Verlauf, Heilung; Wirkung auf Aktionspunkte und
Sterberisiko. Der Brunnen bekommt seinen Zweck, der Seuchenzug aus 4.8 seine Folgen.

**10.2 Bader und Hospital.** Der Ort, an dem Heilkunst wirkt, und der zweite Beruf, der
Leistung verkauft.

**10.3 Heiltrank und Winterkleidung.** Die beiden Waren, die seit 4.11 fertig entworfen
sind und auf ein System warteten.

**10.4 Verschleiß von Gegenständen.** (Punkt 20) Ohne ihn kauft niemand ein zweites Mal,
und der Schneider hat nach einer Generation nichts mehr zu tun. Die Bauart steht seit dem
Gewand; offen ist nur, ob Ausrüstung einzeln geführt wird.

_Fertig, wenn:_ Ein Handwerk bleibt ein Beruf und wird nicht ein einmaliger Auftrag.

## Was quer dazu läuft

Vier Punkte gehören in keine Phase, weil sie in alle gehören:

- **Weltinhalte** (Punkt 15): Berufe, Waren, Rezepte wachsen mit jedem Block. Pferd und
  Fuhrwerk kommen mit Phase 8, Bader mit 10, Brauer mit 9.
- **Balancing** (Punkt 16): am laufenden Spiel, nicht am Reißbrett — ab Phase 5 gibt es
  eines.
- **Was NPCs tun** (Punkte 30, 24, 7): kein eigener Schritt mehr, sondern Bedingung jedes
  Schritts. Die drei Persönlichkeitsachsen ohne Handlung bekommen ihre mit den Systemen,
  zu denen sie gehören — Mut mit dem Kampf, Ehrgeiz mit den Ämtern, Verträglichkeit mit
  der Fehde.
- **Weitere öffentliche Gebäude** (Punkt 12): Der Katalog wächst mit dem, was es zu
  schützen gibt. Löschteich mit der Bauordnung, Brunnen mit den Krankheiten, Schuldturm
  mit Phase 7.

## Was fehlt, wenn man es ehrlich sagt

Der Plan hat zwei Stellen, an denen er brechen kann.

**Phase 8 ist zu groß.** Die zweite Stadt berührt jede Abfrage, die heute eine Region
annimmt. Wenn etwas schiefgeht, dann dort — und es lohnt, vorher einmal zu zählen, wie
viele Stellen das wirklich sind, statt es zu schätzen.

**Phase 5 könnte kürzer sein.** Wer früher öffnen will, kann 5.6 (Startbedingungen)
vorziehen und den Rest der Phase mit ein paar Spielern zusammen machen. Das ist die
riskantere, aber lehrreichere Reihenfolge: Was ein Neuling wirklich braucht, weiß man
erst, wenn einer da ist.

## Warum in dieser Reihenfolge gebaut wurde

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
