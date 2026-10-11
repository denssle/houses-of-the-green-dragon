# Arbeitsregeln für dieses Projekt

Was `KONZEPT.md`, `ENTWICKLUNG.md` und `OFFENE_PUNKTE.md` für das Spiel sind, ist diese Datei
für die Arbeit daran: die Regeln, die zwischen den Sitzungen gelten sollen.

## Die Versionsnummer wird mitgeführt

`package.json` trägt die Version, und der Bereitschaftscheck (`/api/health`) gibt sie
aus. Damit lässt sich nach jedem Deploy in einem Blick sagen, **was dort eigentlich
läuft** — vorausgesetzt, die Zahl wird gepflegt. Sonst ist sie schlimmer als keine: Sie
behauptet eine Auskunft, die sie nicht gibt.

**Das Schema ist SemVer, und wir bleiben bei `0.x`** (seit dem 11.10.2026). Bis dahin hieß
es `0.<Phase>.<Schritt>` mit `1.0.0` als Stichtag für den öffentlichen Betrieb — beides
ist aufgegeben, siehe die Bauordnung in `OFFENE_PUNKTE.md`. Ab `0.5.111` gilt:

- **Patch** (`0.5.112`): Fehlerbehebungen, Feinschliff, Balancing ohne neues System,
  Beschleunigung und Werkzeug, die nichts am Spiel ändern.
- **Minor** (`0.6.0`): ein Schritt, der etwas Neues ins Spiel bringt — eine Handlung, ein
  Gebäude, ein Amt, eine Regel, die es vorher nicht gab.
- **Major** gibt es unter `1.0.0` nicht. Ob und wann `1.0.0` fällt, ist offen und an
  keinen Stichtag gebunden.

Eine Version, die zweimal dasselbe bedeutet, ist keine — jede Änderung am Laufenden hebt
die Zahl.

**Schritte heißen nach ihrer Version.** Bis `0.5.110` trugen Umbauschritte eine eigene
Nummer (5.38, 5.106), auf die Code und Dokumente verweisen. Die alten bleiben, wie sie
sind; neue Verweise nennen die Version, mit der etwas kam (`0.5.111`, `0.6.0`).

**Wann sie steigt:** in demselben Commit, der die Änderung bringt. Ein nachgereichter
Versions-Commit ist eine Zeile, die niemand mit dem Inhalt verbindet.

**Wann nicht:** bei reinen Dokumentänderungen (`ENTWICKLUNG.md`, `KONZEPT.md`,
`OFFENE_PUNKTE.md`, diese Datei). Sie ändern nichts an dem, was auf dem Server läuft.
