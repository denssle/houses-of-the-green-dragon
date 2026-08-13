# Offene Punkte

Alles, was noch entschieden oder entworfen werden muss, mit dem Zeitpunkt, zu dem es
spätestens fallen muss. Entschiedenes steht in `KONZEPT.md`, der Weg dorthin in
`UMBAU.md`.

| #   | Punkt                                                             | Fällig vor                  | Art          |
| --- | ----------------------------------------------------------------- | --------------------------- | ------------ |
| 5   | Krankheiten: Ursachen, Verlauf, Heilung                           | Heiltrank (4.6c)            | Entwurf      |
| 6   | Kämpfe und Verletzungen                                           | Waffen und Gift (4.6c)      | Entwurf      |
| 7   | NPC-Gewichte für Mut, Ehrgeiz und Verträglichkeit                 | 4.7 / Punkt 6               | Entwurf      |
| 9   | Wahlalter                                                         | 4.7                         | Entscheidung |
| 10  | Amtsnachfolge beim Tod des Amtsinhabers                           | 4.7                         | Entscheidung |
| 11  | Steuerarten                                                       | 4.7                         | Entscheidung |
| 12  | Katalog öffentlicher Gebäude, davon welche ein Grundstück belegen | 4.7                         | Entwurf      |
| 19  | Stadtwache: Amt, Anstellung oder beides                           | 4.7                         | Entscheidung |
| 13  | Verfahren zur Erschließung neuen Baulands                         | 4.9                         | Entscheidung |
| 14  | Startbedingungen für neue Spieler                                 | erster öffentlicher Betrieb | Entscheidung |
| 15  | Weltinhalte: Berufe, Waren und Rezepte                            | laufend                     | Entwurf      |
| 16  | Balancing im engeren Sinn                                         | laufend                     | laufend      |

Erledigt und deshalb aus der Liste gefallen: **Zeitskala** (1 Tick = 1 Stunde, 50 Ticks =
1 Spieljahr — die krumme Zahl mit Absicht, siehe 4.5b), **URL-Struktur** (Unterpfad mit
`paths.base`, wie bei Festival), mit Phase 4.5a der **Fertigkeitenkatalog** samt
Übungskurve und den Grenzen der Lehre, mit Phase 4.6c der **Pachtvertrag im Erbfall**
(er fällt an die Stadt zurück), mit Phase 4.6a die **Folgen ungedeckter
Bedürfnisse** (gestaffelt: erst Leistung, dann Leben), und mit Phase 4.1 das
**Tick-Nachholen** —
verpasste Ticks werden übersprungen, die Weltuhr springt trotzdem vor, und niemand
bekommt etwas für die Ausfallzeit. Alles steht in `KONZEPT.md` beziehungsweise
`UMBAU.md`.

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

### 9. Wahlalter

Ab welchem Alter stimmt ein Charakter ab? Ohne Untergrenze gewinnt, wer die meisten
Kleinkinder hat.

### 10. Amtsnachfolge

Stirbt der Amtsinhaber: Neuwahl, Nachrücken des Zweitplatzierten, oder erbt der Erbe das
Amt? Letzteres wäre mittelalterlich stimmig und politisch heikel — beides spricht dafür,
es bewusst zu entscheiden.

### 11. Steuerarten

Die Stadtkasse ist als Hebel beschrieben, ihre Einnahmeseite nicht. Kopfsteuer,
Grundsteuer, Handelssteuer? Jede erzeugt andere Anreize: Kopfsteuer trifft kinderreiche
Häuser, Grundsteuer die Besitzenden, Handelssteuer die Betriebe.

### 12. Katalog öffentlicher Gebäude

**Vorläufig entschieden (Phase 4.5):** Öffentliche Gebäude **verfallen nicht**. Ohne
diese Ausnahme wäre die städtische Schmiede nach zwanzig Spieljahren eine Ruine — und mit
ihr der einzige Weg, auf dem ein Neuling Geld verdienen kann. Sobald die Stadtkasse eine
Amtshandlung „instandhalten" kennt (4.7), gehört die Ausnahme wieder weg: Ein Rathaus,
das niemand pflegt, soll verfallen dürfen, und ein Bürgermeister, der es verfallen lässt,
soll abgewählt werden.

Welche gibt es, was kosten sie, was bewirken sie genau — und welche belegen ein
Grundstück? Schule und Brunnen konkurrieren dann mit Wohnhäusern um knappes Bauland
(eine echte politische Abwägung), eine Stadtmauer umschließt dagegen die ganze Region.

### 13. Erschließung neuen Baulands

Vorgeschlagen ist eine Amtshandlung, die aus der Stadtkasse bezahlt wird. Offen: Wie
viele Grundstücke entstehen dabei, wer darf dort bauen (Versteigerung, Vergabe durch das
Amt, freier Verkauf), und braucht es dafür eine angrenzende Umlandfläche, die dadurch
verschwindet?

## Vor dem ersten öffentlichen Betrieb

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

### 19. Stadtwache

Ist die Wache ein **Amt** (gewählt, aus der Stadtkasse bezahlt, einer), eine
**Anstellung** (mehrere, vom Amtsinhaber eingestellt) oder beides — ein Hauptmann mit
Leuten? Davon hängt ab, ob sie in `office` gehört oder in `employment`, und ob ihre
Stärke eine politische Entscheidung ist oder das Ergebnis eines Arbeitsmarkts.

Berührt Punkt 12 (Katalog öffentlicher Gebäude: braucht die Wache ein Wachhaus?) und
Punkt 6 (wogegen genau schützt sie).

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

### 16. Balancing

Wie stark wirkt was, wie schnell verfällt Zuneigung, was kostet welche Handlung, wie viel
wirft ein Betrieb ab. Bewusst am laufenden Spiel justiert, nicht vorab am Reißbrett.
Voraussetzung dafür ist, dass die Werte an einer Stelle stehen (Templates und Konstanten
im Code) und nicht über die Logik verstreut sind.
