# Offene Punkte

Alles, was noch entschieden oder entworfen werden muss, mit dem Zeitpunkt, zu dem es
spätestens fallen muss. Entschiedenes steht in `KONZEPT.md`, der Weg dorthin in
`ENTWICKLUNG.md`.

| #   | Punkt                                                                                | Fällig vor                   | Art          |
| --- | ------------------------------------------------------------------------------------ | ---------------------------- | ------------ |
| 5   | Krankheiten: Ursachen, Verlauf, Heilung                                              | Heiltrank (4.6c)             | Entwurf      |
| 6   | Kämpfe und Verletzungen                                                              | Waffen und Gift (4.6c)       | Entwurf      |
| 7   | NPC-Gewichte für Mut, Ehrgeiz und Verträglichkeit                                    | 4.7 / Punkt 6                | Entwurf      |
| 12  | Weitere öffentliche Gebäude, ihr Ausbau und ihre Wirkung                             | 4.8                          | Entwurf      |
| 14  | Startbedingungen für neue Spieler                                                    | erster öffentlicher Betrieb  | Entscheidung |
| 23  | Räuber als Beruf: Bande, Überfälle, Einbrüche (die Zufalls-Raubzüge stehen seit 4.8) | 4.8 / Punkt 6                | Entwurf      |
| 24  | NPC-Eltern und die Schule: wer sein Kind hinschickt                                  | laufend                      | Entwurf      |
| 20  | Verschleiß von Gegenständen                                                          | Kleidung und Werkzeug (4.6c) | Entwurf      |
| 15  | Weltinhalte: Berufe, Waren und Rezepte                                               | laufend                      | Entwurf      |
| 16  | Balancing im engeren Sinn                                                            | laufend                      | laufend      |
| 25  | End-to-End-Test (Playwright)                                                         | erster öffentlicher Betrieb  | Aufgabe      |
| 26  | Datensicherung per Cron, einmal wiederhergestellt                                    | erster öffentlicher Betrieb  | Aufgabe      |
| 27  | Impressum, Datenschutz, Nutzungsbedingungen                                          | erster öffentlicher Betrieb  | Aufgabe      |
| 28  | Kontolöschung als Anonymisierung                                                     | erster öffentlicher Betrieb  | Entwurf      |

Erledigt und deshalb aus der Liste gefallen: **Zeitskala** (1 Tick = 1 Stunde, 50 Ticks =
1 Spieljahr — die krumme Zahl mit Absicht, siehe 4.5b), **URL-Struktur** (Unterpfad mit
`paths.base`, wie bei Festival), mit Phase 4.5a der **Fertigkeitenkatalog** samt
Übungskurve und den Grenzen der Lehre, mit Phase 4.6c der **Pachtvertrag im Erbfall**
(er fällt an die Stadt zurück), mit Phase 4.9a das **Verfahren zur Erschließung** (eine Amtshandlung aus der Stadtkasse,
die Vergabe per Versteigerung — gezahlt wird erst beim Zuschlag, und wer dann nicht kann,
wird übergangen), mit Phase 4.7e die **Wirkung der Schule** (sie kostet das Kind Aktionspunkte wie Arbeit
und wirkt wie ein Lehrmeister; Lehrer sind aus öffentlicher Hand bezahlt, das Schulgeld
ist ein Gesetz), mit Phase 4.7d der **Umfang der Chronik** (im Testbetrieb wird alles
festgehalten), mit Phase 4.7c die **Stadtwache** (eine Anstellung, kein Amt: Der Bürgermeister setzt
den Sold aus, die Stadtkasse zahlt ihn — damit ist ihre Stärke eine Haushaltsfrage und
keine Verfassungsfrage) und der **Verfall öffentlicher Bauten** (sie verfallen wie
private, stürzen aber nicht ein), mit Phase 4.7b die **Steuerarten** (die vorhandenen Sätze werden zu Gesetzen, dazu eine
Grundsteuer je Grundstück und Spieljahr — sie trifft die Besitzenden statt die Neulinge
und macht Horten teuer), mit Phase 4.7a das **Wahlalter** (die Volljährigkeit, dieselbe Grenze wie fürs Heiraten
und Arbeiten) und die **Amtsnachfolge** (der Zweitplatzierte rückt nach — und zwar ohne
dass etwas nachrücken müsste, weil der Amtsinhaber aus der letzten Wahl gerechnet wird),
mit Phase 4.6a die **Folgen ungedeckter
Bedürfnisse** (gestaffelt: erst Leistung, dann Leben), und mit Phase 4.1 das
**Tick-Nachholen** —
verpasste Ticks werden übersprungen, die Weltuhr springt trotzdem vor, und niemand
bekommt etwas für die Ausfallzeit. Alles steht in `KONZEPT.md` beziehungsweise
`ENTWICKLUNG.md`.

## Vor Phase 4

### 5. Krankheiten

Beides soll es geben — Krankheit als Folge von Not, Seuche oder Alter. Zu entwerfen:
Ansteckung, Verlauf, Heilung (Kräuter als Ware? Ein Bader als Beruf?), Auswirkung auf
Aktionspunkte und Sterberisiko. Berührt die Ereignisse aus 4.8 (Seuchenzug) und den
Brunnen als öffentliches Gebäude.

### 6. Kämpfe und Verletzungen

Feindliche Interaktion soll körperliche Folgen haben, nicht nur Beziehungswerte
verschieben. Zu entwerfen: Wer darf wen angreifen, was schützt (Wachen, Mauern, Stand?),
was kostet es an Aktionspunkten und Ansehen, und wie verhindert man, dass Stärkere
Schwächere beliebig zurichten — gerade Neulinge. Am Rand hängt daran auch, ob Mord ein
Weg ist, an ein Erbe oder ein Amt zu kommen.

**Die Auflösung steht inzwischen fest:** über die Fertigkeit **Kämpfen** (siehe
`KONZEPT.md`, Abschnitt 7). Damit ist geklärt, _womit_ gekämpft wird — nicht aber, was
dabei herauskommt. Offen bleiben die Anlässe (Überfall auf einen Transport, Raub, Streit
mit der Konkurrenz, Dienst in der Stadtwache), der Ausgang bei ungleichen Stufen und
die Frage, ob ein Kampf tödlich enden kann. Letzteres hängt unmittelbar an 4.2: Ein Tod
durch Gewalt läuft durch dieselbe Erbfolge wie der Tod durch Alter, und damit wäre Mord
tatsächlich ein Weg an ein Erbe.

Wichtig für den Zuschnitt: Der Raub braucht Ware, die unterwegs ist — also `shipment`
aus 4.9 oder wenigstens den Transport innerhalb einer Region. Ohne das gibt es nichts zu
überfallen.

### 7. Verhaltensregeln der NPCs

**Zum großen Teil erledigt (Phase 4.6b).** NPCs essen, arbeiten, ziehen unter ein Dach
und werben — entschieden aus den Persönlichkeitsachsen, nicht aus einer Regel je Lage.
Die Kadenz ist entschieden: **so oft wie Spielercharaktere**, also über dasselbe
Aktionsbudget gedrosselt. Ein eigener Test lässt die Welt fünf Spieljahre ohne Spieler
laufen.

Offen bleiben die Gewichte der übrigen drei Achsen — **Mut**, **Ehrgeiz** und
**Verträglichkeit** tragen noch keine Handlung. Sie bekommen sie mit den Systemen, zu
denen sie gehören: Kampf und Wachdienst (Punkt 6), Kandidatur und Ämter (4.7), Fehde und
Nachgeben (4.7). Dazu kommen die Handlungen, die es noch nicht gibt: einkaufen, was nicht
Nahrung ist, renovieren, ausbauen, ein Grundstück kaufen, sich anstellen lassen.

Und die indirekten Befehle an eigene Geschwister-NPCs (anstellen, verheiraten, ins Amt
schicken) fehlen weiterhin — sie brauchen Anstellung (4.6c) und Ämter (4.7).

### 12. Weitere öffentliche Gebäude, ihr Ausbau und ihre Wirkung

**Entschieden (Phase 4.7c):** Öffentliche Gebäude verfallen wie private — der Zustand
senkt den Ertrag, die Unterkunft nimmt weniger Leute auf. Einstürzen können sie nicht:
Ein Rathaus, das zusammenfällt, nähme der Stadt die Wahl, und neu bauen kann es niemand.
Der Bürgermeister richtet sie aus der Stadtkasse her; ein NPC im Amt tut das von selbst,
sobald ein Bau unter die halbe Güte fällt.

**Entschieden (4.7e, noch nicht gebaut):** Von jeder Art darf es **mehrere** geben. Die
Begrenzung auf eins war eine Startannahme: Ein Rathaus je Stadt ist richtig, eine einzige
Unterkunft nicht. Wächst die Bevölkerung, braucht sie mehr Dach. Einmalig bleiben nur die
Bauten, die die Stadt als Ganzes betreffen — Rathaus, Marktplatz, Mauer. Die Grenze ist
damit nicht mehr das Limit, sondern die Knappheit: Bauland, Kasse und der Unterhalt, denn
drei Unterkünfte sind drei Bauten, die verfallen.

Offen bleibt der **Katalog**: Welche Bauten gibt es noch, was kosten sie, was bewirken
sie? Brunnen und Schule konkurrieren mit Wohnhäusern um knappes Bauland (eine echte
politische Abwägung), eine Stadtmauer umschließt dagegen die ganze Region und braucht
deshalb eine eigene Regel. Und ihr **Ausbau**: Bisher hat das Wachhaus eine Stufe und
damit eine Stelle — wer eine größere Wache will, müsste ausbauen können, und das kann
heute nur ein privater Eigentümer. Ausbauen oder ein zweites danebenstellen sind zwei
Wege zum selben Ziel; vermutlich braucht es nur einen.

Der Prüfstein ist derselbe wie bei Waren und Fertigkeiten: **Wo wirkt der Bau?** Ein
Brunnen gegen Seuchen setzt Punkt 5 voraus; eine Mauer gegen Räuber und ein Löschteich
gegen Brände hätten seit 4.8 dagegen sofort eine Wirkung — die Unglücke sind da, nur
fehlt bisher jeder Bau, der gegen sie hilft. Die Wache ist der einzige.

### 14. Startbedingungen

Wer neu anfängt — oder nach dem Erlöschen seines Hauses neu beginnt — trifft auf eine
Stadt, in der das Bauland vergeben ist. Der Grundweg steht fest: als Angestellter
anfangen und Geld verdienen. Offen ist, ob es Starthilfe gibt (etwas Kapital, ein Platz
in der Unterkunft, ein garantierter Arbeitsplatz) und ob eine neue Stadt Neulingen
vorbehalten sein kann.

Ohne Antwort hat das Spiel ein Zeitfenster, nach dem es für Neue unspielbar wird.

**Stand nach Phase 4.6:** Der Grundweg ist begehbar geworden — es gibt Arbeit gegen Lohn,
Waren mit Herkunft, Läden und Anstellung. Die städtische Schmiede ist damit die letzte
Stelle, an der Geld ohne Deckung entsteht, und kann fallen, sobald genug private Betriebe
stehen. Was ein Neuling **mitbekommt**, ist damit aber immer noch nicht entschieden.

**Vorläufig entschieden (Phase 3.3):** Die Startstadt hat eine **städtische Schmiede**, in
der jeder arbeiten kann. Damit ist der Grundweg wenigstens begehbar — 44 Schichten
reichen für ein Grundstück und ein Wohnhaus. Das ersetzt die Antwort nicht: Sobald es
Anstellungsverhältnisse (4.6) und eine echte Bevölkerungsdynamik gibt, muss geklärt sein,
ob dieser Betrieb bleibt, wem er gehört und was ein Neuling sonst noch mitbekommt.

## Vor der Politik

## Laufend

### 15. Weltinhalte: Berufe, Waren und Rezepte

Ortsnamen und Karte der Startregion, Warenkatalog mit Produktionsketten,
Gebäudekatalog mit Ausbaustufen. Überwiegend Fleißaufwand — wächst mit den Phasen 4.5
und 4.6.

**Die Richtung steht** (siehe `KONZEPT.md`, Abschnitt 8): Aus Fertigkeiten werden
Berufe, jeder Beruf hat sein Gebäude und seine Rezepte. Skizziert sind der **Schmied**
(Waffen, Rüstungen, Alltagsgerät aus Metall), der **Alchemist** (Heiltrank, Duftwasser,
Gift) und der **Schneider** (Kleidung gegen Kälte, Kleidung für den Umgang mit anderen).
Weitere kommen dazu.

**Mit Phase 4.10 gebaut:** die **Baukette** — Holzfäller und Steinmetz gewinnen Holz,
Stein und Erz, Zimmerei, Steinmetzhütte und Schmiede machen daraus Bretter, Quader und
Eisen, und verbaut wird es in jedem Haus. Zwei neue Fertigkeiten (Holzarbeit, Bergbau)
und der Nachweis, dass die Regel trägt: Die Ware wirkt, weil Bauen sie verbraucht.

**Mit Phase 4.11 gebaut:** **Schneider** und **Alchemist** — Gewand, Duftwasser und
Stärkungstrank. Beide wirken auf Größen, die stehen: Zuneigung (4.3) und Aktionspunkte.

Offen bleiben die Erzeugnisse, deren Wirkung an fehlenden Systemen hängt: Heiltrank und
Winterkleidung warten auf Krankheit (Punkt 5), Waffen, Rüstung und Gift auf den Kampf
(Punkt 6).

Der Prüfstein bleibt derselbe wie bei Fertigkeiten und Persönlichkeitsachsen: **Wo wirkt
die Ware?** Deshalb ist dieser Punkt nicht so unabhängig, wie er aussieht — er hängt an
Systemen, die es noch nicht gibt:

| Ware                    | wirkt auf             | wartet auf              |
| ----------------------- | --------------------- | ----------------------- |
| Heiltrank               | Krankheit             | Punkt 5                 |
| Gift, Rüstung           | Kampf                 | Punkt 6                 |
| Duftwasser              | Zuneigung beim Werben | nichts — 4.3 steht      |
| Winterkleidung          | Krankheit, Kälte      | Punkt 5, Jahreszeiten ✓ |
| Kleidung fürs Auftreten | Zuneigung             | nichts — 4.3 steht      |
| Werkzeug                | Produktion            | 4.6                     |

Was auf nichts wartet, lässt sich mit 4.6 sofort bauen; der Rest kommt, wenn sein System
kommt. Eine Ware ohne Wirkung wird nicht gebaut.

### 24. NPC-Eltern und die Schule

Der Schulbesuch ist bisher eine **Spielerhandlung**: Ein Spieler schickt seine Kinder
hin, NPC-Eltern schicken niemanden. Damit bleibt die Bildung ein Vorrecht der Häuser, die
jemand spielt — und eine Schule, die der Bürgermeister für die Stadt gebaut hat, steht die
meiste Zeit leer.

Nachzutragen ist die Regel, nach der ein NPC entscheidet. Die Persönlichkeitsachsen aus
4.4a liegen bereit und sagen unterschiedliche Dinge: **Ehrgeiz** spricht dafür (wer nach
oben will, will es auch für seine Kinder), **Geiz** dagegen (Schulgeld ist Geld, das jetzt
weg ist und erst in Jahren wiederkommt), **Fleiß** ist zweischneidig — ein fleißiger Vater
könnte sein Kind ebenso gut arbeiten lassen, denn der Schultag kostet dieselben
Aktionspunkte.

Zu klären ist außerdem, **wovon es sonst abhängt**: vom Vermögen (wer nichts hat, kann
nicht), vom Schulgeld (ein Bürgermeister, der es auf null setzt, sollte einen sichtbaren
Zulauf sehen — das ist der Reiz an der Stellschraube) und davon, ob überhaupt ein Lehrer
da ist, der etwas beibringen kann.

### 20. Verschleiß von Gegenständen

**Für die Kleidung entschieden (4.11):** Ein Gewand hält drei Spieljahre, dann ist es hin
— gespeichert wird nur der Zeitpunkt des Anziehens, alles andere ist eine Rechnung. Das
ist die Bauart, die auch für den Rest taugt, und der Beleg, dass sie trägt.

**Nicht nur Häuser verfallen, sondern auch alles, was man besitzt.** Ohne das kauft
niemand ein zweites Mal: Ein Mantel, ein Hammer und ein Schwert werden einmal gekauft und
halten ewig, und damit bricht die Nachfrage ein, sobald jeder einmal ausgestattet ist.
Der Schneider hätte nach einer Generation nichts mehr zu tun. Der Verfall ist also keine
Strafe, sondern die **Voraussetzung dafür, dass Handwerk ein Beruf bleibt** und nicht ein
einmaliger Auftrag.

Zu entscheiden ist, woran der Verschleiß hängt. Drei Möglichkeiten, mit unterschiedlichen
Folgen:

- **An der Zeit.** Ein Mantel hält so viele Spieljahre, dann ist er hin. Gleiche Bauart
  wie beim Gebäude (4.5), lässt sich träge rechnen — aber er verschleißt auch in der
  Truhe, was seltsam ist.
- **Am Gebrauch.** Ein Werkzeug verliert bei jeder Schicht etwas, Kleidung bei jedem
  Winter, eine Waffe bei jedem Kampf. Trifft die Sache genauer und braucht eine Zählung
  je Stück statt je Stapel — der Vorrat ist heute eine Menge, kein Bestand einzelner
  Dinge.
- **Beides.** Realistisch und zwei Regeln, wo eine reichen könnte.

Daran hängt die größere Frage: **Bleiben Gegenstände Stapel oder werden sie einzeln?** Ein
Zustand je Stück heißt eine Zeile je Stück — bei Brot wäre das absurd, bei einem Schwert
richtig. Vermutlich läuft es auf eine Trennung hinaus: Verbrauchsgüter bleiben eine Menge,
Ausrüstung wird einzeln geführt. Diese Entscheidung fällt spätestens mit der ersten Ware,
die länger hält als ein Bissen.

### 23. Räuber als Beruf

**Ein Beruf, den man ergreift wie jeden anderen.** Wer ihn wählt, baut eine Bande auf —
das sind Angestellte wie in jeder Werkstatt, nur ist der Ertrag nicht Ware, sondern
Beute: Überfälle auf Händler, Einbrüche in Häuser und Betriebe.

Das Schöne daran ist, dass es fast nichts Neues braucht. Bande = `employment`, Unterschlupf
= ein Gebäude, Beute = Waren und Münzen, die den Besitzer wechseln. Was fehlt, ist der
Ausgang: Ob ein Überfall gelingt, entscheidet der Kampf (Punkt 6), und wogegen er sich
richtet, entscheiden die Ereignisse aus 4.8. Deshalb steht der Räuber hinter beiden.

Zu entwerfen ist vor allem das **Gegengewicht**. Ein Beruf, der nimmt, statt herzustellen,
braucht ein Risiko, sonst ist er die dominante Strategie:

- Die **Stadtwache** (4.7c ✓) ist das offensichtliche — sie wartet seit ihrem Bau auf
  genau diese Aufgabe.
- **Zuneigung und Ruf**: Wer beim Rauben erkannt wird, verliert sie bei den Bestohlenen
  und ihren Häusern. Das trifft einen Räuber dort, wo es weh tut: bei der nächsten Wahl
  und bei der Partnersuche.
- **Verfolgung**: Was passiert mit einem überführten Räuber? Kerker, Pranger, Verbannung
  — und wer spricht das Urteil? Naheliegend der Bürgermeister, womit das Amt seine dritte
  Aufgabe bekäme.

Offen ist auch, ob NPCs den Beruf ergreifen. Die Persönlichkeitsachsen liegen bereit —
Mut und Verträglichkeit warten seit 4.4a auf eine Handlung, und Rauben wäre für beide
die natürlichste.

### 16. Balancing

Wie stark wirkt was, wie schnell verfällt Zuneigung, was kostet welche Handlung, wie viel
wirft ein Betrieb ab. Bewusst am laufenden Spiel justiert, nicht vorab am Reißbrett.
Voraussetzung dafür ist, dass die Werte an einer Stelle stehen (Templates und Konstanten
im Code) und nicht über die Logik verstreut sind.

## Vor dem ersten öffentlichen Betrieb — was noch fehlt

Der Umbau selbst ist abgeschlossen (siehe `ENTWICKLUNG.md`). Was von seiner letzten Phase
übrig blieb, ist keine Architektur mehr, sondern das, was ein Spiel braucht, bevor Fremde
es benutzen dürfen.

### 25. End-to-End-Test

Die Unit- und Dienst-Specs decken die Regeln ab, aber kein einziger Test klickt sich
durch die Anwendung. Ein Playwright-Rundlauf — registrieren, Charakter anlegen, ein
Grundstück kaufen, bauen, arbeiten — fände genau die Fehler, die beim Durchspielen von
Hand auffielen: ein Formular ohne Aktion, ein Link ins Leere, eine Freigabe, die für
Datenrequests nicht gilt.

### 26. Datensicherung, die geprüft ist

Vor jedem Deploy wird die Produktionsdatenbank gesichert (seit 2.4), und die letzten
vierzehn Sicherungen bleiben liegen. Es fehlt beides, was daraus eine Sicherung macht:
ein **regelmäßiger Dump per Cron** — ein Deploy ist kein Sicherungsplan — und der
**Wiederherstellungsversuch**, ohne den niemand weiß, ob die Dateien etwas taugen.

Die Produktionsdatenbank ist das wertvollste Artefakt des Projekts: Sie enthält
Generationen von Spielzeit, die sich nicht nachbauen lassen.

### 27. Impressum, Datenschutz und Nutzungsbedingungen

Beide Seiten stehen in `noAuthURLs` und sind **eine Zeile lang**. Vor dem ersten fremden
Nutzer müssen sie Inhalt haben: Wer betreibt das, was wird gespeichert, was passiert mit
E-Mail-Adressen und Anmeldeprotokollen. Dazu Spielregeln, in denen steht, was verboten
ist — ein Verbot von Mehrfachaccounts setzt voraus, dass es irgendwo geschrieben steht.

### 28. Kontolöschung als Anonymisierung

Verlangt jemand die Löschung seiner Daten, kann die Welt seine Dynastie nicht einfach
vergessen: An ihr hängen Gebäude, Verträge, Ämter, Chronikeinträge und die Vorfahren
anderer Spieler. Der gangbare Weg ist **anonymisieren statt löschen** —
personenbezogene Daten entfernen (Nickname, E-Mail, Anmeldeprotokoll), die Spielfigur als
namenloses Haus in der Geschichte stehen lassen, den Besitz an die Stadt geben.

Das berührt die Chronik aus 4.7d unmittelbar: Sie hält Namen fest, und zwar dauerhaft.
Weil dort Kennungen und keine Namen gespeichert sind, genügt es, den Charakternamen zu
ändern — die Chronik zeigt dann „jemand", ohne dass ein Eintrag verschwindet.
