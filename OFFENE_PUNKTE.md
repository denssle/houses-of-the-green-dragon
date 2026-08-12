# Offene Punkte

Alles, was noch entschieden oder entworfen werden muss, mit dem Zeitpunkt, zu dem es
spätestens fallen muss. Entschiedenes steht in `KONZEPT.md`, der Weg dorthin in
`UMBAU.md`.

| #   | Punkt                                                             | Fällig vor                  | Art          |
| --- | ----------------------------------------------------------------- | --------------------------- | ------------ |
| 3   | Tick-Nachholen nach Serverausfall: nachrechnen oder überspringen  | 4.1                         | Entscheidung |
| 4   | Folgen ungedeckter Bedürfnisse                                    | 4.6                         | Entscheidung |
| 5   | Krankheiten: Ursachen, Verlauf, Heilung                           | 4.6                         | Entwurf      |
| 6   | Kämpfe und Verletzungen                                           | 4.6                         | Entwurf      |
| 7   | Verhaltensregeln der NPCs                                         | 4.4 / 4.6                   | Entwurf      |
| 8   | Pachtvertrag beim Tod des Pächters                                | 4.6                         | Entscheidung |
| 9   | Wahlalter                                                         | 4.7                         | Entscheidung |
| 10  | Amtsnachfolge beim Tod des Amtsinhabers                           | 4.7                         | Entscheidung |
| 11  | Steuerarten                                                       | 4.7                         | Entscheidung |
| 12  | Katalog öffentlicher Gebäude, davon welche ein Grundstück belegen | 4.7                         | Entwurf      |
| 13  | Verfahren zur Erschließung neuen Baulands                         | 4.9                         | Entscheidung |
| 14  | Startbedingungen für neue Spieler                                 | erster öffentlicher Betrieb | Entscheidung |
| 15  | Weltinhalte: Orts-, Waren- und Gebäudekatalog                     | laufend                     | Entwurf      |
| 16  | Balancing im engeren Sinn                                         | laufend                     | laufend      |

Nichts steht mehr vor Phase 1: **Zeitskala** (1 Tick = 1 Stunde, 48 Ticks = 1 Spieljahr)
und **URL-Struktur** (Unterpfad mit `paths.base`, wie bei Festival) sind entschieden und
in `KONZEPT.md` beziehungsweise `UMBAU.md` festgehalten. Die Umsetzung kann beginnen.

## Vor Phase 4

### 3. Tick-Nachholen

War der Server eine Weile aus, fehlen Ticks. Werden sie **nachgerechnet** (die Welt holt
auf: NPCs handeln, Ereignisse treten ein, Charaktere altern) oder **übersprungen** (die
Zeit springt, nichts passiert dazwischen)? Nachrechnen ist stimmiger und teurer,
Überspringen billiger und ungerecht gegenüber dem, der gerade produzierte. In jedem Fall
braucht es eine Deckelung, damit ein dreitägiger Ausfall nicht tausende Ticks in einer
Schleife abarbeitet.

### 4. Folgen ungedeckter Bedürfnisse

Hunger, Kälte, kein Dach über dem Kopf — was genau passiert? Weniger Aktionspunkte,
Krankheit, am Ende Tod? Bei Permadeath ist das eine der folgenreichsten Regeln des
Spiels, und sie hängt eng an Punkt 1: Wie schnell etwas eskaliert, ergibt nur im
Verhältnis zur Tick-Länge Sinn.

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

### 7. Verhaltensregeln der NPCs

NPCs sind indirekt anweisbar und handeln sonst selbst. Auszuarbeiten, was „selbst“
heißt: Wie suchen sie Arbeit, wann heiraten sie, wie wählen sie ihren Einkauf, wann
renovieren sie, wann geben sie auf? Muss durch dieselbe Logik laufen wie
Spielerhandlungen, ist aber eigener Entwurfsaufwand.

### 8. Pachtvertrag im Erbfall

Geht eine `lease` auf den Erben über, fällt sie an die Stadt zurück, oder wird sie neu
ausgeschrieben? Betrifft auch: Was passiert mit der Ernte oder dem Betrieb auf der
Fläche?

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

**Vorläufig entschieden (Phase 3.3):** Die Startstadt hat eine **städtische Schmiede**, in
der jeder arbeiten kann. Damit ist der Grundweg wenigstens begehbar — 44 Schichten
reichen für ein Grundstück und ein Wohnhaus. Das ersetzt die Antwort nicht: Sobald es
Anstellungsverhältnisse (4.6) und eine echte Bevölkerungsdynamik gibt, muss geklärt sein,
ob dieser Betrieb bleibt, wem er gehört und was ein Neuling sonst noch mitbekommt.

## Laufend

### 15. Weltinhalte

Ortsnamen und Karte der Startregion, Warenkatalog mit Produktionsketten,
Gebäudekatalog mit Ausbaustufen. Kein Entscheidungs-, sondern Fleißaufwand — wächst mit
den Phasen 4.5 und 4.6.

### 16. Balancing

Wie stark wirkt was, wie schnell verfällt Zuneigung, was kostet welche Handlung, wie viel
wirft ein Betrieb ab. Bewusst am laufenden Spiel justiert, nicht vorab am Reißbrett.
Voraussetzung dafür ist, dass die Werte an einer Stelle stehen (Templates und Konstanten
im Code) und nicht über die Logik verstreut sind.
