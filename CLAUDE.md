# Arbeitsregeln für dieses Projekt

Was `KONZEPT.md`, `ENTWICKLUNG.md` und `OFFENE_PUNKTE.md` für das Spiel sind, ist diese Datei
für die Arbeit daran: die Regeln, die zwischen den Sitzungen gelten sollen.

## Die Versionsnummer wird mitgeführt

`package.json` trägt die Version, und der Bereitschaftscheck (`/api/health`) gibt sie
aus. Damit lässt sich nach jedem Deploy in einem Blick sagen, **was dort eigentlich
läuft** — vorausgesetzt, die Zahl wird gepflegt. Sonst ist sie schlimmer als keine: Sie
behauptet eine Auskunft, die sie nicht gibt.

**Das Schema ist `0.<Phase>.<Schritt>`:**

- **Phase** ist die Phase aus `ENTWICKLUNG.md` — zurzeit 5. Mit dem Beginn von Phase 6
  würde daraus `0.6.0`; wahrscheinlicher ist, dass vorher `1.0.0` fällt, denn Phase 5 ist
  die letzte vor dem öffentlichen Betrieb (siehe unten).
- **Schritt** zählt die abgeschlossenen Umbauschritte innerhalb der Phase (5.38, 5.39,
  5.40 — jeder ist einer). Die Zahl ist fortlaufend und muss nicht mit der Schrittnummer
  übereinstimmen; sie soll nur steigen.
- **Fehlerbehebungen und Feinschliff** ohne eigenen Umbauschritt erhöhen ebenfalls den
  letzten Teil. Eine Version, die zweimal dasselbe bedeutet, ist keine.

`1.0.0` bleibt dem Tag vorbehalten, an dem das Spiel öffentlich läuft — nicht nur
technisch erreichbar, sondern für Fremde spielbar. **Was danach gilt, ist offen**:
`ENTWICKLUNG.md` schlägt vor, jede weitere Phase als Minor zu führen (Phase 6 wird
`1.1.x`). Das gehört entschieden, bevor der Tag da ist.

**Wann sie steigt:** in demselben Commit, der die Änderung bringt. Ein nachgereichter
Versions-Commit ist eine Zeile, die niemand mit dem Inhalt verbindet.

**Wann nicht:** bei reinen Dokumentänderungen (`ENTWICKLUNG.md`, `KONZEPT.md`,
`OFFENE_PUNKTE.md`, diese Datei). Sie ändern nichts an dem, was auf dem Server läuft.
