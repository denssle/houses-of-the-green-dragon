# Houses of the Green Dragon

Ein browserbasiertes Mittelalter-Spiel, in dem man kein Leben spielt, sondern ein Haus.

Der eigene Charakter ist sterblich; wenn er stirbt, übernimmt eines seiner Kinder. Wer zu
Lebzeiten keine Nachkommen bekommen hat, dessen Dynastie erlischt. Um dahin überhaupt zu
kommen, braucht es das Elementare: ein Dach über dem Kopf, Arbeit oder einen eigenen
Betrieb, Nahrung und Kleidung. Wer weiter kommt, stellt Leute ein, verpachtet, handelt
zwischen Städten — und stellt sich zur Wahl, denn wer ein Amt hält, macht die Gesetze für
alle anderen.

## Stand

**Prototyp, nicht spielbar.** Registrierung, Anmeldung, Dynastie und Charakteranlage
funktionieren im Ansatz; Gebäude sind begonnen. Die Entwicklung ruhte und wird gerade
wieder aufgenommen — beginnend mit dem Umbau der Persistenz, denn der jetzige
Dateispeicher kann nicht funktionieren (BigInt lässt sich nicht als JSON serialisieren).

## Dokumente

- **[KONZEPT.md](KONZEPT.md)** — was das Spiel werden soll: die sechs Säulen und alle
  getroffenen Entscheidungen
- **[UMBAU.md](UMBAU.md)** — der Weg dorthin in fünf Phasen, ausgehend vom heutigen Stand
- **[OFFENE_PUNKTE.md](OFFENE_PUNKTE.md)** — was noch zu entscheiden oder zu entwerfen
  ist, jeweils mit Fälligkeit

## Technik

SvelteKit 2 mit Svelte 5, TypeScript und Tailwind 4. Serverseitig kommen mit dem Umbau
Sequelize und MariaDB dazu (SQLite in Entwicklung und Tests), Migrationen über umzug,
Tests mit Vitest und Playwright — dieselbe Architektur wie im Nachbarprojekt `festival`.

## Entwicklung

Voraussetzung ist Node 22 oder neuer.

```bash
npm install
npm run dev
```

Weitere Skripte:

```bash
npm run test:unit # Tests (Vitest, alle src/**/*.spec.ts)
npm run build     # Produktionsbuild
npm run preview   # Produktionsbuild lokal ansehen
npm run check     # Typprüfung (svelte-check)
npm run lint      # Prettier und ESLint prüfen
npm run format    # Formatierung schreiben
```

`npm run check` meldet derzeit sieben Fehler. Sie stammen alle aus dem `bigint`-Problem
des Prototyps und verschwinden mit Phase 1.3 des Umbaus.

Die Anwendung läuft später unter einem Unterpfad (`paths.base`), ausgeliefert auf einen
Uberspace über GitHub Actions.
