# Offene Punkte

Alles, was noch entschieden oder entworfen werden muss, mit dem Zeitpunkt, zu dem es
spätestens fallen muss. Entschiedenes steht in `KONZEPT.md`, der Weg dorthin in
`UMBAU.md`.

| #   | Punkt                                                             | Fällig vor                  | Art          |
| --- | ----------------------------------------------------------------- | --------------------------- | ------------ |
| 4   | Folgen ungedeckter Bedürfnisse                                    | 4.6                         | Entscheidung |
| 5   | Krankheiten: Ursachen, Verlauf, Heilung                           | 4.6                         | Entwurf      |
| 6   | Kämpfe und Verletzungen                                           | 4.6                         | Entwurf      |
| 17  | Fertigkeitenkatalog und Wirkung je Stufe                          | 4.5a                        | Entwurf      |
| 18  | Lehre: Grenzen und wer lehren darf                                | 4.5a                        | Entscheidung |
| 19  | Stadtwache: Amt, Anstellung oder beides                           | 4.7                         | Entscheidung |
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

Erledigt und deshalb aus der Liste gefallen: **Zeitskala** (1 Tick = 1 Stunde, 48 Ticks =
1 Spieljahr), **URL-Struktur** (Unterpfad mit `paths.base`, wie bei Festival) und mit
Phase 4.1 das **Tick-Nachholen** — verpasste Ticks werden übersprungen, die Weltuhr
springt trotzdem vor, und niemand bekommt etwas für die Ausfallzeit. Alles drei steht in
`KONZEPT.md` beziehungsweise `UMBAU.md`.

## Vor Phase 4

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

NPCs sind indirekt anweisbar und handeln sonst selbst. Auszuarbeiten, was „selbst“
heißt: Wie suchen sie Arbeit, wann heiraten sie, wie wählen sie ihren Einkauf, wann
renovieren sie, wann geben sie auf? Muss durch dieselbe Logik laufen wie
Spielerhandlungen, ist aber eigener Entwurfsaufwand.

**Das Woher steht inzwischen fest:** aus der **Persönlichkeit** (siehe `KONZEPT.md`,
Abschnitt 8). Sechs Achsen bei der Geburt, jede Entscheidung eine gewichtete Summe daraus
— statt einer Regel je Lage.

Offen bleibt damit nicht mehr das Prinzip, sondern die Rechnung: **welche Achse mit
welchem Gewicht** in welche Entscheidung eingeht, und was ein NPC überhaupt zur Auswahl
hat. „Arbeitet er heute?" ist eine Schwelle auf Fleiß; „welchen Lohn zahlt er?" eine auf
Gier; „stellt er sich zur Wahl?" eine auf Ehrgeiz. Jede dieser Schwellen ist eine
Balancing-Zahl, und sie fallen mit den Handlungen, zu denen sie gehören — also verteilt
über 4.6 und 4.7, nicht in einem Zug.

Ein Punkt, der dabei leicht untergeht: NPCs handeln **nicht jeden Tick**. Ein Durchlauf
über alle Einwohner je Stunde wird teuer, sobald die Stadt wächst. Wie oft ein NPC
tatsächlich zum Zug kommt — jeden Tick, einmal am Spieltag, gestaffelt über die
Bevölkerung — gehört zu dieser Frage dazu und hat mehr Einfluss auf die Serverlast als
alles andere in Phase 4.

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

## Fertigkeiten

### 17. Katalog und Wirkung

Welche Fertigkeiten gibt es? Naheliegend sind die Handwerke (Schmied, Zimmerer, Bauer,
Weber), dazu Handel, Heilkunst, Kämpfen und Redekunst. Zu entwerfen ist weniger die
Liste als die **Wirkung**: Was genau tut eine Stufe? Mehr Ausstoß je Aktionspunkt,
bessere Qualität, geringerer Materialverbrauch, höherer Lohn — jede Antwort erzeugt
andere Anreize, und mehrere gleichzeitig machen die Zahlen unlesbar.

Dazu die Kurve selbst: Wie viel Übung kostet eine Stufe, wie viele Stufen gibt es, und
wie viele Leben braucht die höchste? Bei 48 Aktionspunkten am Tag und einem Leben von
rund siebzig Spieljahren ist das nachrechenbar — und sollte nachgerechnet werden, bevor
die erste Zahl im Code steht.

Ein Sonderfall wartet am Anfang: Solange niemand lehren kann, beginnt **jeder** bei null.
Die erste Generation einer Welt hat keine Meister, bei denen sie lernen könnte.

### 18. Lehre: Grenzen und Berechtigung

Entschieden ist, dass Können nur durch Lehre über den Tod hinauskommt. Offen ist das
Wie: Wie weit bleibt der Schüler hinter dem Meister zurück, und ist das eine feste
Differenz oder eine Obergrenze? Darf nur der eigene Nachwuchs lernen, oder auch
Angestellte und Fremde gegen Geld — Letzteres wäre eine Zunft und ein eigener
Wirtschaftszweig. Und kann ein Schüler mehrere Meister haben?

Am Rand hängt daran die **Schule** als öffentliches Gebäude (Punkt 12): Wenn die Stadt
Grundbildung stellt, ist das die Antwort auf den Sonderfall aus Punkt 17 — und eine
politische Ausgabe mit sichtbarem Nutzen.

## Vor der Politik

### 19. Stadtwache

Ist die Wache ein **Amt** (gewählt, aus der Stadtkasse bezahlt, einer), eine
**Anstellung** (mehrere, vom Amtsinhaber eingestellt) oder beides — ein Hauptmann mit
Leuten? Davon hängt ab, ob sie in `office` gehört oder in `employment`, und ob ihre
Stärke eine politische Entscheidung ist oder das Ergebnis eines Arbeitsmarkts.

Berührt Punkt 12 (Katalog öffentlicher Gebäude: braucht die Wache ein Wachhaus?) und
Punkt 6 (wogegen genau schützt sie).

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
