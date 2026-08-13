# Deployment

Die App läuft auf dem Uberspace als eigenständiger Node-Prozess (`adapter-node`,
`node build`), gehalten vom Supervisor, erreichbar unter
**https://enzlor.uber.space/houses** auf **Port 5174**.

Sie liegt in `~/houses-app`, **nicht** in `~/html`: Der Docroot gehört einem anderen
Projekt, dessen rsync mit `--delete` und ohne `--exclude` arbeitet — genau so ist bei
Festival schon einmal eine Anwendung samt `.env` verschwunden. Nebenbei wäre dort der
komplette Quellbaum öffentlich lesbar.

Port 5173 ist von Festival belegt. Deshalb 5174, und deshalb steht die Zahl an drei
Stellen, die zusammenpassen müssen: `package.json` (`start-server`),
`.github/workflows/deploy.yml` (Bereitschaftscheck) und `uberspace web backend set`.

## Was der Workflow tut

`.github/workflows/tests.yml` läuft bei jedem Push auf `main`: Typprüfung, Lint,
Unit-Tests und der Rauchtest gegen eine echte MariaDB. `deploy.yml` hängt per
`workflow_run` an dessen **Gesamtergebnis** — schlägt der Rauchtest fehl, wird nicht
ausgeliefert.

Der Deploy sichert zuerst die Datenbank, spielt dann per rsync ein, installiert auf dem
Host die Produktionsabhängigkeiten, startet den Dienst neu und wartet auf
`/houses/api/health`.

## Einmalige Einrichtung auf dem Host

Alles per SSH als `enzlor`.

### 1. Node-Version

```
uberspace tools version show node
uberspace tools version use node 22
```

Muss zur `node-version` in den Workflows passen — `build/` wird gebaut und ungebaut
übertragen, aber `npm ci --omit=dev` kompiliert auf dem Host native Module (mariadb).

### 2. Datenbank

Uberspace erlaubt nur Datenbanken mit dem Benutzernamen als Präfix. Der Code setzt den
Namen als `MARIA_DB_USER + '_' + MARIA_DB_NAME` zusammen (`src/lib/db/sequelize.ts`),
aus `houses` wird also `enzlor_houses`:

```
mysql -e "CREATE DATABASE enzlor_houses CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "SHOW DATABASES;"
```

Tabellen anlegen ist nicht nötig — `startDB()` führt beim ersten Start die Migrationen
aus und danach den Weltaufbau.

### 3. Verzeichnis und `.env`

```
mkdir -p ~/houses-app
grep -A2 '\[client\]' ~/.my.cnf        # Benutzer und Passwort stehen hier
cat > ~/houses-app/.env <<'EOF'
MARIA_DB_USER=enzlor
MARIA_DB_PASSWORD=…
MARIA_DB_NAME=houses
EOF
chmod 600 ~/houses-app/.env
```

Diese Datei lebt **nur** auf dem Server. Sie ist in `.gitignore` und im rsync per
`--exclude=".env"` vor `--delete` geschützt. Fehlt sie, bricht der Deploy mit einer
klaren Meldung ab, statt in ein Zeitlimit zu laufen.

`MARIA_DB_NAME` darf hier **nicht** `dev` sein: Das ist das ausdrückliche Bekenntnis zu
SQLite und würde die Welt in eine Datei schreiben, die der nächste Deploy wegräumt.

**Festivals `.env` ist keine Vorlage zum Kopieren.** Benutzer und Passwort stimmen —
Uberspace vergibt genau einen MariaDB-Benutzer je Account, beide Projekte teilen ihn
sich. Aber Festival trägt dort `MARIA_DB_NAME=prod`, und das ergibt `enzlor_prod`. Eins
zu eins übernommen liefe dieses Spiel in Festivals Datenbank: Sequelize legte seine
Tabellen daneben, die Migrationen schrieben in ein fremdes Schema, und Festivals
Sicherungen enthielten plötzlich fremde Daten. Die einzige Zeile, die sich unterscheiden
muss, ist zugleich die einzige, die die beiden Projekte auseinanderhält.

### 4. Supervisor-Dienst

```
cat > ~/etc/services.d/houses.ini <<'EOF'
[program:houses]
directory=%(ENV_HOME)s/houses-app
command=npm run start-server
autostart=yes
autorestart=yes
startsecs=30
stopasgroup=true
killasgroup=true
EOF

supervisorctl reread
supervisorctl update
supervisorctl status houses
```

`start-server` setzt `PORT=5174`, `ORIGIN=https://enzlor.uber.space` und lädt die `.env`
per `node --env-file` — `node build` liest sie, anders als `vite dev`, nicht von selbst.

`ORIGIN` ist kein Beiwerk: Ohne die Variable hält SvelteKit die Anfrage für
`http://localhost:5174`, der `Origin`-Header des Browsers passt dann nicht dazu, und
**jedes Formular** wird mit 403 abgewiesen. Der bei Festival gewählte Ausweg
(`csrf.trustedOrigins: ['*']`) schaltet stattdessen den Schutz ab; hier steht nur die
richtige Herkunft, der Schutz bleibt an.

`startsecs=30` gibt dem ersten Start Luft für Migrationen und Weltaufbau.

### 5. Webserver

```
uberspace web backend set /houses --http --port 5174
uberspace web backend list
```

**Ohne `--remove-prefix`**: Der Präfix soll unverändert an die App durchgereicht werden,
weil `paths.base` in `svelte.config.js` genau ihn erwartet.

### 6. GitHub-Secrets

Secrets gelten pro Repository, für dieses hier also neu setzen. Über die Zwischenablage
gehen beim Schlüssel regelmäßig Zeilenumbrüche verloren (`error in libcrypto`), deshalb
aus der Datei:

```
gh secret set UBERSPACE_HOST --body enzlor.uber.space
gh secret set UBERSPACE_USER --body enzlor
gh secret set DEPLOY_KEY_PRIVATE < ~/sync/Sonstiges/Schlüssel/ssh-keys/*uberspace
```

Der zugehörige öffentliche Schlüssel muss in `~/.ssh/authorized_keys` auf dem Uberspace
stehen — für Festival liegt er dort schon, derselbe Schlüssel trägt auch dieses Projekt.

## Nachsehen, wenn etwas klemmt

```
curl -s https://enzlor.uber.space/houses/api/health
supervisorctl status houses
supervisorctl tail -100 houses
supervisorctl tail -100 houses stderr
```

Der Bereitschaftscheck ist die erste Adresse: Er antwortet mit 503, wenn die Datenbank
nicht erreichbar ist oder eine Migration aussteht, und nennt im Erfolgsfall Dialekt und
Stand der Weltuhr. Bleibt `currentTick` über Stunden stehen, läuft der Takt nicht — dann
ist der Prozess zwar da, aber die Welt steht still.

## Datensicherung

Der Deploy legt vor jedem Einspielen einen Dump unter `~/backups/houses/` ab und hält
die letzten 14 Stück. Das ist die halbe Miete; ein regelmäßiger Cron-Dump und ein
**ausprobierter** Rückweg fehlen noch — beides gehört zu Phase 5.3.

Die Produktionsdatenbank ist das wertvollste Artefakt des Projekts: Sie enthält
Generationen von Spielzeit, die sich nicht wiederherstellen lassen.
