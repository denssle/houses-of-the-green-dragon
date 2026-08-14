# Konzept

Was das Spiel werden soll — festgehalten, damit die Architekturentscheidungen in
`ENTWICKLUNG.md` einen Zweck haben, auf den sie zulaufen.

## Kernidee

**Man spielt eine Dynastie, nicht einen Charakter.** Gespielt wird zwar immer ein
einzelner Charakter, aber der ist sterblich. Stirbt er, übernimmt eines seiner Kinder.
Wer zu Lebzeiten keine Nachkommen bekommen hat, hat ein Problem — die Fortpflanzung ist
kein Beiwerk, sondern die zentrale Überlebensmechanik.

Die übrigen Kinder, die nicht Spielercharakter werden, bleiben als **NPCs** in der Welt:
als Arbeitskräfte, Kundschaft und — sobald es Politik gibt — als Wähler.

Angesiedelt im Mittelalter. Der Spieler muss sich um das Elementare kümmern: ein Dach
über dem Kopf, Arbeit oder ein eigener Betrieb, Nahrung, Kleidung.

## Das Ziel: eine Welt, die niemanden braucht

**Am Ende sollen NPCs alles tun, was Spieler tun.** Nicht als Kulisse, die auf Eingaben
wartet, sondern als Bewohner: Sie arbeiten, kaufen, bauen, heiraten, wählen, streiten und
sterben — und wenn wochenlang niemand hereinschaut, ist die Stadt danach eine andere.
Ein Spieler tritt in eine laufende Welt ein und verändert sie; er hält sie nicht am
Leben.

Das ist der Maßstab, an dem jeder Schritt zu messen ist: **Funktioniert das auch ohne
Spieler?** Eine Ware, die nur ein Spieler kauft, ist kein Markt. Ein Betrieb, der nur
einem Spieler gehören kann, ist kein Handwerk. Ein Amt, für das sich nur Spieler
bewerben, ist keine Politik.

Der Weg dorthin ist eine Reihe von Schritten, und jeder einzelne ist daran zu erkennen,
dass er eine Handlung von der Spielerseite auf die NPC-Seite holt. Erledigt sind bisher:
essen und Nahrung kaufen, eine Stelle antreten und arbeiten, unter ein Dach ziehen,
werben und heiraten, wählen und kandidieren, bei Versteigerungen bieten, als
Bürgermeister öffentliche Bauten herrichten — und seit 4.12 kaufen sie auch, was über
das Nötigste hinausgeht.

**Wonach ein NPC entscheidet: einer Bedürfnishierarchie.** Erst das Überleben (essen),
dann Sicherheit (ein Dach, eine Anstellung, eine Rücklage), dann Zugehörigkeit (werben,
heiraten), dann Ansehen (wie man dasteht — Kleidung), und ganz oben die Entfaltung: ein
Grundstück kaufen, eine Werkstatt bauen, etwas herstellen und verkaufen.

Diese Ordnung ist nicht Beiwerk, sondern der Kern der Simulation. Sie beantwortet für
jede neue Handlung die Frage, wann ein NPC sie tut — und sie sorgt nebenbei fürs
Gleichgewicht: Ein Betrieb entsteht nur dort, wo jemand alles Darunterliegende gedeckt
hat und obendrein die Neigung dazu mitbringt. Innerhalb einer Stufe entscheidet die
Persönlichkeit, ob und wie früh — nicht, was zuerst kommt.

Was noch fehlt: NPCs stellen niemanden ein, bauen ihre Betriebe nicht aus und errichten
keine Wohnhäuser für ihre Familien — obwohl gerade Wohnraum der Engpass der Bevölkerung
ist.

**Wer lange nicht hereinschaut, dessen Charakter lebt weiter — von selbst.** Bleibt ein
Spieler über eine gewisse Zeit weg, übernimmt dieselbe Bedürfnishierarchie, die die NPCs
steuert: Der Charakter kauft Brot, geht arbeiten, hält sein Haus instand. Nicht besonders
klug und nicht besonders ehrgeizig, aber am Leben.

Das folgt zwingend aus allem anderen. Eine Welt, in der die Zeit weiterläuft, kennt keinen
Pausenknopf: Wer zwei Wochen wegbleibt, verhungerte sonst, während sein Haus verfällt —
und käme zu einer Ruine und einem toten Charakter zurück. Das bestrafte Abwesenheit
härter als jeden Fehler, den man im Spiel machen kann, und widerspräche der Zusage, dass
Aktionspunkte sich ansammeln, damit niemand im Minutentakt klicken muss.

Es hat aber auch eine Seite, die nicht bequem ist: Ein verwaister Betrieb produziert
weiter, ein verwaistes Haus wird instand gehalten, und ein Abwesender bleibt Konkurrenz um
Bauland und Arbeit. Das ist gewollt — die Welt soll niemanden aussortieren, weil er ein
paar Tage anderes zu tun hatte. Der Selbsterhalt reicht dabei bewusst nur bis zur
Selbsterhaltung: Er hält, was da ist, und baut nichts auf. Wer vorankommen will, kommt
wieder.

Ab wann jemand als abwesend gilt, wie weit die Übernahme geht und was beim Erbfall in
Abwesenheit geschieht — der Charakter stirbt ja weiterhin —, ist noch nicht entschieden
(offener Punkt 40).

## Die Säulen

### 1. Lebenszyklus und Erbfolge

Charaktere altern, zeugen Kinder und sterben. Beim Tod des Spielercharakters geht die
Kontrolle auf einen Erben über; die Dynastie besteht fort, der einzelne Charakter nicht.
Titel, Besitz und Ansehen müssen dabei einer klaren Erbregel folgen.

Damit wird Zeit zur wichtigsten Ressource: Was man in einem Leben nicht aufgebaut hat,
muss der Erbe von vorn beginnen. Umgekehrt ist ein gut vorbereiteter Übergang der
eigentliche Fortschritt über Generationen hinweg.

**Die Erbfolge.** Der Spieler **wählt seinen Erben** unter den eigenen Kindern aus — der
Übergang ist eine Entscheidung, keine Regel des Zufalls. Männer und Frauen sind dabei
vollständig gleichberechtigt: Es gibt kein Geschlecht, das erbt, wählt, arbeitet oder ein
Amt bekleidet, und eines, das es nicht darf. Das ist historisch unsauber und spielerisch
richtig.

Die **übrigen Kinder erhalten einen Anteil nach Gesetz** — womit das Erbrecht selbst zu
einem politischen Gegenstand wird: Wie viel dem gewählten Erben bleibt und wie viel unter
den Geschwistern aufgeteilt wird, ist eine Stellschraube, die der Rat einer Stadt ändern
kann. Ein Haus, das über Generationen Vermögen bündeln will, hat damit ein Interesse an
der Gesetzgebung.

Geteilt wird dabei nur das **Bargeld**; Grundstücke und Gebäude gehen ungeteilt an den
Erben. Ein Viertel eines Hauses ist nichts, was man bewohnen, vermieten oder renovieren
kann, und Grundbesitz zersplitterte über Generationen zu Bruchteilen, die niemand mehr
zusammenbekäme. Der Preis: Wer viel Boden und wenig Münzen hinterlässt, vererbt seinen
übrigen Kindern wenig — was der Politik aus Abschnitt 7 einen Streitgegenstand gibt.

**Benannt wird zu Lebzeiten, nicht im Sterben.** Der Erbe steht fest, bevor er gebraucht
wird; ohne Benennung erbt das älteste volljährige Kind. Anders ginge es nicht: Die Welt
läuft weiter, auch wenn der Spieler gerade nicht da ist, und ein Haus, das bis zum
nächsten Login stillsteht, wäre ein Loch in dieser Welt. Gibt es nur minderjährige
Kinder, erbt das älteste von ihnen — ein Haus, das an seinen Kindern vorbei erlischt,
bestrafte den Spieler für einen Zeitpunkt, den er nicht wählt.

**Gestorben wird am Alter, ohne Höchstalter.** Das Risiko beginnt in den Vierzigern und
verdoppelt sich etwa alle acht Jahre; die Hälfte kommt über die siebzig, einzelne werden
neunzig. Kein Alter, ab dem der Tod sicher ist — das machte aus dem Lebensende einen
Schalter statt eines Schicksals, und der Greis, der alle überlebt, ist eine Geschichte.
Krankheit, Hunger und Kälte werden dieses Risiko später erhöhen, nicht ersetzen.

**Ein Kind bekommt einen Namen von seinen Eltern.** Wer geboren wird, heißt zunächst, was
die Welt ihm gibt — die Geburt geschieht auch dann, wenn der Spieler gerade nicht da ist,
und ein namenloses Kind wäre ein Loch in der Chronik. Aber der Name ist nicht endgültig:
Solange das Kind klein ist, darf der Spieler ihn ändern.

Dieselbe Bauart wie bei der Benennung des Erben, und aus demselben Grund. Die Welt wartet
auf niemanden, also entscheidet sie vorläufig; wer da ist, entscheidet richtig. Was daran
hängt, ist nicht Mechanik, sondern Bindung: Ein Haus, dessen Kinder man selbst benannt hat,
ist ein anderes als eine Liste erzeugter Vornamen. Und die Chronik, die über Generationen
mitschreibt, erzählt dann von Namen, die jemand gewählt hat.

Mit der Volljährigkeit steht der Name fest. Ein Erwachsener, der umbenannt werden kann, ist
für alle anderen niemand, auf den man sich beziehen könnte — und die Chronik hielte
Ereignisse fest, deren Handelnder später jemand anderes heißt.

**Wer heiraten darf, entscheidet nicht das Geschlecht.** Zwei Erwachsene, die einander
zugetan sind, können heiraten — gleich welchen Geschlechts. Das ist, wie die
Gleichberechtigung beim Erben, historisch unsauber und spielerisch richtig: Ein Spiel, das
seinen Spielern vorschreibt, wen ihre Figur lieben darf, gewinnt dadurch nichts als eine
Ausrede. Die Welt hat Not, Verfall und Sterblichkeit genug; sie braucht diese Härte nicht
dazu.

Für die Dynastie hat das eine Folge, und die ist der Grund, warum das Nächste
dazugehört: Aus einer Ehe zweier Männer oder zweier Frauen gehen keine leiblichen Kinder
hervor. Ohne einen zweiten Weg zum Erben wäre die Erlaubnis eine Falle — man dürfte
heiraten, wen man will, und verlöre dafür sein Haus.

**Eine Heirat verschiebt Vermögen.** Wer heiratet, bringt eine **Mitgift** ein — eine
Summe, die das Haus der Braut oder des Bräutigams mitgibt und die dem neuen Paar gehört.
Damit ist die Ehe zwischen zwei Spielerhäusern das, was sie historisch war: eine
Verhandlung. Man wirbt nicht nur um eine Person, sondern einigt sich mit einem Haus.

Das gibt der Partnerwahl eine zweite Ebene neben Zuneigung und Persönlichkeit — ein
verarmtes Haus mit gutem Namen und ein reiches ohne Ansehen haben einander etwas zu bieten.
Und es gibt kinderreichen Häusern eine Last, die sie bisher nicht haben: Wer sechs Kinder
verheiratet, zahlt sechsmal.

**Adoption ist der zweite Weg zum Erben.** Ein Haus kann ein Kind aufnehmen, das nicht von
ihm abstammt: Waisen, deren Eltern gestorben sind, oder Kinder aus einem Haus mit mehr
Nachwuchs, als es braucht. Das angenommene Kind gehört fortan zum Haus, erbt wie ein
leibliches und kann zum Erben benannt werden.

Damit bekommen drei Dinge eine Antwort, die das Spiel bisher schuldig blieb. Ein Haus ohne
leibliche Kinder — durch Unfruchtbarkeit, durch den frühen Tod des Partners oder durch die
Wahl des Partners — hat einen Weg weiter. Ein Kind, dessen Eltern beide starben, hat einen
Ort. Und ein kinderreiches Haus hat etwas, das ein anderes dringend braucht, was zwischen
zwei Spielern eine Verhandlung ist und keine Zahl. Was Adoption kostet und wer zustimmen
muss, ist noch nicht entschieden (offener Punkt 38).

**Wer verwitwet, darf wieder heiraten.** Der Tod des Partners beendet die Ehe, nicht das
Leben — und in einer Welt, in der die Hälfte die siebzig nicht erreicht, ist Verwitwung
der Normalfall und nicht die Ausnahme. Wer allein zurückbleibt, wirbt neu und heiratet
neu. Die Kinder aus der ersten Ehe bleiben, was sie sind: Erben ihres Hauses.

Solange die Ehe besteht, gibt es allerdings nur die eine. Nicht aus Sitte, sondern weil
alles, was an der Ehe hängt — Zuneigung, Wohnung, Erbfolge, Zugehörigkeit der Kinder —,
sich auf genau einen Partner beziehen muss, um eindeutig zu bleiben.

**Ein Dach für zwei, aber getrennte Truhen.** Wer heiratet, führt einen Haushalt: Einer
zieht zum anderen, und von da an wohnen beide dort. Der Besitz bleibt getrennt — das Haus
gehört weiter dem, dem es gehörte, und geht später an dessen Erben. Es gibt keinen
gemeinsamen Geldbeutel.

Damit ist der Gewinn einer Ehe kein Vermögensübertrag, sondern etwas Handfesteres: ein Dach
statt zweier, zwei Einkommen in einem Haushalt, Kinder als Arbeitskraft und Erben — und die
Mitgift als der eine direkte Transfer, über den verhandelt wird. Eine Ehe, die Vermögen
verschmelzen ließe, wäre für zwei Spielerhäuser auch das falsche Bild: Sie sollen sich
verbinden, nicht ineinander aufgehen.

**Die Witwe erbt nicht — sie wird versorgt.** Der Besitz geht an die Kinder, das war und
bleibt die Regel; aber der überlebende Ehepartner darf davon nicht auf der Straße stehen.
Er bekommt einen **Anteil am Bargeld vorweg** — vor der Teilung unter den Kindern, damit
sein Auskommen nicht davon abhängt, wie viele Geschwister sich den Rest teilen — und er
**bleibt wohnen**, auch wenn das Haus nun dem Kind gehört. Das Wohnrecht endet mit seinem
Tod oder einer neuen Ehe, nicht mit dem Erbfall.

Ohne das wäre die Wiederheirat, die es jetzt gibt, ein Hohn: Wer seinen Partner verliert,
verlöre mit ihm sein Dach — und zwar an das eigene Kind. Der Erbe bekommt damit ein Haus
mit einer Bewohnerin darin, die er nicht hinauswerfen kann. Das ist keine Belastung des
Erbes, sondern seine ehrlichere Beschreibung: Ein Haus ist selten leer.

**Und die Ehe endet mit dem Tod.** Das klingt selbstverständlich und war es nicht: Wer
verwitwet, ist ab dem Erbfall wieder ungebunden — sonst könnte er weder neu heiraten noch
aufhören, Kinder eines Toten zu erwarten.

**Ein Kind, das erbt, braucht jemanden, der für es handelt.** Erbt ein Minderjähriger —
und das kommt vor, weil ohne Benennung das älteste Kind erbt, auch wenn es sechs ist —,
dann gehört ihm alles, aber er kann fast nichts damit anfangen: Ein Betrieb, den er nicht
führen darf, verfällt weiter und wird trotzdem besteuert.

**Ein Minderjähriger darf anweisen, aber nicht Hand anlegen.** Das ist die Grenze, und sie
ist dieselbe, die auch für Abwesende und für Reisende gilt: Wer nicht selbst am Amboss
stehen kann, kann trotzdem verfügen. Das Kind bleibt Eigentümer, stellt einen Meister an,
setzt Preise, verkauft, benennt seinerseits einen Erben — und bezahlt aus dem Erbe, was es
nicht selbst tun kann. Das kostet mehr, als der Vater bezahlt hätte; genau das ist der
Preis eines frühen Todes. Eine Vormundschaft mit eigenen Regeln braucht es dafür nicht.

Beim Nachsehen zeigte sich, dass die Frage andersherum steht als gedacht: Ein Kind kann
heute schon fast alles, **auch arbeiten**. Gesperrt sind nur Heirat, Wahl und eine feste
Anstellung. Wo genau Kinderarbeit aufhört, entscheidet sich deshalb dort, wo sie erwünscht
ist — bei der Lehre im eigenen Betrieb (Abschnitt 10), die ein Kind ausdrücklich in die
Werkstatt schickt. Beides gehört in denselben Schritt, sonst wird zweimal an derselben
Altersgrenze gedreht.

**Vermacht wird über den Erben hinaus.** Neben der Benennung des Erben soll ein
**Testament** stehen: einzelne Beträge an einzelne Personen, an die Zunft, an eine Kirche.
Das ist die Gelegenheit, Dinge zu regeln, die keine Erbregel trifft — den treuen Gesellen
zu bedenken, das Kind zu übergehen, mit dem man sich zerstritten hat.

Und daran hängt die **Stiftung**: Wer ein öffentliches Werk stiftet — ein Spital, einen
Brunnen —, kauft damit kein Gebäude, sondern Ansehen, das seinen Tod überdauert (Abschnitt
15). Für ein altes, reiches Haus ist das die einzige Ausgabe, die sich noch lohnt, und für
die Stadt eine Einnahme, die keine Steuer ist.

**Wer ohne Erben stirbt, dessen Besitz fällt an die öffentliche Hand.** Nicht ins Nichts
und nicht an einen zufälligen Nachbarn: Häuser, Grundstücke und Vermögen gehen an die
Stadt, die sie neu vergeben oder verkaufen kann. Das schließt einen Kreis, den knappes
Bauland sonst offen ließe — die Stadt bekommt zurück, was niemandem mehr gehört, und
finanziert daraus Öffentliches.

**Die Bevölkerung trägt sich selbst.** NPCs sind keine Kulisse: Sie altern, heiraten,
bekommen Kinder und sterben wie Spielercharaktere. Dazu kommt der stetige Zufluss aus den
Häusern der Spieler — wer Kinder bekommt, bekommt in aller Regel mehr, als er zum Erben
braucht, und die übrigen wandern in den **NPC-Pool**. Aus Spielersicht sind das
Geschwister, Vettern und Nichten; aus Sicht der Stadt sind es Arbeitskräfte, Kundschaft
und Wähler. Die Einwohnerzahl ist damit ein Ergebnis des Spiels, keine gesetzte Zahl.

### 2. Die Welt: Karte, Städte und Umland

Das Spiel spielt nicht in _einer_ Stadt, sondern in einer **Landschaft**. Eine Stadt hat
ein Umland, und irgendwo dahinter liegt die nächste.

Das folgt zwingend aus der Knappheit des Baulands: Wenn alle Grundstücke vergeben sind,
gibt es zwei Auswege — **neues Bauland erschließen** (die Stadt wächst in ihr Umland
hinein) oder, im Extremfall, **eine neue Stadt gründen**. Beides sind große, teure
Vorhaben und damit natürliche Fernziele für etablierte Dynastien.

Die Karte trägt außerdem, was die Wirtschaft braucht: **Rohstoffflächen** liegen im
Umland, nicht in der Stadt. Wald, Steinbruch, Acker, Erzgrube — dort entsteht, was in
den Handwerkshäusern verarbeitet wird.

**Die Karte ist ein Raster aus Sechsecken.** Jede Kachel hat eine Lage und eine Art;
Entfernung ist der Abstand darauf und muss nicht für jedes Paar von Orten einzeln
festgelegt werden. Das Sechseck statt des Quadrats, weil alle sechs Nachbarn gleich weit
weg liegen — beim Quadrat wäre die Diagonale eine Sonderregel, und Sonderregeln in der
Geometrie schlagen auf jede Rechnung durch, die darauf aufsetzt.

**Die Art der Kachel bestimmt, was sie hergibt.** Gebirge, Wald, Grasland, Sumpf,
Gewässer — Erz und Stein kommen aus dem Gebirge, Holz aus dem Wald, Getreide vom
Grasland. Damit ist die Landschaft kein Hintergrundbild, sondern die Ursache dafür, dass
eine Ware hier billig und dort teuer ist: Eine Stadt zwischen Wald und Gebirge baut
anders als eine am Wasser, und der Handel zwischen beiden hat einen Grund, der nicht in
einer Tabelle steht, sondern auf der Karte.

Welche Ware genau an welcher Kachelart hängt, ist Teil des Warenkatalogs und noch nicht
entschieden (offener Punkt 15) — beim Sumpf ist nicht einmal klar, ob er etwas hergibt
oder vor allem im Weg liegt. Beides wäre brauchbar: Eine Landschaft, in der jede Kachel
etwas abwirft, ist keine Landschaft, sondern ein Vorratsschrank.

**Wer baut, nimmt der Kachel, was sie hergibt.** Das ist der eigentliche Sinn des Rasters:
Es gibt keine Obergrenze, ab der eine Kachel voll wäre — aber je mehr auf ihr steht, desto
weniger wirft sie ab. Ein Wald mit drei Häusern darin ist ein schlechterer Wald.

Daraus entsteht eine Abwägung, die jeden Bau betrifft und die niemand für einen entscheidet:
**Verdichten oder ausweichen.** Wer sein Haus dorthin stellt, wo schon Häuser stehen,
kostet die Stadt fast nichts — die Kachel gibt ohnehin kaum noch etwas her. Wer sich ins
Grüne setzt, hat es schöner und nimmt allen den Ertrag. Damit ist die Stadt kein Kreis, der
gleichmäßig wächst, sondern ein dichter Kern mit einem Umland, das man freihält, weil es
sich lohnt.

Das Bemerkenswerte daran: Es braucht keine Bauvorschrift, damit sich das einstellt. Der
Boden selbst bestraft die Zersiedelung. Eine Bauvorschrift wäre trotzdem denkbar — dann
aber als politische Verschärfung eines Anreizes, der ohnehin wirkt, und nicht als Ersatz
für ihn.

**Eine Stadt ist deshalb kein Ort mehr, sondern eine Fläche.** Wächst sie, erstreckt sie
sich über mehrere Kacheln, und was innerhalb ihrer Grenzen liegt, kann weit
auseinanderliegen. Damit wird **Transport auch innerhalb einer Stadt** zur Sache: Der
Steinmetz am Gebirgsrand und die Baustelle im Kern sind nicht mehr am selben Fleck. Was
bisher nur zwischen Städten galt — Ware braucht Zeit und kostet Weg —, gilt dann eine
Nummer kleiner auch zu Hause. Dasselbe `shipment`, dieselbe Rechnung, nur kürzere
Strecken.

**Erweitern und Gründen unterscheidet die Nachbarschaft.** Beides heißt, eine Kachel in
Besitz zu nehmen; welches von beidem es ist, sagt die Karte und nicht der Handelnde. Grenzt
die Kachel an eine bestehende Stadt, ist es eine **Erweiterung** — sie fällt an diese Stadt,
in ihre Kasse, unter ihre Gesetze und ihren Bürgermeister. Grenzt sie an keine, ist es eine
**Gründung**: ein neues Gemeinwesen mit eigener Kasse, eigener Wahl und eigenen Ämtern.

Das ist eine unscheinbare Regel mit politischer Wucht. Wer sich der Herrschaft einer Stadt
entziehen will, muss weit genug weggehen — und wer eine neue Stadt zu nah gründet, hat
lediglich das Gebiet des Nachbarn vergrößert. Umgekehrt kann eine Stadt einer entstehenden
zuvorkommen, indem sie in ihre Richtung wächst.

**Was geschieht, wenn zwei Städte zusammenwachsen?** Bei genug Wachstum berühren sich ihre
Gebiete irgendwann. Naheliegend ist eine **Verschmelzung** — eine Stadt, zwei Kassen, ein
Bürgermeister —, und ebenso naheliegend ist, dass niemand das freiwillig will, dessen Amt
dabei verschwindet. Damit hätte die Karte etwas hervorgebracht, das das Spiel bisher nicht
hat: einen Konflikt zwischen Gemeinwesen, ganz ohne Krieg. Wie er ausgeht — Abstimmung
beider Bürgerschaften, das größere Haus schluckt das kleinere, oder eine Grenze, die
einfach bestehen bleibt —, ist noch nicht entschieden (offener Punkt 31).

**Was das Raster kostet, sei gesagt.** Ein neuer Ort war vorher eine Zeile mit ein paar
Entfernungen; jetzt braucht die Welt eine Landschaft, die jemand entwirft oder ein
Verfahren erzeugt. Das ist der Preis. Bezahlt wird er dafür, dass Ausdehnung, Rohstoffe
und Nachbarschaft aus derselben Quelle stammen statt aus drei getrennten Tabellen.

Entfernung ist dabei kein Beiwerk, sondern der Preis: Was weiter weg liegt, kostet Zeit
und Transport. Genau daraus entsteht **Handel zwischen den Städten** — Waren, die hier
im Überfluss vorhanden und dort knapp sind, lohnen den Weg. Wer eine Karawane schickt,
bindet Kapital für mehrere Ticks und wettet darauf, dass der Preis am Ziel hält.

**Man ist irgendwo, und wer woanders etwas will, muss hin.** Bisher hält sich ein Charakter
in einer Stadt auf, ohne dass es etwas bedeutet — es gibt nur die eine. Sobald es zwei
gibt, ist der Aufenthaltsort die Bedingung für fast alles: Man kauft auf dem Markt, auf dem
man steht, arbeitet in einem Betrieb, den man betreten kann, und verbringt Zeit mit Leuten,
die vor einem stehen. Ein Spiel, in dem man von überall alles tun kann, hat keine Karte,
sondern eine Liste.

**Die Stadt ist die Einheit des Aufenthalts, nicht die Kachel.** Innerhalb ihrer Grenzen
bewegt man sich frei, auch wenn sie sich über mehrere Kacheln erstreckt — sonst würde aus
dem Gang zum Bäcker eine Reise, und aus dem Spiel Buchführung über Fußwege. Waren machen
den Unterschied trotzdem (siehe oben): Ein Mensch geht durch seine Stadt, ein Fuder Steine
nicht.

**Gereist wird in Zeit, nicht in Aktionspunkten.** Wer aufbricht, ist unterwegs — bis zum
Ankunfts-Tick handelt er nicht, danach steht er am Ziel. Das ist dieselbe Bauart wie beim
Warentransport und aus demselben Grund richtig: Der Preis einer Entfernung ist die Zeit,
die sie kostet, und nicht eine Zahl, die man mit ausgeruhten Punkten wegkauft. Ein
Kaufmann, der acht Ticks unterwegs ist, verpasst acht Ticks in seiner Werkstatt — das ist
die Abwägung, und sie steht von selbst da.

Die Aktionspunkte wachsen unterwegs weiter, laufen aber gegen ihren Deckel. Wer viel
reist, verliert also nicht, was er nicht ausgibt — aber wer ständig unterwegs ist, spielt
oberhalb des Deckels und verschenkt Zeit. Auch das braucht keine eigene Regel.

**Was am Aufenthalt hängt und was nicht**, ist die eigentliche Entwurfsfrage, und ein Teil
davon lässt sich schon sagen. Handgriffe brauchen Anwesenheit: arbeiten, renovieren,
bauen, ernten, jemanden besuchen, werben. Anweisungen nicht: einen Verkaufspreis setzen,
einen Lohn aushängen, seinen Erben benennen — dafür genügt, dass man Eigentümer ist.
Gewählt wird dort, wo man **wohnt**, nicht wo man gerade steht; sonst entstünde
Wahltourismus, und die Bürgerschaft wäre, wer zufällig am Wahltag in der Stadt war.

**Wer reist, ist angreifbar.** Ein Charakter unterwegs ist dasselbe Ziel wie eine Ladung
unterwegs — damit bekommt der Räuber (offener Punkt 23) etwas zu überfallen, das nicht erst
erfunden werden muss, und die Stadtwache einen Grund, Wege zu sichern. Ob es so weit kommt,
hängt am Kampf (Punkt 6); die Karte hält den Platz dafür frei.

### 3. Wirtschaft

Man arbeitet entweder für jemanden oder wird selbst Arbeitgeber. Ein eigener Betrieb
stellt Waren her, die auf dem **Markt** verkauft werden — an andere Spieler oder an NPCs.

Entscheidend: **alles Hergestellte hat einen Nutzen.** Kleidung schützt, Nahrung ist
notwendig zum Überleben, Werkzeug steigert die Produktion. Waren sind keine abstrakten
Punkte, sondern greifen in die Bedürfnisse der Charaktere ein. Damit entsteht echte
Nachfrage statt eines reinen Zahlenkreislaufs.

Angestellte NPCs (eigene Kinder oder fremde) arbeiten im Betrieb, kosten Lohn und
erzeugen Wert — das schließt den Kreis zur Familienmechanik: viele Kinder sind
Arbeitskraft.

**Eine Anstellung ist ein Verhältnis, keine Schicht.** Wer jemanden fest einstellt, bindet
ihn — und bindet sich: Der Lohn läuft, ob der Betrieb trägt oder nicht. Das ist der
Unterschied zur Tagelöhnerei, und er ist für beide Seiten ein Geschäft mit Risiko. Der
Angestellte gibt seine Freiheit auf, anderswo mehr zu verdienen; der Betrieb übernimmt
eine Fixkostenseite, die er auch im schlechten Jahr trägt.

**Über den Lohn wird verhandelt, nicht verfügt.** Ein Betrieb hängt einen Satz aus, und
wer ihn zu niedrig findet, geht woandershin — oder fordert mehr. Damit wird der Lohn zu
dem, was er sein soll: ein Preis, der sich zwischen Angebot und Nachfrage einpendelt. In
einer Stadt mit drei Schmieden und zwei Schmiedegesellen zahlt man, was verlangt wird. Wer
einen Angestellten über Jahre hält, hat außerdem Zuneigung aufgebaut — und die ist bei der
nächsten Wahl eine Stimme. Ein zu knapper Lohn kostet also zweimal.

**Ein Handwerk betreibt, wer es kann.** Eine Schmiede zu führen setzt voraus, dass jemand
schmieden kann — der Eigentümer selbst oder ein Angestellter mit der Qualifikation. Das
gibt den Fertigkeiten (Abschnitt 7) ihr wirtschaftliches Gewicht: Ein Betrieb ist dann
nicht mehr ein Gebäude, das man kauft, sondern eines, das man besetzen muss. Und es
schärft, was die Lehre wert ist — wer keinen Meister ausgebildet hat, hinterlässt seinem
Erben eine Werkstatt, die stillsteht, bis er jemanden findet und bezahlt.

**Rohstoffe entstehen nicht aus dem Nichts.** Am Anfang jeder Produktionskette steht
eine **Abbaufläche** im Umland: Holz aus dem Wald, Stein aus dem Bruch, Getreide vom
Acker, Erz aus der Grube. Erst was dort gewonnen wurde, kann eine Handwerkshütte
verarbeiten. Damit hat jede Ware eine nachvollziehbare Herkunft, und Engpässe wirken
sich die Kette entlang aus — wer den Wald hält, bestimmt den Preis für Bauholz und damit
mittelbar, was Renovieren kostet.

**Was man trägt, wird gesehen.** Ein Gewand verbessert jeden Umgang mit anderen, ein
Duftwasser den einen Abend, auf den es ankommt. Damit hängt an der Zuneigung — dem
Querschnitt des ganzen Spiels — auch ein Handwerk: Der Schneider lebt davon, dass Kleidung
sich abträgt, der Alchemist davon, dass ein Fläschchen einmal wirkt und dann leer ist.
Zwei Berufe, die nicht von Häusern leben, sondern von Menschen.

**Ein Haus besteht nicht aus Münzen.** Wer bauen oder renovieren will, braucht Bretter,
Quader und Eisen — und damit hat jede Stufe der Kette einen Abnehmer: Der Holzfäller
verkauft an die Zimmerei, die Zimmerei an den Bauherrn. Das ist der Grund, warum Holz
einen Preis hat: weil jemand ein Haus will, nicht weil eine Tabelle es festlegt.

**Pacht.** Abbauflächen sind knapp wie Bauland, aber sie gehören **der Stadt** und werden
verpachtet, nicht verkauft. Ein Pachtverhältnis läuft auf Zeit und kostet laufend; wer
nicht zahlt, verliert es. Das erzeugt drei Dinge, die dem Spiel guttun: eine
wiederkehrende Belastung, die Besitz zu Verantwortung macht; eine verlässliche Einnahme
für die Stadtkasse; und eine Vergabe, über die ein gewähltes Amt entscheidet.

Letzteres ist der eigentliche Gewinn: Wer den Wald bekommt, ist eine politische Frage.
Anders als bei gekauftem Land kann sich die erste Generation nicht dauerhaft alles
sichern — Pacht läuft aus, und über die Verlängerung entscheidet jemand, den man
überzeugen (oder wählen lassen) muss.

**Der Geldverleiher.** Wer bauen will, hat selten genug — und wer genug hat, lässt es
liegen. Ein Betrieb, der **Geld gegen Zins** verleiht, bringt beides zusammen und macht
aus totem Kapital ein Geschäft.

Er wird errichtet wie jeder andere: Ein Spieler oder ein NPC baut eine **Leihstube**, und
wer Geld braucht, fragt dort an. Der Verleiher sagt zu oder ab — das ist der Punkt, an dem
sich das Geschäft von einem Automaten unterscheidet. Wem man borgt, entscheidet man
selbst, und die Grundlage dafür liegt bereit: die Zuneigung. Wer sich anständig verhalten
hat, bekommt Geld; wer schon einmal ausgefallen ist, bekommt keins mehr. Damit ist ein
guter Ruf zum ersten Mal etwas wert, das sich in Münzen ausdrücken lässt.

Er löst dabei ein Problem, das die Welt an mehreren Stellen hat: Ein Neuling steht vor
einem Grundstück, das er sich erst in vierzig Schichten leisten kann (Abschnitt zu den
Startbedingungen, offener Punkt 14); ein Erbe übernimmt eine Werkstatt und kein Bargeld;
eine Ernte fällt aus, und die Grundsteuer ist trotzdem fällig. In allen drei Fällen fehlt
nicht Vermögen, sondern **Liquidität**, und genau dafür gibt es Kredit.

Er ist zugleich der schärfste Weg, sich zu ruinieren, und das ist beabsichtigt. Wer sich
verschuldet und die Rechnung nicht aufgeht, verliert mehr als der Vorsichtige je gewinnt.
Ein Spiel über Generationen, in dem man nur langsam wachsen kann, hat keine Fallhöhe; mit
Schulden hat es sie.

**Wer nicht zahlt, verliert erst sein Pfand und dann seine Freiheit.** Zuerst haftet, was
haftbar ist: Grundstück und Gebäude gehen an den Gläubiger. Ist auch das nicht da, kommt
der **Schuldturm** — dieselbe Haft, in die ein überführter Räuber geht, nur aus einem
anderen Grund. Ein Inhaftierter handelt nicht; seine Zeit läuft weiter, sein Leben steht
still.

Das ist hart, und es soll hart sein: Ohne diese letzte Stufe wäre ein Kredit an einen
Besitzlosen folgenlos zu behalten, und ein Verleiher liehe nur denen, die es nicht
brauchen. Die Härte hat allerdings ein Gegengewicht, und es ist das beste, das dieses
Spiel zu bieten hat: **Jemand kann einen auslösen.** Ein Verwandter, ein Freund, ein
Arbeitgeber, dem an einem guten Mann liegt — wer die Schuld begleicht, holt den Schuldner
heraus. Damit wird aus einer Bankrottregel eine Szene, in der sich zeigt, was ein Haus
über Generationen an Beziehungen aufgebaut hat.

Was das Gefängnis sonst noch regelt — wie lange man sitzt, ob man dort abarbeiten kann, wer
das Urteil spricht — steht bei den Bauten und Ämtern (offener Punkt 44). Was mit einer
Schuld beim Tod des Schuldners geschieht, ist ebenfalls offen (Punkt 43), und daran hängt
mehr, als es aussieht: Erbt der Erbe die Schulden, ist die Erbfolge plötzlich etwas, das
man ausschlagen möchte.

**Fernhandel.** Waren zwischen Städten zu bewegen kostet Zeit (mehrere Ticks) und Geld.
Wer richtig einschätzt, wo etwas knapp ist, verdient daran; wer sich verschätzt, sitzt
auf Ware, die am Zielort niemand braucht. Weil das Spiel ohnehin in Ticks rechnet, ist
eine unterwegs befindliche Karawane leicht abzubilden — sie kommt an einem bestimmten
Tick an.

### 4. Gebäude

Gebäude sind kein Beiwerk der Wirtschaft, sondern eigener Spielinhalt. Ein Haus wird
**errichtet**, es **verfällt**, es will **renoviert** und **verbessert** werden, und es
lässt sich **kaufen und verkaufen**.

**Wohnhaus und Handwerkshütte** sind die beiden privaten Grundtypen. Das Wohnhaus deckt
das Bedürfnis nach einem Dach über dem Kopf und bestimmt, wie gut man sich erholt; die
Handwerkshütte produziert Waren und bietet Arbeitsplätze für Angestellte.

**Nicht jeder Betrieb stellt etwas her.** Der dritte Typ verkauft eine **Leistung**: Die
Kirche tauft, traut und bestattet, die Taverne schenkt aus und gibt einen Ort zum
Zusammensitzen, der Geldverleiher gibt Geld gegen Zins. Nichts davon landet in einem
Vorrat, und trotzdem ist es dasselbe Gebäude — Eigentümer, Zustand, Ausbaustufe,
Angestellte, Verfall.

Der Unterschied liegt allein darin, **woher die Einnahme kommt**: Wo ein Handwerksbetrieb
ein Erzeugnis auslegt, das jemand kauft, verlangt ein Dienstleister eine Gebühr für eine
Handlung, die ohnehin im Spiel vorkommt. Geheiratet wird auch heute; künftig kostet es und
zahlt jemanden. Das ist der billigste denkbare Weg, aus vorhandenen Handlungen Wirtschaft
zu machen — es braucht keine neue Mechanik, nur einen Empfänger für das Geld.

Und es löst ein Problem, das die Bedürfnishierarchie hat: Ihre oberen Stufen — Ansehen,
Zugehörigkeit, Entfaltung — haben bisher wenig, wofür man Geld ausgeben könnte. Ein
Wirtshausabend, eine Hochzeit mit Feier und ein Begräbnis, das sich sehen lässt, sind
genau das: Ausgaben, die niemand machen muss und die trotzdem jeder macht.

**Öffentliche Gebäude** gehören keinem Charakter, sondern der Stadt: Brunnen, Schule,
Friedhof, Stadtmauer, Unterkunft für Obdachlose, **Schuldturm**.

**In die Unterkunft zieht, wer sonst nirgends unterkommt** — und zwar von selbst, sobald
ein Haus erlischt oder ein neues beginnt. Das ist keine Wohltat, sondern der Zweck des
Baus: Ein Obdachloser erholt sich nicht und bekommt keine Kinder, und ein Neuling, der im
Freien anfängt, hat keine Dynastie, sondern eine Frist. Ist die Unterkunft voll, beginnt
man draußen — dann ist es an der Stadt, eine zweite zu bauen.

**Nur ein Amt kann sie errichten.** Wer kein Amt hält, kann kein Rathaus bauen, auch nicht
aus eigener Tasche — das ist keine Preisfrage, sondern eine Zuständigkeitsfrage. Sonst
entstünde die widersinnige Lage, dass ein reiches Haus das einzige Rathaus der Stadt besitzt
und die Allgemeinheit ihres um Erlaubnis bitten müsste, wo sie wählt. Öffentlich heißt: aus
der Stadtkasse bezahlt, von einem Gewählten beschlossen, im Eigentum der Stadt. Sie werden aus der **Stadtkasse**
bezahlt, also aus Steuern und Pachteinnahmen, und wer sie baut, entscheidet die Politik.
Damit bekommen Ämter einen sichtbaren Zweck: Ein Bürgermeister hinterlässt Bauwerke.

Ihr Nutzen liegt bei der Allgemeinheit, nicht beim Erbauer — der Brunnen versorgt alle,
die Schule bildet die Kinder der Stadt, die Mauer schützt jeden hinter ihr.

**Der Schuldturm ist die Ausnahme davon**, und deshalb der interessanteste unter ihnen: Er
nützt niemandem unmittelbar, sondern macht ein Versprechen glaubhaft. Wer dort sitzt, ist
entweder ein überführter Räuber oder jemand, der seine Schulden nicht bezahlen konnte und
nichts hatte, was sich pfänden ließ. Eine Stadt ohne Turm kann Recht sprechen, aber nicht
vollstrecken — und in ihr ist ein Kredit an einen Besitzlosen eine Schenkung. Der Turm ist
damit nicht Strafe, sondern die Bedingung dafür, dass Verträge zwischen Fremden überhaupt
etwas gelten.

**Wovor die Mauer schützt: Zufallsereignisse.** Die Welt schlägt gelegentlich zu —
Räuber überfallen das Umland, eine Seuche geht um, ein Brand greift auf die Nachbarhäuser
über. Öffentliche Bauten mildern genau das: die Mauer die Räuber, der Brunnen die Seuche,
und so weiter. Damit haben sie einen messbaren Wert, ohne dass es ein Kampfsystem oder
Krieg zwischen Städten bräuchte. Für die Politik heißt das: Wer nicht vorsorgt, wird nach
dem nächsten Unglück abgewählt. Besonders
wichtig ist die **Unterkunft für Obdachlose**: Wer sein Haus verliert, weil es zur Ruine
wurde oder er es verkaufen musste, braucht einen Ort, an dem es weitergeht. Ohne ein
solches Auffangnetz wäre der Verlust des Hauses eine Sackgasse, aus der ein Spieler nicht
mehr herausfindet — und ausgerechnet die Stadt, die keine Unterkunft baut, verliert ihre
verarmten Einwohner.

**Der Platz in der Stadt ist begrenzt.** Es gibt eine feste Zahl von **Grundstücken**,
und sie sind selbst Besitz — getrennt vom Gebäude, das darauf steht. Wer bauen will,
muss erst ein Grundstück haben, und die sind irgendwann alle vergeben. Und er muss
**Bürger** sein: Grund und Boden gehören denen, die zur Stadt gehören (Abschnitt 16). Erst dadurch
bekommt der Immobilienhandel Gewicht: Man kauft nicht, weil Bauen teuer wäre, sondern
weil kein Platz mehr frei ist. Lage wird zum Wert.

**Verfall und Renovierung.** Jedes Gebäude hat einen Zustand, der mit der Zeit sinkt.
Ein verfallenes Haus wärmt schlecht und eine verfallene Hütte produziert weniger.
Renovieren kostet Aktionspunkte und Baumaterial — womit Holz und Stein echte Waren mit
echter Nachfrage werden und das Baugewerbe ein eigener Wirtschaftszweig ist. Der
laufende Unterhalt, den auch NPCs stemmen müssen, ist genau das: Der Verfall ist die
Fixkostenseite des Besitzes.

**Wer gar nicht renoviert, verliert das Gebäude.** Am Ende des Verfalls steht die Ruine:
Das Haus ist weg, das Grundstück bleibt. Das ist die härteste Variante, passt aber zum
Permadeath der Dynastie — und sie löst nebenbei ein Problem, das begrenzte Grundstücke
sonst hätten: Ohne Ruinen würden aufgegebene Häuser die Stadt für immer blockieren. So
gibt die Welt Platz zurück, ohne dass jemand eingreifen muss. Der Zustand muss dafür
deutlich sichtbar sein, mit Warnung lange bevor es so weit ist.

**Ausbau.** Über die bloße Instandhaltung hinaus lassen sich Gebäude auf höhere Stufen
bringen: Aus der Hütte wird eine Werkstatt, aus der Werkstatt ein Betrieb mit mehr
Ausstoß und mehr Arbeitsplätzen; aus der Kate ein Haus, das mehr Menschen beherbergt und
besser erholt. Ausbau ist die Hauptinvestition, in die ein Spieler seinen Gewinn steckt.

**Handel mit Immobilien.** Grundstücke und Gebäude wechseln den Besitzer — durch Verkauf
zu einem Festpreis wie alle anderen Waren, oder durch Erbschaft beim Tod des
Eigentümers. Damit ist Grundbesitz das, was eine Dynastie über Generationen tatsächlich
aufbaut: Wer erbt, erbt vor allem Mauern.

Das gilt für Wohnhäuser wie für Werkstätten, und bei der Werkstatt hat es eine zweite
Seite: Wer einen Betrieb kauft, kauft Mauern, nicht Können. Ob er ihn führen darf, hängt
daran, ob er das Handwerk beherrscht oder jemanden anstellt, der es tut (Abschnitt 3).
Eine Schmiede zu erben oder zu ersteigern ist damit noch kein Geschäft, sondern erst die
Gelegenheit dazu.

**Bauen lassen statt selbst bauen.** Ein Haus besteht aus Brettern, Quadern und Eisen —
aber nicht jeder will Holz einkaufen, bevor er wohnen kann. Wer zahlt, kann deshalb einen
**Bauherrn beauftragen**: Er nennt einen Preis in Münzen, besorgt das Material und stellt
das Haus hin.

Die Kette bleibt dabei unangetastet — das Material wird gekauft, nur eben von jemand
anderem. Genau darin liegt der Reiz: Der Bauunternehmer verdient an der Spanne zwischen
dem, was er für Holz und Stein zahlt, und dem, was der Bauherr ihm gibt. Wer die
Baustoffpreise kennt, verdient; wer sich verschätzt, baut auf eigene Kosten. Aus dem
Baugewerbe wird damit ein Beruf statt einer Einkaufsliste.

**Gebäude tragen Namen, die man ändern kann.** „Bäckerei" ist eine Gattung, „Zum goldenen
Weck" ein Betrieb. Das kostet nichts an Mechanik und gibt einer Stadt ihr Gesicht — und
der Chronik Namen, die jemand gewählt hat, statt einer Nummer.

**Auch NPCs besitzen, bauen und verkaufen.** Sie unterliegen denselben Regeln wie
Spielercharaktere — sie wohnen in eigenen Häusern, müssen sie instand halten und lassen
sie verfallen, wenn das Geld nicht reicht. Damit ist der Immobilienmarkt auch dann
lebendig, wenn wenige Spieler online sind, und ein NPC-Haushalt, der verarmt, gibt
irgendwann ein Grundstück frei.

### 5. Politik

Spieler können sich für Ämter zur Wahl stellen, andere stimmen ab. Ämter bringen echte
Macht: Ein Bürgermeister kann Gesetze erlassen, die für alle gelten — Steuern, Zölle,
Bauvorschriften.

**Preise gehören nicht dazu.** Sie standen ursprünglich auf dieser Liste und sind
inzwischen woanders zu Hause: bei den Zünften (Abschnitt 17). Wer ein Handwerk ausübt,
regelt seine Preise mit seinesgleichen — und eine Stadt, in der der Bürgermeister die
Brotpreise setzt und die Bäckerzunft ebenfalls, hätte zwei Herren an derselben Zahl.
Zwischen Rat und Zunft zu streiten ist das interessantere Spiel, als beides in eine Hand
zu legen.

Politik ist damit die Ebene, auf der die Wirtschaft von Spielern selbst reguliert wird,
statt von Balancing-Konstanten im Code.

**Zwei Geldbeutel, nie vermischt.** Wer ein Amt hält, hat weiterhin sein eigenes Vermögen
— und verwaltet daneben fremdes. Jede Ausgabe muss deshalb sagen, aus welcher der beiden
Kassen sie geht: Kauft der Bürgermeister ein Grundstück **für sich**, zahlt er selbst und
wird Eigentümer; kauft er es **für die Stadt**, zahlt die Stadtkasse und die Stadt ist
Eigentümerin. Dasselbe gilt für Bauten, Material und Löhne.

Das ist keine Buchhaltungsfeinheit, sondern die Bedingung dafür, dass ein Amt überhaupt
etwas bedeutet. Wo die Trennung verschwimmt, gibt es zwei Fehler, und beide sind schlimm:
Der eine ist die Selbstbedienung — der Amtsinhaber baut sein Wohnhaus aus der Kasse. Der
andere ist umgekehrt und subtiler: Ein Bürgermeister, der aus eigener Tasche zahlt und
dafür Stadteigentum bekommt, hat die Stadt gekauft. Deshalb wird an jeder Amtshandlung
mitgeführt, **wer zahlt und wem es gehört**, und beides muss zusammenpassen — wer die
Stadtkasse belastet, erwirbt für die Stadt, nie für sich.

Sichtbar sein muss es auch: Jede Ausgabe aus der Stadtkasse gehört in die Chronik. Ein Amt,
das über fremdes Geld verfügt, wird an dem gemessen, was es damit getan hat.

**Ein Amt wird entschädigt.** Wer regiert, wendet Zeit auf, die er sonst in seiner
Werkstatt verbrächte — und ohne Ausgleich könnte sich nur leisten zu regieren, wer es nicht
nötig hat. Genau das wäre das Gegenteil dessen, wofür „es zählen Köpfe, nicht Münzen"
steht. Also zahlt die Stadtkasse dem Amtsinhaber eine laufende **Aufwandsentschädigung**.

Sie ist bewusst kein Gehalt für Erfolg, sondern ein Ausgleich für Aufwand — und sie wird
aus derselben Kasse gezahlt, die der Amtsinhaber selbst verwaltet. Damit ist sie
mechanisch dasselbe wie der Sold der Stadtwache und politisch dasselbe wie jede andere
Zahl: Ihre Höhe ist ein Gesetz, sie ist bei der nächsten Wahl zu rechtfertigen, und wer
sich selbst großzügig bedenkt, hat es zu erklären. Ist die Kasse leer, wird sie nicht
gezahlt; ein Amt ist keine Forderung an eine Stadt, die nichts hat.

**Die Stadtkasse ist der Hebel.** Steuern und Pachteinnahmen fließen hinein, öffentliche
Gebäude und die Erschließung neuen Baulands heraus. Wer ein Amt hält, verwaltet fremdes
Geld — und entscheidet Fragen, an denen für andere viel hängt: Wer bekommt die Pacht auf
den Wald? Wird neues Bauland ausgewiesen, und wer darf dort bauen? Bekommt die Stadt eine
Schule oder eine Mauer?

Da jede Stadt eigene Ämter hat, hat die Gründung einer neuen Stadt auch eine politische
Seite: Sie schafft ein zweites Machtzentrum, in dem andere Häuser vorn liegen können.

**Mehr als ein Amt — und drei Gewalten.** Der Bürgermeister ist das erste, aber nicht das
einzige. Die Stadt hat inzwischen von selbst drei Zweige ausgebildet, ohne dass sie als
solche geplant gewesen wären:

- **Gesetze setzen** — der Bürgermeister verschiebt die Zahlen, die für alle gelten:
  Zehnt, Standgeld, Grundsteuer, Schulgeld, Stadtreligion.
- **Ausführen** — die Stadtwache greift auf, die Kasse zahlt, Bauten entstehen, Land wird
  ausgewiesen und verpachtet.
- **Richten** — jemand muss über den Räuber und den zahlungsunfähigen Schuldner
  entscheiden: ob er in den Turm kommt und für wie lange.

Der dritte Zweig fehlt bislang. Die Wache fängt jemanden, der Turm nimmt ihn auf — aber
zwischen beidem steht ein Urteil, und dafür hat die Stadt niemanden. Also braucht sie
einen **Richter**.

**Und er darf nicht vom Bürgermeister abhängen.** Das ist die einzige Festlegung, die aus
der Sache selbst folgt und deshalb schon steht: Wer die Gesetze macht, die Wache befehligt
und obendrein bestimmt, wer sitzt, ist kein Bürgermeister, sondern ein Fürst. Ein Richter,
den der Bürgermeister ein- und absetzen kann, ist kein Gegengewicht, sondern sein
verlängerter Arm. Er muss also selbst gewählt sein — und am besten mit einer anderen
Amtszeit, damit nicht dieselbe Stimmung beide Ämter besetzt.

Der Gewinn dieser Aufteilung ist nicht die Zahl der Posten, sondern dass Macht verhandelt
werden muss: Heute bekommt der Wahlsieger Kasse, Wache, Bauten und Gesetze in einer Hand.
Verteilt muss er mit Leuten auskommen, die er sich nicht ausgesucht hat, und ein Haus, das
die Bürgermeisterwahl verloren hat, kann trotzdem ein Amt halten.

Welche Ämter es genau gibt, welche **gewählt** und welche vom Bürgermeister **ernannt**
werden, ist die eigentliche Zuschnittsfrage und noch offen (Punkt 32). Zwei Leitplanken
stehen dafür bereits fest: Der Richter wird gewählt, und die Stadtwache bleibt eine
Anstellung und wird nie ein Amt.

**Das Amt ist gerechnet, nicht gespeichert.** Bürgermeister ist der bestplatzierte
Kandidat der letzten Wahl, der noch lebt. Daraus ergibt sich die Nachfolge von selbst:
Stirbt er, ist der Zweitplatzierte der Beste unter den Lebenden und damit im Amt — ohne
dass beim Sterben etwas nachgetragen werden müsste. Neu gewählt wird erst, wenn die
Amtszeit abläuft oder von der Wahlliste niemand mehr lebt.

**Öffentliche Bauten verfallen wie private.** Der Zustand senkt, was sie taugen — die
Unterkunft nimmt weniger Leute auf, die Schmiede zahlt weniger. Der Bürgermeister richtet
sie aus der Stadtkasse her; damit hat das Amt eine Aufgabe, an der man es messen kann.
Einstürzen können sie nicht: Ein Rathaus, das zusammenfällt, nähme der Stadt die Wahl,
und neu bauen kann es niemand.

**Die Stadtwache ist eine Anstellung, kein Amt.** Der Bürgermeister setzt den Sold aus,
die Stadtkasse zahlt ihn. Ihre Stärke ist damit eine Haushaltsfrage: Wer eine große Wache
will, muss die Steuern dafür erheben — und beides bei derselben Wahl verantworten. Die
Stadt ist dabei ein Arbeitgeber wie jeder andere; wer nicht zahlen kann, dessen Schicht
findet nicht statt. Der Amtsinhaber selbst kann keine städtische Stelle antreten.

**Ein Gesetz erfindet keine Regel, es setzt eine Zahl.** Jede Gesetzesart zeigt auf eine
Stellschraube, die es ohnehin gibt — Zehnt, Standgeld, Verkaufssteuer, Grundsteuer. Der
Bürgermeister verschiebt sie; die Regel selbst bleibt an ihrer Stelle. Gespeichert wird
jeder Erlass einzeln, es gilt der jüngste, und daraus fällt die Chronik ab: Wer hat wann
was erhöht?

Die **Grenzen stehen im Code und nicht zur Abstimmung**. Ein Zehnt von hundert Prozent
wäre das Ende der Wirtschaft und nicht mehr rückgängig zu machen. Nach unten ist überall
die Null erlaubt: Eine Stadt aushungern zu lassen ist eine politische Entscheidung, keine
kaputte. Zwischen den Grenzen gilt ein Erlass sofort — Missbrauch wird nicht verhindert,
sondern abgewählt.

Die **Grundsteuer** trifft den Besitz statt den Ertrag und ist die einzige Abgabe, die an
der Zeit hängt: einmal im Spieljahr, je Grundstück. Sie macht Horten teuer. Wer nicht
zahlen kann, zahlt, was er hat; der Rest wird erlassen, denn eine Schuld ohne
Vollstreckung wäre nur eine Zahl, die wächst.

**Der Zoll trifft, was hereinkommt.** Auf Waren, die von auswärts in die Stadt gebracht
werden, liegt eine Abgabe. Historisch war das die wichtigste Stadteinnahme, und im Spiel
ist sie der Hebel, der dem Fernhandel überhaupt eine politische Seite gibt: Eine Stadt
kann sich öffnen oder abschotten. Ein hoher Zoll schützt die eigenen Handwerker vor
billiger Ware von auswärts und macht alles teurer, was sie selbst nicht herstellen können —
die klassische Abwägung, und sie trifft verschiedene Häuser verschieden. Wer eine Zunft
hinter sich hat, will ihn hoch; wer Fernhandel treibt, niedrig.

**Bannrechte sind das schärfste Instrument der Kasse.** Eine Stadt kann ein Gewerbe zum
Vorrecht erklären und es vergeben: Nur diese eine Mühle darf mahlen, nur dieser eine
Brauer brauen. Wer es bekommt, hat ein Monopol und zahlt dafür an die Stadt; wer es nicht
bekommt, hat umsonst gebaut.

Das ist der Punkt, an dem ein Amt am meisten wert ist — und an dem am ehesten jemand
versucht, es zu kaufen. Beides ist erwünscht. Ein Bannrecht ist befristet wie eine Pacht,
damit die erste Generation sich nicht auf ewig festsetzt, und seine Vergabe steht in der
Chronik.

**Das Bürgerrecht für Auswärtige ist die einzige Gesetzesart, die keine Zahl ist.** Sie
kennt nur offen oder zu: Darf, wer anderswo wohnt, hier Bürger werden und damit besitzen?
(Abschnitt 16). Eine Stadt, die zumacht, schützt ihre Handwerker vor fremdem Kapital und
verliert es zugleich an die Nachbarstadt, die offen ist.

Sie wirkt nur nach vorn: Wer das Bürgerrecht schon hat, behält es. Ein Gesetz, das
Erworbenes wieder nimmt, wäre eine Enteignung auf Beschluss — und das soll auch eine
Mehrheit nicht können.

**Die Bauordnung ist Vorsorge statt Einnahme.** Sie schreibt vor, womit gebaut wird —
Stein statt Holz, Abstände zwischen Häusern. Sie kostet jeden Bauherrn Geld und senkt
dafür, was ein Brand anrichtet. Damit hat die Stadt zum ersten Mal ein Gesetz, das nicht
umverteilt, sondern **abwendet**: Es zahlt sich erst aus, wenn etwas passiert, das ohne es
schlimmer gewesen wäre. Der Bürgermeister, der sie erlässt, wird dafür gescholten; sein
Nachfolger erntet, dass die Stadt nicht abbrennt.

**Die Stadtreligion ist die schärfste Gesetzesart.** Eine Stadt kann eine Konfession zur
ihren erklären; wer ihr nicht angehört, zahlt eine zusätzliche Abgabe. Auch das ist keine
neue Regel, sondern eine Zahl auf einer vorhandenen Stellschraube — nur wirkt sie nicht auf
Besitz oder Umsatz, sondern auf eine Eigenschaft der Person.

Genau deshalb ist sie ein anderes Kaliber als der Zehnt, und das Konzept sagt es lieber
selbst, als es später zu entdecken: Sie erlaubt einer Mehrheit, eine Minderheit zu
schröpfen. Das ist historisch der Normalfall gewesen und im Spiel eine echte Möglichkeit
— aber sie hat einen Preis, und der ist keine Schranke im Code, sondern eine Folge:
**Wer bedrängt wird, geht.** Eine Stadt, die ihre Andersgläubigen vertreibt, verliert
Arbeitskräfte, Kundschaft und Steuerzahler an die Nachbarstadt, die sie mit offenen Armen
nimmt. Die Abgabe bringt kurzfristig Geld in die Kasse und kostet langfristig Einwohner,
und beides sieht man.

Zwei Grenzen bleiben trotzdem im Code, aus demselben Grund wie beim Zehnt: Die Abgabe hat
eine Obergrenze, und die Zugehörigkeit zu einer Konfession entscheidet über Geld, nie über
Rechte. Niemand verliert sein Stimmrecht, sein Eigentum oder seine Ämter, weil er falsch
getauft ist. Eine Stellschraube darf teuer machen; sie darf niemanden aus dem Spiel
nehmen.

**Es zählen Köpfe, nicht Münzen.** Jeder Erwachsene der Stadt hat eine Stimme; Besitz
gibt keine. Wer politisch etwas will, braucht deshalb Leute: Kinder, Angestellte,
Verbündete. NPCs stimmen für den, zu dem sie die größte Zuneigung haben — ein eigenes
Wahlkampfsystem gibt es nicht, weil die Beziehungen bereits eines sind. Und wer selbst
antritt, wählt sich selbst.

### 6. Beziehungen — der Querschnitt

Jeder Charakter hat zu jedem anderen eine **Beziehung (Zuneigung)**, gleich ob NPC oder
Spielercharakter. Im Normalfall ist sie neutral und verschiebt sich durch Interaktion:
freundliches oder feindliches Handeln, Verwandtschaft, Anstellung, gezahlte Löhne,
erlassene Gesetze.

Diese eine Mechanik trägt zwei andere:

- **Heirat setzt eine gute Beziehung voraus** — man wirbt erst, dann heiratet man. Damit
  ist die Fortpflanzung, also das Überleben der Dynastie, an soziales Spiel gekoppelt
  und nicht an einen Knopfdruck.
- **Heiraten zwei Spielerhäuser, entscheidet der Zufall über jedes Kind.** Welchem der
  beiden Häuser ein Kind zugeschlagen wird, ist ein Münzwurf — kein Geschlecht „heiratet
  hinein“ und gibt sein Haus auf. Beide Spieler haben dieselbe Aussicht auf einen Erben,
  und keiner muss fürchten, mit der Ehe seine Dynastie zu beenden.
- **Ist nur ein Elternteil gespielt, fallen alle Kinder an dessen Haus.** Auch NPCs haben
  ein Haus, aber niemanden, der es führt. Ohne diese Regel halbierte eine Ehe mit einem
  NPC die Erbenaussicht — für etwas, das der Spieler nicht in der Hand hat. Die Häuser
  sind gleichwertig; die Aufmerksamkeit dahinter ist es nicht.
- **NPCs wählen nach Zuneigung.** Es gibt kein separates Wahlkampfsystem: Wer über
  Generationen Beziehungen gepflegt, anständig entlohnt und die Familie vergrößert hat,
  hat Stimmen. Wer die Stadt gegen sich aufgebracht hat, verliert sie.

Damit ist die Beziehungstabelle keine Nebensache, sondern nach dem Charakter selbst das
wichtigste Datum im Spiel.

**Der Grundwert ist ein Ausgangspunkt, keine Untergrenze.** Verwandte starten
sympathisch, aber wer seine Kinder schlecht behandelt, zieht die Beziehung ins Negative
bis zum offenen Hass. Umgekehrt kann man Fremde zu Verbündeten machen. Nichts an der
Herkunft legt eine Beziehung fest.

### Beziehungen zwischen Dynastien

Über den einzelnen Charakteren stehen **Beziehungen zwischen den Häusern**. Damit lassen
sich verfeindete Adelsgeschlechter abbilden: Wer in eine Familie hineingeboren wird,
erbt zwar nicht die persönlichen Beziehungen seiner Eltern — aber er erbt deren Feinde
und Freunde als Vorzeichen.

Die Zuneigung zwischen zwei Charakteren setzt sich damit aus fünf Schichten zusammen:

1. **Verwandtschaft** — der Bonus aus dem Stammbaum
2. **Religion** — der Zuschlag für dieselbe Konfession (Abschnitt 13)
3. **Ruf** — was alle von ihm halten, auch wer ihn nie getroffen hat (Abschnitt 15)
4. **Haus zu Haus** — die Fehde oder Freundschaft der Dynastien
5. **Person zu Person** — was die beiden konkret miteinander erlebt haben

Die ersten vier sind der **Grundwert** und werden gerechnet, nicht gespeichert: Sie stehen
schon fest, bevor sich zwei je begegnet sind. Nur die fünfte hat eine Zeile, und nur wenn
es etwas zu erzählen gibt.

Die persönliche Schicht sticht dabei die anderen: Man kann sich mit einem Mitglied des
verfeindeten Hauses anfreunden — Romeo und Julia bleiben möglich, sind aber ein Kampf
gegen den Strom. Dasselbe gilt über die Konfession hinweg; auch dort ist es ein Kampf
gegen den Strom und deshalb eine Geschichte.

### 7. Fertigkeiten — der zweite Querschnitt

Ein Charakter ist nicht nur, was er besitzt, sondern was er **kann**. Fertigkeiten
wachsen durch Ausübung und machen aus austauschbaren Figuren Fachleute: Der eine ist
Schmied geworden, der andere Händler, der dritte taugt zum Kämpfen.

Sie greifen überall dort ein, wo bisher eine Pauschale steht. Eine Schicht in der
Schmiede bringt heute für jeden gleich viel; mit Fertigkeiten hängt der Ertrag daran, wer
am Amboss steht. Dasselbe gilt für Bauqualität, Handelsspanne und Heilkunst.

**Spezialisierung entsteht aus Aufwand, nicht aus einer Regel.** Jede Stufe kostet
deutlich mehr Übung als die vorige. Damit kann jeder alles ein bisschen, aber niemand
alles gut — und zwar ohne eine Obergrenze, die von außen sagt, was man zu wählen hat. Wer
Meister werden will, gibt dafür ein Leben aus; wer sich breit aufstellt, bleibt überall
mittelmäßig. Das ist dieselbe Abwägung, die knappes Bauland beim Besitz erzwingt, nur für
die Zeit.

**Fertigkeiten sterben mit dem Charakter — außer sie wurden gelehrt.** Der Erbe bekommt
die Mauern, den Boden und das Geld, aber nicht das Können. Wer will, dass sein Handwerk
das Haus überdauert, muss zu Lebzeiten **ausbilden**: Lehre kostet Aktionspunkte bei
beiden, beim Meister wie beim Schüler, und der Schüler bleibt unter dem Meister.

Das macht aus dem Generationenwechsel eine Vorbereitung statt einer Formel. Wer plötzlich
stirbt, hinterlässt eine Werkstatt, die niemand bedienen kann — genau die Dramatik, die
Permadeath tragen soll. Und es gibt der Lehre einen Platz im Spiel: Sie ist Zeit, die man
in die nächste Generation steckt, statt in die eigene Werkstatt.

Der übliche Ort dafür ist das **eigene Haus**: Das Kind arbeitet in der Werkstatt mit und
lernt dabei (Abschnitt 10). Ohne diesen Weg wäre die Voraussetzung, ein Handwerk zu
beherrschen, um es zu betreiben, eine Falle für jeden Erben — mit ihm ist sie eine
Aufgabe, die man rechtzeitig angehen muss.

**Kämpfen ist eine Fertigkeit wie jede andere.** Sie entscheidet den Überfall auf einen
Händler, die Verteidigung dagegen, den Streit mit der Konkurrenz und den Dienst in der
**Stadtwache** — die damit ein öffentliches Amt mit klarem Zweck wird, bezahlt aus der
Stadtkasse. Raub ist ein gangbarer Weg, kein Ausrutscher: Wer Ware transportiert, trägt
ein Risiko, und wer Wachen bezahlt, senkt es.

Damit bekommen zwei Dinge nachträglich einen Boden. Die Zufallsereignisse aus Abschnitt 4
(Räuber im Umland) sind nicht mehr nur Wetter, gegen das eine Mauer hilft, sondern etwas,
gegen das auch Menschen etwas ausrichten. Und die Politik bekommt eine Ausgabe, deren
Nutzen jeder sofort spürt.

### 8. Berufe, Waren und Jahreszeiten

Aus den Fertigkeiten werden **Berufe**, und jeder Beruf stellt Waren her, die anderswo im
Spiel etwas bewirken. Der Schmied macht Waffen und Rüstungen, aber auch Alltagsgerät aus
Metall. Der Alchemist braut Heiltränke gegen Krankheit, Duftwasser fürs Werben und Gift
für den Kampf. Der Schneider näht Kleidung, die im Winter vor Krankheit schützt und im
Umgang mit anderen hilft. Weitere kommen dazu.

**Der Prüfstein für jede Ware ist dieselbe Frage wie bei Fertigkeiten und
Persönlichkeitsachsen: Wo wirkt sie?** Ein Gegenstand, der nur Geld in Punkte verwandelt,
ist Dekoration. Ein Heiltrank braucht Krankheiten (offener Punkt 5), Gift braucht Kämpfe
(Punkt 6), Duftwasser wirkt auf die Zuneigung aus Abschnitt 6, Winterkleidung auf die
Jahreszeit. Genau deshalb hängt der Warenkatalog an diesen Systemen und nicht umgekehrt —
was keine Wirkung hat, wird nicht gebaut.

Damit greifen die Waren in **alle** bestehenden Mechaniken hinein statt in eine eigene:
Rüstung und Gift in den Kampf, Duftwasser ins Werben, Heiltrank in die Sterblichkeit,
Kleidung in Krankheit und Umgang, Werkzeug in die Produktion.

**Der Brauer und die Taverne** sind das nächste Paar nach diesem Muster, und ein
besonders sauberes. Bier ist eine Ware mit einer Kette, die schon steht: Getreide vom
Acker, gemälzt und gebraut, ausgeschenkt in der Taverne. Damit bekommt der Acker einen
zweiten Abnehmer neben der Mühle — bisher endet Getreide beim Brot, und ein Rohstoff mit
nur einem Weg ist kein Markt, sondern eine Rohrleitung.

Die **Taverne** ist dann kein Laden, der Bier verkauft, sondern ein Dienstleistungsbetrieb
im Sinne von Abschnitt 4: Man geht hin, um Leute zu treffen. Damit hat das Werben einen
Ort, das Zusammensitzen eine Wirkung auf die Zuneigung und der Wirt ein Auskommen davon,
dass andere sich begegnen. Für die Bedürfnishierarchie ist es die erste Ausgabe auf der
Stufe der Zugehörigkeit, die kein Ding ist — man kauft keinen Gegenstand, sondern einen
Abend.

**Die Jahreszeiten.** Das Jahr hat Frühling, Sommer, Herbst und Winter, und sie sind
keine Kulisse: Getreide wächst nur zur Saison, der Winter verlangt Kleidung und Heizung,
Frost verteuert Bauarbeiten. Daraus entsteht der Wirtschaftszyklus, den ein Markt ohne
Saison nicht hat — Vorratshaltung, Preisschwankungen und ein Grund, im Herbst zu
renovieren statt im Januar.

Die Jahreszeit braucht **keine eigene Ablage**: Sie ergibt sich aus dem Stand der Weltuhr
innerhalb des Jahres. Eine gespeicherte Jahreszeit wäre eine zweite Wahrheit neben
`currentTick` und liefe irgendwann damit auseinander.

Ein Detail, das dabei über die Länge des Spieljahres entschieden hat: Wäre ein Jahr genau
achtundvierzig Stunden, läge jede Uhrzeit für immer an derselben Stelle des Kalenders —
wer täglich um sieben spielt, sähe bis in alle Ewigkeit dieselben zwei Jahreszeiten und
kaufte nie Winterkleidung. Ein Jahr von **fünfzig** Stunden lässt den Kalender durch den
Tagesablauf wandern; nach gut zwei Wochen hat auch der Gewohnheitsspieler alles einmal
erlebt.

### 9. Persönlichkeit — woher NPCs ihre Ziele nehmen

NPCs sind keine Kulisse, sondern Marktteilnehmer, Wähler und Nachbarn. Damit sie handeln
können, ohne dass für jede Lage eine Regel geschrieben wird, bekommt **jeder Charakter
bei der Geburt eine Grundpersönlichkeit** — ein paar Anlagen, aus denen sich ableitet,
was er will und wie er es angeht.

Sie besteht aus wenigen Achsen mit Zahlen, nicht aus einem Katalog benannter
Eigenschaften. Der Unterschied ist kein Geschmack: Mit Achsen wird jede Entscheidung eine
gewichtete Summe, und eine neue Handlung braucht neue Gewichte statt einer Verzweigung
über jede denkbare Eigenschaft. Sichtbar wird trotzdem ein Wort — das Etikett ergibt sich
aus dem stärksten Ausschlag, „Cunne, die Gierige".

Sechs Achsen, jede mit mindestens einer Entscheidung, die an ihr hängt:

| Achse               | von … bis                    | entscheidet über                              |
| ------------------- | ---------------------------- | --------------------------------------------- |
| **Mut**             | vorsichtig ↔ verwegen       | Kampf, Raub, Wachdienst, Fernhandel           |
| **Fleiß**           | träge ↔ fleißig             | wie viel des Aktionsbudgets eingesetzt wird   |
| **Gier**            | genügsam ↔ gierig           | Preise, gezahlte Löhne, Sparen statt Ausgeben |
| **Geselligkeit**    | eigenbrötlerisch ↔ gesellig | Werben, Besuche, Aufwand für Beziehungen      |
| **Ehrgeiz**         | bescheiden ↔ ehrgeizig      | Kandidatur, Ausbau, Bauten fürs Ansehen       |
| **Verträglichkeit** | streitsüchtig ↔ friedfertig | Fehde, feindliche Handlungen, Nachgeben       |

Eine Achse, an der keine Entscheidung hängt, gehört nicht dazu — sie wäre ein Wert, den
niemand liest.

**Jeder bekommt eine, auch der Spielercharakter.** Beim NPC steuert sie das Handeln, beim
Spieler beschreibt sie nur — zwingen soll sie ihn nicht. Aber sie ist auch bei ihm nicht
folgenlos: Sie macht die **Erbenwahl** zu einer echten Entscheidung. Der gierige Älteste
oder die fleißige Zweite? Bis heute war das Geburtsdatum die einzige Frage. Und es bleibt
eine Mechanik statt zweier — ein System, das nur für die halbe Welt gilt, driftet
unweigerlich von der anderen Hälfte ab.

**Vererbt wird mit Streuung:** der Mittelwert beider Eltern plus Zufall. Damit hat die
Partnerwahl eine Ebene mehr — wer einen brauchbaren Erben will, heiratet nicht irgendwen —
und Geschwister ähneln einander, ohne dass sich etwas festfährt. Gewissheit gibt es
keine: Aus zwei Fleißigen kann ein Faulpelz werden, nur seltener.

**Die Persönlichkeit ändert sich nicht.** Anders als Zuneigung und Fertigkeiten ist sie
das Feste am Charakter — was einer erlebt, verschiebt seine Beziehungen und sein Können,
nicht seine Anlagen. Wer anders handeln soll, muss ein anderer sein, und dafür gibt es
den Generationenwechsel.

### 10. Bildung — was man einem Kind mitgibt

**Die Kindheit ist kein Wartezimmer.** Bis zur Volljährigkeit kann ein Charakter wenig;
das soll so bleiben, aber die Zeit soll nicht folgenlos vergehen. Wer sein Kind zur
Schule schickt, zahlt dafür — und bekommt einen Erwachsenen, der nicht bei null anfängt.

Das ist die Ausgabe mit der längsten Verzögerung im ganzen Spiel: Sie zahlt sich erst in
der nächsten Generation aus, und zwar bei dem Charakter, den man dann selbst spielt.
Genau darin liegt der Reiz — ein Haus, das über Generationen in seine Kinder investiert,
steht nach hundert Jahren anders da als eines, das jede Münze sofort verbraucht hat.

**Die Schule ist ein Lehrmeister, den sich jeder leisten kann.** Sie erfindet keine
eigene Mechanik: Ein Schultag ist eine Lehrstunde, der Lehrer muss zwei Stufen über dem
Kind stehen, und er kostet das Kind Aktionspunkte wie Arbeit. Damit steht Lernen gegen
Verdienen — erst dadurch wird die Entscheidung zu einer.

Was ein Kind lernen kann, hängt daran, wen die Stadt als Lehrer gewinnt: Eine Schule ohne
Lehrer ist ein leeres Haus, und ein Lehrer gibt nur weiter, was er selbst beherrscht.
Bezahlt wird er aus der Stadtkasse, wie die Wache.

Die Schule gehört der Stadt, das Schulgeld fließt in die Stadtkasse. Damit hat die
Bildung eine politische Seite: Wie viele Schulen sich eine Stadt leistet, ob das
Schulgeld hoch oder niedrig ist, wer es sich leisten kann — das entscheidet ein
gewähltes Amt und nicht der Code.

**Die Lehre im eigenen Betrieb.** Neben der Schule steht der zweite Weg, und er ist der
ältere: Das Kind arbeitet in der Werkstatt der Eltern mit. Es taugt anfangs wenig, bringt
also weniger ein als ein erwachsener Geselle — dafür lernt es dabei, und zwar ohne dass
jemand Lehrgeld an einen Fremden zahlt.

Auch das erfindet nichts Neues, sondern verbindet zwei vorhandene Dinge: Eine Schicht im
Betrieb ist Arbeit, eine Lehrstunde ist Unterricht, und die Lehre im eigenen Haus ist
beides in einem Zug. Der Meister ist ohnehin da, die Werkstatt steht, und die Zeit des
Kindes wäre sonst ungenutzt.

**Der Grund, warum es das geben muss**, liegt eine Ebene tiefer. Weil ein Handwerksbetrieb
nur führen darf, wer das Handwerk beherrscht (Abschnitt 3), kann ein Erbe die Werkstatt
seines Vaters nicht übernehmen, wenn er nichts gelernt hat — er erbt Mauern und eine
Maschine, die er nicht anwerfen kann. Das ist realistisch und wäre trotzdem eine Falle:
eine Härte ohne Weg daran vorbei. Mit der Lehre im eigenen Betrieb hat der Spieler diesen
Weg, und er kostet, was er kosten soll — die Jahre, in denen das Kind noch nichts
erwirtschaftet.

Damit stehen sich zwei Erziehungen gegenüber, und das ist die eigentliche Entscheidung:
**Schule oder Werkstatt.** Die Schule ist breit, kostet Geld und gibt, was gerade ein
Lehrer beherrscht; die Werkstatt ist eng, kostet Ertrag und gibt genau das eine Handwerk,
von dem das Haus lebt. Beide kosten dieselben Aktionspunkte des Kindes, und ein Tag ist
nur einmal da. Wer sein Haus fortsetzen will, bildet den Nachfolger aus; wer ihm etwas
anderes ermöglichen will, schickt ihn zur Schule.

Und wer beides versäumt, hat immer noch den dritten Weg: **jemanden einstellen, der es
kann.** Das ist teuer und macht abhängig — aber es rettet den Betrieb, und ein Haus, das
seinen eigenen Meister nicht mehr stellt, hat genau das verdient.

### 11. Unglücke — was einem zustoßen kann

**Die Welt nimmt auch.** Raubzüge und Brände treffen die Stadt, ohne dass jemand etwas
falsch gemacht hätte: Ein Unglück verschiebt Münzen, räumt ein Lager oder setzt ein Haus
in Brand. Das ist der Gegenspieler zum Aufbauen — ohne ihn wäre Wohlstand eine Einbahn,
und eine Mauer, eine Wache oder ein Brunnen hätten keinen Zweck.

**Getroffen wird, wo etwas zu holen ist.** Wer viel hat, ist das lohnendere Ziel; wer
nichts hat, lohnt den Weg nicht. Das ist nicht nur stimmig, sondern nötig — sonst würde
ein Unglück die Armen aus dem Spiel drängen, statt die Reichen zu beschäftigen. Aus
demselben Grund bleibt der Vorrat in der eigenen Kammer unangetastet: Er ist das, was
zwischen einem Charakter und dem Verhungern steht.

**Schutz ist eine laufende Ausgabe, kein Zustand.** Jeder Wächter senkt die Gefahr, keiner
schafft sie ab. Damit ist Sicherheit etwas, das eine Stadt sich Jahr für Jahr leisten
muss — und der Bürgermeister, der die Wache streicht, spart sichtbar und zahlt später.

### 12. Die Chronik — damit die Welt erzählbar bleibt

**Die Welt läuft weiter, während niemand zusieht.** Das ist ihr größter Vorzug und ihr
größtes Problem: Wer nach zwei Tagen wiederkommt, findet eine veränderte Stadt vor und
weiß nicht, was sie verändert hat. Wer gestorben ist, wer geheiratet hat, wer gewählt
wurde, was gebaut wurde.

Deshalb führt jede Stadt eine Chronik: Geburten, Hochzeiten, Todesfälle, Erbfälle,
Wahlen, neue Bauten, Unglücke. Dieselben Zeilen beantworten drei Fragen, je nachdem,
wonach man filtert — was geschah in der Stadt, was betraf mein Haus, was hat diese Person
erlebt. Der Lebenslauf eines Charakters ist damit kein eigenes System, sondern eine Sicht
auf die Chronik: geboren, verheiratet, im Amt, gestorben.

Und sie hat eine politische Seite: Ein Unglück, von dem niemand erfährt, hat keine
Folgen. Wer ein Amt hält, wird an dem gemessen, was in der Chronik steht.

### 13. Religion — der dritte Querschnitt

**Es gibt mehr als eine.** Das ist die entscheidende Festlegung, denn eine einzige Religion
wäre Kulisse: Etwas, das alle teilen, unterscheidet niemanden. Zum Start zwei —
**Katholiken und Protestanten** —, und die Bauart lässt jede weitere zu.

**Beide sind gleich viel wert.** Keine Religion gibt bessere Boni, keine ist die richtige;
was sie unterscheidet, ist ausschließlich, wer sonst noch dazugehört. Das ist nicht
Zurückhaltung, sondern Spielmechanik: Sobald eine Seite mechanisch stärker wäre, gäbe es
nichts mehr zu entscheiden, sondern nur noch eine falsche und eine richtige Wahl. Der Reiz
liegt in der Verteilung, nicht in den Werten.

**Zugehörigkeit entsteht durch Taufe.** Man kann sich taufen lassen, und man tauft seine
Kinder bei der Geburt — das ist die übliche Weise, wie jemand zu einer Religion kommt, und
sie macht aus einer Entscheidung der Eltern etwas, das das Kind ein Leben lang trägt. Wer
ungetauft bleibt, gehört zu keiner; das ist erlaubt und kostet die Zugehörigkeit, die
andere haben.

**Die Wirkung liegt bei der Zuneigung.** Wer dieselbe Religion teilt, steht einander näher
— ein Zuschlag auf den Grundwert, wie ihn Verwandtschaft und Hausbeziehung auch geben.
Damit ist Religion kein eigenes System, sondern eine weitere Schicht in dem, was ohnehin
das wichtigste Datum des Spiels ist (Abschnitt 6).

Und weil an der Zuneigung die Wahl hängt, hängt an der Religion die Politik. Eine Stadt,
in der eine Konfession die Mehrheit stellt, wählt ihresgleichen — nicht weil eine Regel es
vorschriebe, sondern weil Stimmen der Zuneigung folgen. Ein Haus der Minderheit muss dann
über andere Wege Stimmen sammeln: über Löhne, über Ehen, über Wohltaten. Wer die Konfession
wechselt, um wählbar zu werden, tut etwas, das im Spiel sichtbar ist und in der Chronik
steht.

**Die Kirche gehört keiner Stadt, sondern jemandem.** Sie ist ein Betrieb wie eine
Schmiede — ein Spieler oder ein NPC errichtet sie auf eigenem Grund, hält sie instand und
stellt Leute ein. Sie ist keine Amtshandlung des Bürgermeisters und wird nicht aus der
Stadtkasse bezahlt.

Das ist die folgenreichere Bauart, und zwar in beide Richtungen. Sie macht aus dem Glauben
einen **Wirtschaftszweig**: Die Kirche lebt von Gottesdiensten, Hochzeiten und
Begräbnissen — Handlungen, die es ohnehin gibt und die künftig jemanden bezahlen. Ein
Geistlicher ist damit ein Beruf, der ein Auskommen hat, und eine gut besuchte Kirche ein
Vermögen, das sich vererbt.

Und sie macht aus dem Konfessionsunterschied einen **Wettbewerb** statt einer
Abstimmung. Wo zwei Kirchen stehen, wirbt jede um Gläubige, denn jeder Getaufte ist
Kundschaft für ein Leben — Taufe, Hochzeit, Begräbnis. Wer die Mehrheit hinter sich hat,
verdient daran; wer die Minderheit bedient, hat ein kleineres, aber sicheres Geschäft. Der
Streit findet damit auf dem Markt statt und nicht im Rathaus, und niemand muss ihn
entscheiden.

Der Politik bleibt trotzdem ihr Zugriff: Wer Bauland ausweist, entscheidet, ob eine zweite
Kirche überhaupt Platz findet, und wer Steuern setzt, trifft auch sie. Das ist der feinere
Hebel — und der ehrlichere, weil er dieselbe Handhabe ist, die jeden anderen Betrieb
trifft.

Der **Friedhof** bleibt dagegen öffentlich (Abschnitt 4): Der Ort gehört der Stadt, die
Feier der Kirche. Wer beerdigt wird, liegt bei allen anderen; wer ihn beerdigt, ist eine
Frage des Glaubens und der Rechnung.

**Und dann kann die Politik doch zugreifen — über das Gesetz.** Eine Stadt darf eine
**Stadtreligion** ausrufen, und wer ihr nicht angehört, zahlt dafür (Abschnitt 5). Damit
bekommt die Konfession dieselbe Eigenschaft wie Besitz und Umsatz: Sie ist besteuerbar,
und damit ist sie ein Wahlkampfthema.

Wer davon betroffen ist, hat drei Wege, und alle drei sind Spiel: **zahlen**, **übertreten**
oder **fortziehen**. Der letzte ist der Grund, warum die Regel trägt, ohne dass sie
begrenzt werden müsste — eine Stadt, die ihre Minderheit vertreibt, schrumpft, und die
Nachbarstadt wächst. Wer bleibt und zahlt, hat ein Motiv, bei der nächsten Wahl anders
abzustimmen; wer übertritt, verliert Zuneigung bei denen, die er verlässt. Aus einer
einzigen Zahl im Gesetzbuch entstehen damit Wanderung, Wahlkampf und Konversion, ohne dass
eines davon eigens gebaut werden müsste.

### 14. Feste im Jahreslauf

**Das Jahr hat wiederkehrende Tage, an denen etwas anderes gilt.** Erntedank nach der
Ernte, ein Markttag, ein Fest der einen und eines der anderen Konfession. Sie stehen nicht
in einer Tabelle, sondern **ergeben sich aus dem Tick** — dieselbe Rechnung, die Jahreszeit
und Jahr liefert, liefert auch, welcher Tag heute ist. Ein Fest ist eine Eigenschaft der
Zeit, kein Datensatz.

Ihr Zweck ist, dass Zeit nicht gleichförmig verläuft. Ein Jahr, in dem jeder Tick wie der
vorige ist, hat keinen Rhythmus; ein Jahr mit Terminen gibt Anlässe, an denen man dabei
sein will. Was ein Fest bewirkt, ist noch offen — naheliegend ist die Zuneigung, weil ein
Fest die Gelegenheit ist, viele auf einmal zu treffen, statt einen nach dem anderen zu
besuchen.

Die religiösen Feste erben dabei den Streit aus Abschnitt 13: Ein Fest, das die Stadt
ausrichtet, ist das Fest einer Konfession, und wer es ausrichtet, hat gewonnen. Die
weltlichen — Markttag, Erntedank — gehören allen und sind der Ausgleich dazu.

### 15. Ansehen und Ruf — der vierte Querschnitt

**Zuneigung ist privat, Ansehen ist öffentlich.** Bisher kennt das Spiel nur, was zwei
Charaktere voneinander halten. Was aber **alle** von einem halten, gibt es nicht — obwohl
das Konzept es an mehreren Stellen voraussetzt: Titel, Besitz und Ansehen sollen vererbt
werden, die Bedürfnishierarchie hat eine Stufe „Ansehen", der Ehrgeiz zielt auf „Bauten
fürs Ansehen". Alles das zeigt auf eine Größe, die fehlt.

**Der Ruf entsteht aus Taten, nicht aus Meinungen.** Was jemand tut, bringt ihm Punkte ein
oder kostet ihn welche, und die Summe daraus ist sein Ruf. Ein Amt ehrenhaft geführt, eine
Stiftung errichtet, ein Handwerk zur Meisterschaft gebracht, viele Kinder großgezogen — das
hebt ihn. Als Schuldner ausgefallen, im Turm gesessen, beim Rauben erkannt, eine Zunftregel
gebrochen, die Konfession aus Berechnung gewechselt — das senkt ihn.

Damit bekommen ein halbes Dutzend Regeln endlich ihre Bremse. Mehrere offene Punkte
schlagen bisher vor, dass etwas „den Ruf kostet", ohne dass es einen gäbe: der Räuber, der
erkannt wird; der Konvertit; der Wucherer. Ein Ruf macht diese Folgen erst möglich — und
zwar ohne für jeden Fall eine eigene Strafe zu erfinden.

**Was der Ruf bewirkt**, folgt aus dem, was es schon gibt: Er geht als weitere Schicht in
den Grundwert der Zuneigung ein (jeder mag den Angesehenen ein wenig lieber), er entscheidet
mit, wem ein Geldverleiher borgt, ob eine Zunft jemanden aufnimmt und ob ein NPC für ihn
stimmt. Kein eigenes System, sondern ein Zeiger, den bestehende Regeln ablesen.

**Der Ruf ist die Ausnahme von der Vererbungsregel.** Fertigkeiten sterben mit dem
Charakter, Beziehungen auch — der Ruf nicht ganz: Ein Teil davon geht als **Ansehen des
Hauses** auf den Erben über. Genau das ist es, was eine Dynastie über Generationen
aufbaut und was ein einzelner Skandal beschädigen kann. Ohne diese Übertragung wäre jeder
Erbe ein Niemand, und die Idee des Hauses verlöre ihren Sinn.

**Und es gibt Arbeit, die Ansehen kostet.** Manche Gewerbe waren nötig und verachtet —
Henker, Abdecker, Totengräber. Sie zahlten gut, gerade weil sie niemand machen wollte. Das
ist keine Farbe, sondern eine Abwägung: Geld gegen Stand, und wer sie eingeht, kommt schwer
wieder heraus.

### 16. Bürgerrecht und Stand

**Nicht jeder Einwohner ist ein Bürger.** Wer in einer Stadt lebt, wohnt dort — mehr nicht.
Das **Bürgerrecht** ist ein eigener Status, und er entscheidet über zweierlei: Nur ein
Bürger darf **Grundstücke und Gebäude besitzen**, und nur ein Bürger darf **wählen und
gewählt werden**. Wer es nicht hat, kann arbeiten, kaufen, heiraten und leben — aber nur
als Angestellter, nie als Eigentümer.

Das ist der Filter, der bisher fehlte. Mit dem Zuzug aus anderen Städten (Abschnitt 2) wäre
eine Stadt sonst binnen kurzem von Fremden bevölkert, die am Tag ihrer Ankunft mitwählen;
wer eine Wahl gewinnen will, siedelte Leute an. Das Bürgerrecht macht daraus einen Vorgang
mit Dauer.

**Erworben wird es durch Bleiben, nicht durch Zahlen.** Historisch kostete es Geld — hier
nicht, oder nur wenig: „Es zählen Köpfe, nicht Münzen" ist eine der wenigen ausdrücklichen
Festlegungen dieses Konzepts, und ein käufliches Wahlrecht nähme sie zurück. Wer lange
genug in einer Stadt lebt und einen Leumund hat, wird Bürger. Kinder von Bürgern werden es
mit der Volljährigkeit.

**Jeder hat genau einen Hauptwohnsitz.** Man kann sich aufhalten, wo man will, und
irgendwann Besitz an mehreren Orten haben — aber eine Stadt ist die, zu der man **gehört**.
Sie ist keine Frage des Aufenthalts, sondern eine Erklärung, die man abgibt und ändern
kann.

An ihr hängt alles, was nur einmal gelten darf: Man **wählt** dort und nur dort, man wird
dort besteuert, dort steht man in den Listen, und dort ist man Bürger im vollen Sinn.
Ohne diesen einen Anker wäre bei zwei Städten sofort unklar, wo jemand abstimmt und wer
seine Grundsteuer bekommt — und wer beides in mehreren Städten hätte, wäre zweimal so viel
wert wie ein Sesshafter. Genau das soll er nicht sein: **Es zählen Köpfe.**

Den Wohnsitz zu verlegen ist deshalb ein Vorgang mit Gewicht, kein Klick. Was er kostet und
wie lange er dauert, ist noch nicht entschieden (offener Punkt 49); dass er nicht zwischen
zwei Wahlen zu machen ist, schon.

**Das Bürgerrecht erwirbt man in jeder Stadt einzeln — und man darf mehrere haben.** Wer
sich lange genug in einer zweiten Stadt aufhält, wird auch dort Bürger und darf dort
besitzen. Gewählt wird deswegen trotzdem nur an einem Ort: am Hauptwohnsitz. Besitz ist
teilbar, Zugehörigkeit nicht.

Damit wird die Niederlassung in einer zweiten Stadt zu dem, was sie sein sollte — ein
großes, langsames Vorhaben für ein Haus, das schon steht. Ein Handelshaus mit einem Kontor
in Falkenstein ist ein Fernziel, das man über Generationen erreicht, und der Fernhandel
bekommt einen Ort, an dem er sesshaft wird, statt ewig auf fremdem Boden zu gastieren.

**Und eine Stadt darf es verbieten.** Sie kann per Gesetz beschließen, dass Auswärtige bei
ihr kein Bürgerrecht erwerben — wer anderswo seinen Hauptwohnsitz hat, kann hier dann
nichts besitzen.

Das ist dieselbe Abwägung wie beim Zoll, eine Ebene höher: Die Stadt schützt ihre
Handwerker vor fremdem Kapital und schneidet sich zugleich davon ab. Wer zumacht, hält die
Preise für seine eigenen Leute — und sieht zu, wie das Geld in die Nachbarstadt geht, die
offen ist. Wer aufmacht, bekommt Investoren und irgendwann die Frage, wem die Stadt
eigentlich gehört. Historisch war der Ausbürger den Städten ein Dorn im Auge, und sie sind
gegen ihn vorgegangen; im Spiel soll das eine Entscheidung derer sein, die dort wohnen,
und keine Regel des Codes.

**Der Stand steht vor dem Namen.** Jeder Charakter trägt einen **Titel**, der sagt, wo er
steht: _Knecht_, wer ohne Bürgerrecht in fremdem Dienst steht; _Bürger_, wer es erworben
hat; _Meister_, wer sein Handwerk beherrscht und einen Betrieb führt; _Ratsherr_ oder
_Bürgermeister_, wer ein Amt hält. Der Titel ist keine eigene Mechanik, sondern die
Anzeige mehrerer: Er ergibt sich aus Bürgerrecht, Zunftrang und Amt und wird nirgends
gesondert verliehen.

Er ist trotzdem mehr als Zierrat. In einer Liste von zwanzig Namen sagt er auf einen Blick,
mit wem man es zu tun hat — und er macht den Aufstieg sichtbar, den ein Haus über
Generationen nimmt. Vom Knecht zum Bürgermeister ist eine Geschichte, die man an einem Wort
ablesen kann.

### 17. Zünfte

**Zwischen dem Haus und der Stadt fehlt eine Ebene.** Es gibt den einzelnen Charakter und
sein Haus, und es gibt das Gemeinwesen mit seinen Ämtern — dazwischen nichts. Damit hat ein
Spiel für viele Spieler keine Form, in der sich mehrere zusammentun können, außer der Ehe.
Die **Zunft** ist diese Form.

Eine Zunft vereint alle, die dasselbe Handwerk ausüben: Schmiede, Bäcker, Zimmerleute. Sie
hat Mitglieder, eine Kasse, einen gewählten **Zunftmeister** und Regeln, die für ihre
Mitglieder gelten.

**Was sie tut, nimmt anderen Stellen etwas ab, statt Neues zu erfinden:**

- **Sie verleiht die Meisterwürde.** Wer einen Handwerksbetrieb führen will, braucht sie
  (Abschnitt 3) — bisher ohne Instanz, die sie feststellt. Die Zunft prüft und nimmt auf,
  und damit hat die Meisterpflicht ein Gesicht statt einer Zahlenschwelle.
- **Sie ordnet die Lehre.** Lehrling, Geselle, Meister sind Stufen, die sie vergibt. Der
  Weg über das eigene Kind (Abschnitt 10) bleibt — nur endet er künftig vor einer Prüfung.
- **Sie setzt Preise.** Was der Bürgermeister nicht mehr darf, darf sie: Mindestpreise für
  das eigene Gewerbe. Das schützt die Mitglieder vor gegenseitigem Unterbieten und macht
  aus der Zunft sofort einen politischen Akteur, denn die Stadt hätte gern billiges Brot.
- **Sie begrenzt den Zutritt.** Wie viele Schmieden eine Stadt verträgt, entscheidet die
  Zunft, nicht der Markt. Das ist unfreundlich und historisch, und es gibt dem Spiel etwas,
  das ihm fehlt: einen Grund, sich mit anderen Spielern gut zu stellen, bevor man baut.
- **Sie versorgt die Ihren.** Aus der Zunftkasse wird bezahlt, wer in Not gerät — die
  Witwe eines Meisters, der Abgebrannte. Damit hat das Spiel eine Fürsorge, die weder
  Familie noch Stadtkasse ist.

**Der Konflikt mit dem Rat ist der Gewinn.** Zunft und Bürgermeister wollen verschiedene
Dinge: Die Zunft will hohe Preise, wenige Betriebe und einen hohen Zoll; die Stadt will
billige Waren, viele Steuerzahler und offenen Handel. Beide haben Mittel, und beide werden
von denselben Leuten gewählt. Damit entsteht Politik, die nicht nur aus einer Wahl alle
fünf Jahre besteht.

**Eine Korrektur sei angemerkt**: An anderer Stelle stand einmal, die Zunft entstehe von
selbst aus der Lehre und brauche kein eigenes System. Das galt, solange es nur um
Wissensweitergabe ging. Sobald Meisterwürde, Preise und Zutritt dazukommen, braucht es
jemanden, der sie vergibt — und das ist eine Körperschaft mit Mitgliedern und Kasse.

## Was das für das Datenmodell heißt

Das Schema in Phase 1 des Umbauplans bildet die Grundzüge bereits ab, damit sie nicht
nachträglich in jede Tabelle eingezogen werden müssen:

- `dynasty` ist das langlebige Spielerobjekt, `character` das sterbliche. Der User hängt
  an der Dynastie, nicht am Charakter. Weil eine erloschene Dynastie einen Neuanfang
  erlaubt, hat ein User **mehrere** Dynastien über die Zeit — davon genau eine aktive.
- `character` braucht `birthTick`/`deathTick`, eine `role` (gespielt oder NPC), `gender`,
  den Aufenthaltsort sowie `motherId`/`fatherId` und `spouseId` als Selbstreferenzen für
  Stammbaum und Ehe.
- **Adoption trennt Abstammung von Zugehörigkeit.** `motherId`/`fatherId` bleiben, was sie
  sind — wer von wem abstammt, ändert sich durch keinen Rechtsakt. Das Haus steht dagegen
  ohnehin schon als eigene Referenz am Charakter, und genau die wechselt bei der Adoption.
  Erbfolge und Zugehörigkeit hängen am Haus, der Verwandtschaftsbonus der Zuneigung am
  Stammbaum. Ein angenommenes Kind erbt damit wie ein leibliches, startet aber ohne den
  Bonus — es muss sich einleben, und das ist die richtige Beschreibung.
- **Die Ehe braucht eine Vergangenheit.** `spouseId` sagt, wer jetzt verheiratet ist; für
  die Wiederheirat nach dem Tod des Partners genügt das, denn das Feld wird beim Sterben
  frei. Was dabei verlorenginge, ist die Geschichte — mit wem jemand vorher verheiratet
  war. Weil die Kinder ihre Eltern selbst tragen, ist das kein Datenverlust, sondern nur
  eine Auskunft, die eine eigene `marriage`-Tabelle geben könnte. Sie ist der Grund, sie
  später doch einzuführen.
- Das Aktionsbudget hängt am Charakter (`actionPoints`, `lastTickProcessed`), die
  Weltzeit an einer eigenen, einzeiligen Tabelle. Nachgerechnet wird beim Zugriff, nicht
  in einem Durchlauf über alle Charaktere. Den Tick selbst zählt dagegen ein laufender
  Takt hoch — er ist der einzige Hintergrundprozess, den das Spiel braucht, und er treibt
  auch NPC-Handeln, Ereignisse und Wahlperioden.
- `building` trennt Eigentümer (`OwnerCharacterId`) von Nutzern — Bewohner und
  Angestellte hängen als Referenz am Charakter. Dazu `condition`, `lastConditionTick`
  und `level`: Der Verfall wird wie Zuneigung und Aktionsbudget beim Lesen nachgerechnet,
  nicht in einem Durchlauf über alle Gebäude.
- `plot` ist eigenständig, weil das Grundstück den Verfall des Gebäudes überdauert. Es
  hat einen Eigentümer, eine Lage und höchstens ein Gebäude. Wird ein Haus zur Ruine,
  verschwindet das `building`, die `plot`-Zeile bleibt. Dieselbe Tabelle trägt auch die
  Abbauflächen im Umland — ein Grundstück ist entweder Bauland oder Rohstofffläche.
- `region` bildet die Karte: Städte und Umlandflächen als Orte. Jeder `plot` liegt in
  einer Region, jeder Charakter hält sich in einer auf. Eine Stadt führt zusätzlich eine
  **Stadtkasse**.
- Die Karte selbst liegt als **Kachel** darunter: Lage im Sechseckraster, Art der
  Landschaft, und welche Region hier gegebenenfalls liegt. Die Entfernung zwischen zwei
  Orten wird aus den Lagen **gerechnet, nicht gespeichert** — dieselbe Regel wie bei
  Alter, Verfall und Zuneigung: Was sich ableiten lässt, bekommt keine Zeile.

  **Das weicht vom Gebauten ab.** Heute steht dort `regionLink` mit einer Entfernung je
  Verbindung, aus der Zeit der Ortsliste. Der Umbau steht aus und ist ein eigener Punkt
  (offener Punkt 31) — er berührt Reisezeit, Fernhandel und die Erschließung.

- Öffentliche Gebäude sind normale `building`-Zeilen **ohne** Eigentümer-Charakter,
  dafür mit Bezug zur Stadt. Kein zweites Gebäudesystem — dieselben Regeln für Bau,
  Verfall und Renovierung, nur eine andere Kasse.
- `lease` hält Pachtverhältnisse (Fläche, Pächter, Rate, seit wann, bis wann bezahlt).
  Die fällige Zahlung ergibt sich wie alles andere aus den verstrichenen Ticks. Eine
  Abbaufläche hat damit keinen privaten Eigentümer, sondern höchstens einen Pächter.
- `event` protokolliert Zufallsereignisse (Ort, Art, Tick, Auswirkung), damit sie in der
  Stadtchronik sichtbar sind — ein Unglück, von dem niemand erfährt, hat politisch keine
  Folgen.
- `shipment` bildet unterwegs befindliche Ware ab: Herkunft, Ziel, Ankunfts-Tick,
  Eigentümer, Ladung. Passt bruchlos ins Tick-Modell — vor dem Ankunfts-Tick ist die Ware
  schlicht nicht verfügbar.
- **Ein reisender Charakter ist derselbe Fall.** Der Aufenthaltsort steht bereits am
  Charakter; dazu kommen Ziel und Ankunfts-Tick. Solange sie gesetzt sind, ist er
  unterwegs und handelt nicht — dieselbe Prüfung wie bei der Ladung, an derselben Stelle,
  und ohne eigene Tabelle. Erreicht die Weltuhr den Tick, wird der Aufenthalt zum Ziel und
  die Felder werden frei. Nachgerechnet beim Zugriff, wie alles andere auch: Es braucht
  keinen Durchlauf, der Ankünfte einsammelt.
- Ämter hängen an einer Stadt, nicht an der Welt: Jede Stadt wählt ihre eigenen.
- Verkaufsangebote sind ein nullbarer Preis an `plot` beziehungsweise `building` — kein
  eigenes Auktionswesen, passend zum Festpreisprinzip.

- `relationship` (fromCharacterId, toCharacterId, affection) hält die Zuneigung.
  **Nur Abweichungen vom Grundwert werden gespeichert** — bei n Charakteren gäbe es
  sonst n² Zeilen, die zu 95 % nichts aussagen. Der Grundwert ist neutral, bei
  Verwandten der Verwandtschaftsbonus; er wird aus dem Stammbaum **berechnet, nicht
  gespeichert**, und gilt automatisch, sobald keine Zeile existiert. Die Richtung ist
  bewusst asymmetrisch: A kann B schätzen, ohne dass es erwidert wird.
- Der **Ruf** ist eine Zahl am Charakter, das **Ansehen des Hauses** eine an der Dynastie.
  Beide werden fortgeschrieben, nicht gerechnet — sie summieren Taten, und Taten lassen
  sich nicht aus der Zeit ableiten. Damit sind sie die Ausnahme von der Regel, die für
  Alter, Verfall und Zuneigung gilt, und die Ausnahme ist begründet: Wer wissen will, wie
  angesehen jemand ist, müsste sonst sein Leben nacherzählen. Ein Ruf klingt mit der Zeit
  ab — das ist wieder eine Rechnung und braucht nur den Tick der letzten Änderung.
- Das **Bürgerrecht** hängt an der Verbindung von Charakter und Stadt, nicht am Charakter
  allein: Wer fortzieht, ist anderswo kein Bürger. Der **Titel** ist dagegen gar kein
  Datum, sondern eine Anzeige — er wird aus Bürgerrecht, Zunftrang und Amt gebildet, wenn
  jemand ihn liest. Das vorhandene Feld `title` am Charakter trägt heute nur den Standardwert
  „Neuling" und wird nirgends gepflegt; es fällt damit weg oder wird zum berechneten Wert.
- Die **Zunft** ist eine Körperschaft wie die Stadt: eigene Zeile, eigene Kasse,
  Mitgliedschaften als Verbindung zu Charakteren, mit Rang (Lehrling, Geselle, Meister).
  Ihre Ämter laufen über dieselbe Wahlmechanik wie die städtischen — ein Zunftmeister ist
  der bestplatzierte Kandidat der letzten Zunftwahl, der noch lebt.
- Die **Religion** ist ein nullbares Feld am Charakter, kein Verbund: Wer ungetauft ist,
  hat keine. Sie geht als Schicht in den berechneten Grundwert der Zuneigung ein und muss
  deshalb bei jedem Vergleich zur Hand sein — dieselbe Überlegung wie bei der
  Persönlichkeit, und dieselbe Antwort. Der Zeitpunkt der Taufe gehört in die Chronik, nicht
  an den Charakter: Er wird nie gerechnet, nur erzählt.
- **Feste bekommen keine Tabelle.** Welcher Tag im Jahr heute ist, folgt aus dem Tick wie
  Jahreszeit und Jahr; welches Fest darauf fällt, ist eine Liste im Code. Ein Fest ist eine
  Eigenschaft der Zeit, und Eigenschaften der Zeit werden gerechnet.
- `dynastyRelationship` (fromDynastyId, toDynastyId, standing) hält die Fehde oder
  Freundschaft zwischen Häusern — ebenfalls spärlich gespeichert. Sie geht als Schicht in
  den Grundwert der persönlichen Beziehung ein, ist also kein zweites, getrenntes System.
- Der Verfall der Zuneigung braucht keinen eigenen Durchlauf: Aus `lastChangedTick` und
  dem aktuellen Tick lässt er sich beim Lesen ausrechnen. Zeilen, die dabei auf dem
  Grundwert ankommen, werden beim nächsten Schreibzugriff gelöscht. Das hält die Tabelle
  klein, räumt aber nicht von selbst auf, was niemand mehr anfasst — ein gelegentlicher
  Aufräumlauf bleibt sinnvoll. Für `dynastyRelationship` gilt dasselbe: Auch Fehden
  klingen ab, wenn sie niemand nährt.

Später hinzu kommen:

- `item` / `itemTemplate` und `inventory` für Waren, Bedürfnisse und Verschleiß
- `marketOffer` für Angebote, plus Transaktionshistorie
- `employment` für Anstellungsverhältnisse mit Lohn
- `marriage` beziehungsweise ein Partnerfeld am Charakter
- `office`, `election`, `vote` und `law` für die politische Ebene
- Die **Persönlichkeit** als sechs Zahlen direkt am `character` — nicht als eigene
  Tabelle und nicht als JSON-Feld. Jeder Charakter hat genau einen Satz, er entsteht bei
  der Geburt und ändert sich nie; eine Tabelle brächte einen Verbund für jeden Zugriff,
  ein JSON-Feld nähme die Möglichkeit, danach zu sortieren. Und genau das wird gebraucht:
  „Wer ist der Ehrgeizigste in der Stadt" ist die Kandidatensuche für 4.7.
- `skill` (CharacterId, type, level, progress) für das Können. **Ebenfalls spärlich**:
  Wer eine Fertigkeit nie ausgeübt hat, hat dazu keine Zeile — bei einem Dutzend
  Fertigkeiten und einer wachsenden Bevölkerung wäre alles andere Ballast. Der Fortschritt
  innerhalb einer Stufe gehört mitgespeichert, weil er sich anders als Zuneigung und
  Verfall **nicht** aus der Zeit ableiten lässt: Er hängt daran, was jemand getan hat,
  nicht daran, wie lange er es nicht getan hat.

## Getroffene Entscheidungen

**Zeitmodell: Hybrid aus Weltzeit und Aktionsbudget.** Die Welt läuft in Echtzeit auf
einer gemeinsamen Zeitachse — ein globaler Tick treibt Alterung, Produktion, Lohn und
Wahlperioden. Handlungen kosten aber kein Echtzeitfenster, sondern Punkte aus einem
Kontingent, das pro Tick nachwächst und sich bis zu einer Obergrenze ansammelt. Wer
zwei Tage nicht spielt, verliert nicht den Anschluss, muss aber auch nicht im Minutentakt
klicken.

**Die Zeitskala: ein Tick ist eine Stunde, ein Spieljahr zwei Tage.** Daraus ergibt sich
alles Weitere:

| Größe                             | Wert                                    |
| --------------------------------- | --------------------------------------- |
| 1 Tick                            | 1 Stunde Echtzeit                       |
| 1 Spieljahr                       | 50 Ticks = gut 2 Realtage               |
| Lebenserwartung (~70 Jahre)       | ~3360 Ticks = gut 4 Monate              |
| Volljährigkeit (16 Jahre)         | nach 32 Realtagen                       |
| Aktionspunkte                     | 1 je Tick, Deckel 48 (zwei Tage Vorrat) |
| Wahlperiode (5 Jahre)             | 10 Realtage                             |
| Verfall bis zur Ruine (~25 Jahre) | 50 Realtage, Warnung ab der Hälfte      |

Der Stundentakt macht die Aktionspunkte unmittelbar verständlich — einer pro Stunde — und
der Deckel von 48 entspricht genau den zwei Tagen Abwesenheit, die niemanden abhängen
sollen. Die Jahreslänge ist die eigentliche Stellschraube: Bei einem Spieljahr pro
Realtag stirbt der Charakter, bevor sich ein Betrieb amortisiert; bei vier Tagen erlebt
ein Spieler im ersten Jahr nur einen einzigen Erbfall. Zwei Tage lassen Raum, ein Leben
aufzubauen, und trotzdem mehrere Generationen im Jahr zu erleben.

**Die Zeit läuft weiter, auch wenn niemand spielt.** Die Welt ist kein Spielstand, der
beim Aufrufen fortgesetzt wird — sie hat einen eigenen Takt. Das ist die Voraussetzung
dafür, dass Wirtschaft, Wahlen und Nachbarschaft überhaupt eine gemeinsame Gegenwart
haben.

Daraus folgt eine Zweiteilung, die für die Umsetzung wichtiger ist als für das Spiel:
Was **einen einzelnen Charakter** betrifft — nachwachsende Aktionspunkte, verfallende
Zuneigung, verfallende Gebäude, auflaufende Pacht —, wird beim Zugriff aus den
verstrichenen Ticks nachgerechnet. Was **die Welt als Ganzes** betrifft — der Tick selbst,
das Handeln der NPCs, Zufallsereignisse, das Ende einer Wahlperiode —, braucht einen
laufenden Takt, der auch dann arbeitet, wenn niemand angemeldet ist. Ein NPC, den niemand
anschaut, muss trotzdem Brot kaufen; sonst bricht die Nachfrage weg, auf der die
Wirtschaft steht.

**War der Server aus, wird die verpasste Zeit übersprungen, nicht nachgerechnet.** Die
Weltuhr springt auf die Echtzeit vor — sonst drifteten Spielzeit und Kalender mit jedem
Ausfall weiter auseinander —, aber niemand bekommt etwas für sie: Kein Aktionspunkt
wächst nach, kein Gebäude verfällt, kein NPC handelt. Die Ausfallzeit hat für alles
Handelnde schlicht nicht stattgefunden.

Zweierlei folgt daraus, was leicht zu verwechseln ist. Erstens ist das etwas anderes, als
den Rückstand aller einzukassieren: Wer zwei Tage nicht hereingeschaut hat, während der
Server lief, hat seine Aktionspunkte rechtmäßig angesammelt und behält sie — verschoben
wird nur **um** die Ausfallzeit, nicht **auf** die neue Weltzeit. Zweitens altert man
trotzdem: Das Alter hängt am Geburts-Tick und damit an der Uhr. Ein Charakter, dessen
Alter beim Ausfall stehenbliebe, machte die Generationenfolge von der
Serververfügbarkeit abhängig.

Dass übersprungen und nicht nachgerechnet wird, ist die billigere Wahl — ein
Bulk-Update, gleich teuer für eine Stunde wie für eine Woche, ohne Schleife und ohne
Deckelung. Sie ist auch die ehrlichere: Eine Welt, die nach dem Neustart drei Tage in
Zeitraffer abarbeitet, träfe Entscheidungen für Spieler, die dabei nicht zusehen
konnten.

**Tod ohne Erben: Die Dynastie erlischt.** Stirbt der Spielercharakter kinderlos, ist
das Haus am Ende; der Spieler beginnt mit einer neuen Dynastie bei null, sein Besitz
fällt an die Stadt. Harter Schnitt, maximaler Druck auf die Fortpflanzung — sie ist damit
tatsächlich die zentrale Überlebensmechanik und nicht nur eine Empfehlung.

**NPCs handeln so oft wie Spielercharaktere.** Sie haben dasselbe Aktionsbudget, dieselben
Kosten und dieselben Regeln — es gibt keine eigene Taktung für die Simulation. Wer nichts
mehr hat, tut nichts mehr, und damit drosselt sich der Weltlauf von selbst. Ein zweiter
Satz Regeln für NPCs würde von dem der Spieler abdriften, und dann wüsste niemand mehr,
ob eine Beobachtung an der Welt liegt oder an zwei verschiedenen Rechnungen.

**NPCs sind indirekt anweisbar.** Man kann eigene Kinder anstellen, verheiraten oder ins
Amt schicken, steuert sie aber nicht direkt. Sie handeln nach eigenen Regeln. Damit
bleibt der eine sterbliche Spielercharakter der Mittelpunkt, statt dass man faktisch ein
halbes Dutzend Figuren parallel spielt.

**Wahlrecht: Jeder Charakter stimmt ab, NPCs nach Zuneigung.** Die Stimme hängt an der
Person, nicht an der Dynastie, und NPCs entscheiden anhand ihrer Beziehung zu den
Kandidaten. Dass damit Hausmacht zählt — viele Kinder, viele gut behandelte Angestellte —
ist gewollt und mittelalterlich stimmig.

**NPCs sind vollwertige Marktteilnehmer.** Sie müssen ihre Bedürfnisse genauso decken wie
Spieler: essen, sich kleiden, wohnen. Damit entsteht die Nachfrage von selbst und die
Wirtschaft läuft auch bei wenigen aktiven Spielern weiter — ein künstlicher Preisboden
erübrigt sich. Voraussetzung: NPCs haben eigenes Geld (Lohn) und geben es aus.

**Zuneigung verfällt Richtung Neutralität.** Liebe wie Hass wollen genährt werden —
ungepflegt wird man sich mit der Zeit schlicht egal. Beziehungen sind damit kein einmal
erworbener Besitz, sondern laufender Aufwand, und keine Dynastie kann ihre Machtbasis
dauerhaft einfrieren. Darüber liegt ein **Verwandtschaftsbonus**: Verwandte finden
einander von Haus aus sympathisch, ohne dass dafür interagiert werden müsste.

**Lohn hat eine Deckung.** Wer Angestellte hat, zahlt sie aus seiner eigenen Kasse; ist
sie leer, arbeitet niemand. Damit entsteht Geld nicht mehr aus dem Nichts, sondern
wechselt den Besitzer — und ein Betrieb, der sich nicht trägt, verliert seine Leute,
bevor er seinen Eigentümer ruiniert. Was Angestellte herstellen, gehört dem Betrieb; was
sie bekommen, ist Lohn.

**Jedes Handelshaus ist zugleich Verkaufsstelle.** Wer produziert, verkauft dort, wo er
produziert — der Marktplatz ist kein zweites System, sondern ein öffentliches Gebäude mit
einer anderen Regel darüber, wer ein Preisschild aushängen darf: im eigenen Laden nur der
Eigentümer, am Markt jeder, gegen Standgeld an die Stadt. Damit hat ein eigenes Haus
einen Wert über die Produktion hinaus, und wer noch keines hat, kommt trotzdem zum Zug.

**Die Pacht endet mit dem Pächter.** Stirbt er, fällt die Fläche an die Stadt zurück und
wird neu vergeben — der Erbe muss sich bewerben wie jeder andere. Genau das unterscheidet
Pacht von Eigentum: Wer den Wald hält, hält ihn nicht über Generationen, und die Politik
hat regelmäßig etwas zu verteilen.

**Not nimmt zuerst Kraft, dann Leben.** Wer hungert, sammelt weniger Aktionspunkte; erst
bei anhaltender Not steigt das Sterberisiko, und dann deutlich. Die Staffelung ist
Absicht: Sie gibt eine Vorwarnung, die der Spieler selbst verschuldet hat, statt ihn ohne
Ansage zu töten — bei Permadeath der Unterschied zwischen einer harten Regel und einer
unfairen. Wer gar nichts mehr isst, stirbt binnen etwa eines Spieltages, und zwar in
jedem Alter: Die Not hat ein eigenes Risiko und ist kein Faktor auf das des Alters.

**Vier Realtage ohne Nahrung.** Essen ist etwas, das man alle paar Tage regelt, nicht
täglich — wer übers Wochenende nicht hereinschaut, kommt nicht hungernd zurück. Dieselbe
Größenordnung wie das Aktionsbudget, das über zwei Tage anwächst.

**Jeder Charakter hat eine Persönlichkeit, und sie ändert sich nie.** Sechs Achsen,
vererbt von den Eltern mit Streuung, festgelegt bei der Geburt. Aus ihnen leiten NPCs ab,
was sie wollen — statt aus einer Regel je Lage. Beim Spielercharakter beschreibt sie, statt
zu zwingen, macht die Erbenwahl aber zu mehr als einer Frage des Geburtsdatums.

**Kinder kommen von selbst, aber nur wo Platz ist.** Ein verheiratetes Paar im
fruchtbaren Alter bekommt Nachwuchs, ohne dass jemand einen Knopf drückt — dieselbe Regel
für Spieler und NPCs, sonst laufen zwei Simulationen nebeneinander her. Gebremst wird
über den **Wohnraum**: Kinder kommen nur, wo ein Platz frei ist. Damit hängt die
Geburtenrate an den Bauwerken, knappes Bauland wirkt bis in die Kinderstube, und eine
volle Stadt stagniert von selbst, statt bis zum Kollaps zu wachsen.

**Können wird nicht vererbt, sondern gelehrt.** Fertigkeiten sterben mit dem Charakter;
weitergegeben wird nur, was der Meister zu Lebzeiten unterrichtet hat, und Lehre kostet
beide Seiten Zeit. Damit ist die Ausbildung des Erben eine Investition wie jede andere —
und ein plötzlicher Tod trifft nicht nur den Besitz, sondern das Handwerk.

**Spezialisierung kommt aus steigendem Aufwand, nicht aus einer Obergrenze.** Jede Stufe
kostet deutlich mehr Übung als die vorige. Jeder kann alles ein bisschen, niemand alles
gut — ohne dass eine Regel vorschreibt, was zu wählen ist.

**Persönliche Beziehungen werden nicht vererbt — Hausbeziehungen schon.** Ein Kind
startet gegenüber jedem Fremden bei null und muss sich seine Verbündeten selbst
erarbeiten. Was es erbt, ist der Stand seines Hauses zu den anderen Häusern. Das hält
die Beziehungstabelle bei jeder Geburt schlank und trennt sauber, was persönlich ist
und was Familiensache.

**Mehrfachaccounts sind verboten.** Weil Stimmen, Arbeitskraft und Nachfrage an Personen
hängen, wäre ein zweiter Account sonst schlicht die stärkste Spielstrategie. Das ist eine
Regel, kein Feature: Sie gehört in die Spielregeln und in die Nutzungsbedingungen,
durchgesetzt wird sie durch Auffälligkeitsprüfung und Sperre. Praktische Folge fürs
Projekt: Registrierungs- und Anmeldedaten müssen so protokolliert werden, dass Verdacht
überhaupt prüfbar ist — und das wiederum gehört in die Datenschutzerklärung.

**NPCs unterliegen denselben Regeln wie Spielercharaktere.** Ein NPC hat kein
unerschöpfliches Geld: Er arbeitet für Lohn, muss seine Hütte unterhalten und kann
deshalb schlicht nicht jeden Preis für Brot zahlen. Seine Zahlungsbereitschaft ergibt
sich aus dem, was nach den Fixkosten übrig ist — ein Getreidemonopol kann die Stadt
also nicht beliebig auspressen, sondern stößt an echte Budgets. Kein Sonderfall-Code
für NPCs: dieselben Bedürfnisse, dieselben Kosten, dieselbe Kasse.

**Gehandelt wird zu Festpreisen aus dem Laden heraus.** Der Verkäufer legt den Preis
fest und stellt die Ware in seinen Betrieb; wer vorbeikommt, kauft oder lässt es. Preise
bewegen sich, weil Verkäufer sie anpassen — kein Orderbuch, kein Matching.

Ausschlaggebend ist nicht nur das Setting, sondern dass das Spiel asynchron läuft: Bei
einem Tick-Modell sind selten viele gleichzeitig online, und ein Orderbuch braucht
Gegenparteien in derselben Stunde. Ein Laden verkauft auch nachts. Nebenbei nutzt das
die Gebäudemechanik, die es schon gibt — man geht zum Betrieb eines anderen Spielers.

NPCs kaufen nach einer einfachen Regel: das billigste erreichbare Angebot, das ihr
Budget nach Fixkosten hergibt. Auktionen für Einzelstücke (Grundstücke, Ämter, Erbmasse)
lassen sich später ergänzen, ohne den Alltagshandel anzufassen.

**Hausbeziehungen entstehen auf zwei Wegen.** Zum einen wachsen sie **natürlich**: Jede
persönliche Beziehung zwischen Mitgliedern zweier Häuser schiebt deren Verhältnis um
einen Bruchteil mit. Wo sich über Jahre genug Leute in die Haare geraten, entsteht eine
Fehde, ohne dass jemand sie ausgerufen hätte.

Zum anderen kann das **Familienoberhaupt — also der Spielercharakter — sie erklären**:
Fehde ansagen, Frieden schließen, ein Bündnis eingehen. Das ist eine sichtbare,
öffentliche Handlung mit sofortiger Wirkung auf alle Mitglieder, sie kostet
Aktionspunkte, und sie ist die eigentliche Außenpolitik einer Dynastie.

Beides zusammen heißt: Ein Haus kann in eine Feindschaft hineinrutschen, ohne sie
gewollt zu haben — und ein Oberhaupt kann sie beenden oder eskalieren. Genau die
Dynamik, die verfeindete Adelshäuser interessant macht.

## Zuschnitt: was zuerst gebaut wird

Die Welt ist damit größer, als sie in einem Zug zu bauen wäre. Der Zuschnitt trennt
deshalb, was von Anfang an im **Datenmodell** stehen muss, von dem, was als **Spielinhalt**
später dazukommt — das Modell nachträglich umzubauen ist teuer, ein weiterer Ort auf der
Karte dagegen billig.

Von Anfang an im Modell: `region` mit Lage auf der Karte, `plot` mit Regionsbezug und
Typ, Stadtkasse, Gebäude ohne privaten Eigentümer. Auch wenn die Welt zunächst nur aus
einer Stadt und ein paar Umlandflächen besteht — die Struktur muss die zweite Stadt schon
hergeben.

Als Spielinhalt später: Fernhandel zwischen Städten, Gründung neuer Städte, Erschließung
neuen Baulands, der volle Katalog öffentlicher Gebäude. Das sind Fernziele für etablierte
Dynastien und werden erst gebraucht, wenn überhaupt jemand so weit ist.

## Offene Entscheidungen

Sie stehen vollständig in **`OFFENE_PUNKTE.md`**, jeweils mit dem Zeitpunkt, zu dem sie
spätestens fallen müssen — von der Zeitskala (fällig noch vor Phase 1) über die Folgen
ungedeckter Bedürfnisse, Krankheiten und Kämpfe bis zu Wahlalter, Steuerarten und den
Startbedingungen für neue Spieler.

Hier bewusst nicht wiederholt, damit die Listen nicht auseinanderlaufen.

**Jeder Charakter gehört zu einem Haus — ohne Ausnahme.** Auch die Fremden, die die Welt
zum Start bevölkern, bekommen eines; jeder für sich, denn zwei Fremde mit demselben
Nachnamen wären eine Verwandtschaft, die es nicht gibt. Damit greift die mittlere Schicht
der Zuneigung überall, NPC-Familien können aussterben, und ein Spieler kann sich mit einer
NPC-Familie verfeinden.

**Der Hausname ist der Nachname.** Es gibt keine zweite Stelle, an der ein Familienname
stünde: Wer zu welchem Haus gehört, ist dieselbe Auskunft wie „wie heißt er mit
Nachnamen". Angezeigt wird der volle Name überall dort, wo Menschen verschiedener Häuser
nebeneinanderstehen — Chronik, Leuteliste, Rathaus, Markt, Belegschaft. Wo der
Zusammenhang das Haus schon geklärt hat, genügt der Vorname: bei den eigenen Kindern, im
eigenen Stammbaum.
