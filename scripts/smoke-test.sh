#!/usr/bin/env bash
#
# Produktions-Rauchtest: startet das GEBAUTE Artefakt (build/) genau so, wie der
# Supervisor es auf dem Uberspace startet, gegen eine echte MariaDB.
#
# Warum eigens: Die Vitest-Suite läuft über VITEST=true gegen SQLite im Arbeitsspeicher
# und fasst damit weder `node build` noch den MariaDB-Zweig von startDB() an. Alles,
# was nur dort schiefgehen kann, fiele sonst erst in Produktion auf:
#
#   - .env wird von `node build` nicht geladen (anders als von `vite dev`)
#   - eine Laufzeit-Abhängigkeit steckt fälschlich in devDependencies
#   - eine Migration läuft nur gegen SQLite, nicht gegen MariaDB
#   - der Weltaufbau ist beim zweiten Start nicht wiederholbar
#
# Voraussetzungen: erreichbare MariaDB, gebautes build/, `mysql`-Client im PATH.
# Lokal etwa mit:
#   docker run -d --rm -p 3306:3306 -e MARIADB_ROOT_PASSWORD=root \
#     -e MARIADB_DATABASE=houses_prod -e MARIADB_USER=houses \
#     -e MARIADB_PASSWORD=housespw --name houses-smoke mariadb:11
#   npm run build && bash scripts/smoke-test.sh

set -euo pipefail

# Der effektive Datenbankname ist MARIA_DB_USER + '_' + MARIA_DB_NAME (siehe
# sequelize.ts), hier also "houses_prod". MARIA_DB_NAME darf NICHT 'dev' sein — sonst
# schaltet die App auf SQLite um und der Test prüfte nichts.
DB_USER="${MARIA_DB_USER:-houses}"
DB_PASSWORD="${MARIA_DB_PASSWORD:-housespw}"
DB_NAME="${MARIA_DB_NAME:-prod}"
DB_HOST="${DB_HOST:-127.0.0.1}"
FULL_DB_NAME="${DB_USER}_${DB_NAME}"
HEALTH_URL="http://localhost:5174/houses/api/health"

server_pid=""
env_backup=""

cleanup() {
	kill_server
	# Eine lokal vorhandene .env unbedingt zurückspielen — der Test schreibt eine eigene
	# und würde die Entwicklungskonfiguration sonst zerstören.
	if [[ -n "$env_backup" && -f "$env_backup" ]]; then
		mv -f "$env_backup" .env
		echo "==> Vorhandene .env wiederhergestellt."
	fi
}
trap cleanup EXIT

fail() {
	echo "FEHLGESCHLAGEN: $*" >&2
	echo "--- Serverlog ---" >&2
	cat smoke-server.log >&2 || true
	exit 1
}

mysql_exec() {
	mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$FULL_DB_NAME" -e "$1"
}

start_server() {
	echo "--- Serverstart ---" >> smoke-server.log
	# Bewusst über `npm run start-server` — genau das Kommando des Supervisors, samt
	# --env-file=.env. setsid gibt dem Server eine eigene Prozessgruppe, damit unten die
	# ganze Gruppe beendet werden kann: npm startet node über eine sh-Zwischenschicht,
	# node ist also ein Enkel und überlebt ein `pkill -P` auf den npm-Prozess.
	if command -v setsid > /dev/null 2>&1; then
		setsid npm run start-server >> smoke-server.log 2>&1 &
	else
		npm run start-server >> smoke-server.log 2>&1 &
	fi
	server_pid=$!
}

kill_server() {
	if [[ -n "$server_pid" ]]; then
		kill -- -"$server_pid" 2>/dev/null || true
		pkill -P "$server_pid" 2>/dev/null || true
		kill "$server_pid" 2>/dev/null || true
		wait "$server_pid" 2>/dev/null || true
		server_pid=""
	fi
	pkill -f "node --env-file=.env build" 2>/dev/null || true
}

stop_server() {
	kill_server
	wait_for_port_free
}

# Wartet, bis auf Port 5174 nichts mehr antwortet. Bewusst `curl` OHNE --fail: Ein
# laufender Server, der 503 meldet, ist ebenfalls belegt — mit --fail gälte er
# fälschlich als beendet.
wait_for_port_free() {
	local attempt
	for attempt in $(seq 1 20); do
		if ! curl -s -o /dev/null "$HEALTH_URL" 2>/dev/null; then
			return 0
		fi
		sleep 1
	done
	fail "Port 5174 ist noch belegt — der vorherige Serverprozess läuft weiter"
}

# Wartet auf HTTP 200. Bricht sofort ab, wenn der Prozess schon gestorben ist — sonst
# läuft der Test sinnlos ins Zeitlimit.
wait_for_health() {
	local attempt
	for attempt in $(seq 1 40); do
		if ! kill -0 "$server_pid" 2>/dev/null; then
			fail "Serverprozess ist beendet (nach ~$((attempt * 2))s)"
		fi
		if curl -fsS "$HEALTH_URL" > smoke-health.json 2>/dev/null; then
			echo "  bereit nach ~$((attempt * 2))s: $(cat smoke-health.json)"
			return 0
		fi
		sleep 2
	done
	fail "/api/health wurde nicht bereit"
}

# Prüft ein Feld der Antwort ohne jq (im Runner nicht garantiert vorhanden).
assert_health_field() {
	local field="$1" expected="$2" body
	body="$(cat smoke-health.json)"
	if [[ "$body" != *"\"${field}\":${expected}"* ]]; then
		fail "Antwort des Bereitschaftschecks: erwartet ${field}=${expected}, war: ${body}"
	fi
}

# Liest eine Zahl aus der Antwort, ohne jq.
health_number() {
	sed -n "s/.*\"$1\":\([0-9][0-9]*\).*/\1/p" smoke-health.json
}

# Zählt Zeilen einer Tabelle. `--batch --skip-column-names` liefert nur den Wert.
count_rows() {
	mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$FULL_DB_NAME" \
		--batch --skip-column-names -e "SELECT COUNT(*) FROM $1;"
}

if [[ -f .env ]]; then
	env_backup="$(mktemp)"
	cp .env "$env_backup"
	echo "==> Vorhandene .env gesichert (wird am Ende zurückgespielt)."
fi

echo "==> .env schreiben (wird von 'node --env-file=.env build' gelesen)"
cat > .env <<EOF
MARIA_DB_USER="${DB_USER}"
MARIA_DB_PASSWORD="${DB_PASSWORD}"
MARIA_DB_NAME="${DB_NAME}"
EOF

# Frisches Log, damit die Prüfungen unten nicht auf Treffer eines früheren Laufs
# hereinfallen (im CI immer frisch, lokal nicht zwingend).
: > smoke-server.log

echo "==> Szenario 1: frische Datenbank, Schema kommt aus den Migrationen"
start_server
wait_for_health
assert_health_field "status" '"ok"'
# Beweist, dass wirklich MariaDB benutzt wurde und nicht still SQLite — sonst meldete
# der Test fälschlich grün.
assert_health_field "dialect" '"mariadb"'
assert_health_field "pendingMigrations" '0'

grundstuecke_vorher="$(count_rows plots)"
if [[ "$grundstuecke_vorher" -eq 0 ]]; then
	fail "Der Weltaufbau hat keine Grundstücke angelegt — ohne Bauland ist nichts spielbar"
fi
echo "  Weltaufbau: $grundstuecke_vorher Grundstücke"

echo "==> Szenario 2: Neustart gegen die bestehende Datenbank"
# Der Regelfall in Produktion: Jeder Deploy startet den Dienst gegen eine gewachsene
# Welt neu. Migrationen dürfen dann nichts mehr tun, und der Weltaufbau darf die Stadt
# kein zweites Mal anlegen — sonst verdoppelte jeder Deploy das Bauland.
stop_server
start_server
wait_for_health
assert_health_field "status" '"ok"'
assert_health_field "pendingMigrations" '0'

grundstuecke_nachher="$(count_rows plots)"
if [[ "$grundstuecke_nachher" -ne "$grundstuecke_vorher" ]]; then
	fail "Der Weltaufbau ist nicht wiederholbar: $grundstuecke_vorher Grundstücke vorher, $grundstuecke_nachher nachher"
fi

if [[ -z "$(health_number currentTick)" ]]; then
	fail "Keine Weltuhr in der Antwort — ohne sie rechnet keine Handlung"
fi

echo "==> Beide Szenarien bestanden."
