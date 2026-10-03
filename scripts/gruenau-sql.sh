#!/usr/bin/env bash
#
# Grünau lesen — und nur lesen.
#
# Ein Blick in die laufende Welt auf dem Uberspace: „Steht dort eine Bäckerei?",
# „Wie viel Brot liegt in den Kammern?". Fragen, die keine Sicherung und keinen
# Deploy brauchen, sondern ein SELECT.
#
#     scripts/gruenau-sql.sh "SELECT optionId, COUNT(*) FROM buildings GROUP BY optionId;"
#     echo "SELECT COUNT(*) FROM characters WHERE deathTick IS NULL;" | scripts/gruenau-sql.sh
#
# **Warum es dieses Skript gibt und nicht bloß eine Zeile mit ssh.** Damit ein
# Agent hier lesen darf, ohne dass ihm damit die Produktionsdatenbank offensteht,
# muss die Erlaubnis an etwas hängen, das **selbst** nichts Schreibendes zulässt.
# Ein Muster auf `ssh …` wäre das nicht: Die Abfrage steht im selben Kommando, und
# ein Platzhalter am Ende ließe jedes `DROP TABLE` mit durch. Dieses Skript ist der
# schmale Durchlass — die Berechtigung in `.claude/settings.local.json` nennt es
# namentlich, und die Prüfung steht hier.
#
# **Jedes Statement muss mit SELECT oder SHOW beginnen** (eine Positivliste, keine
# Verbotsliste: Was nicht vorkommt, ist nicht erlaubt, statt umgekehrt). Die
# Abfrage geht über die Standardeingabe an `mysql` — so gibt es keine zweite
# Ebene Anführungszeichen, an der sich etwas einschmuggeln ließe.
#
# **Der Schlüssel wird gefunden wie in `~/Sync/Sonstiges/claude/uberspace.sh`:**
# zuerst die lokale Kopie `~/.ssh/uberspace`, sonst der Sync-Ordner. Unter Linux kommt
# der Schlüssel per Syncthing mit 0644 an, und SSH lehnt ihn dann ab; dort gehört die
# Kopie einmal angelegt:
#
#     install -m 600 ~/Sync/Sonstiges/Schlüssel/ssh-keys/uberspace ~/.ssh/uberspace
#
# Unter Windows prüft SSH keine Rechte, dort genügt der Sync-Ordner. Bis 2026-10 legte
# das Skript dafür bei jedem Aufruf eine eigene Wegwerfkopie an — ein zweiter Weg zum
# selben Schlüssel, den kein anderes Skript ging.
#
# Der Windows-Zweig ist ungeprüft.
set -euo pipefail

HOST="${GRUENAU_HOST:-enzlor@enzlor.uber.space}"
DB="${GRUENAU_DB:-enzlor_houses}"

abfrage="${1:-}"
if [ -z "$abfrage" ]; then
	abfrage="$(cat)"
fi
if [ -z "${abfrage//[[:space:]]/}" ]; then
	echo "Keine Abfrage. Beispiel: $0 \"SELECT COUNT(*) FROM characters;\"" >&2
	exit 2
fi

# **Jedes Statement einzeln prüfen.** Ein `SELECT 1; DROP TABLE plots;` besteht aus
# zwei Anweisungen, und die zweite ist der Grund für diese Schleife.
rest="$abfrage"
while [ -n "${rest//[[:space:]]/}" ]; do
	satz="${rest%%;*}"
	if [ "$satz" = "$rest" ]; then
		rest=""
	else
		rest="${rest#*;}"
	fi

	geputzt="$(printf '%s' "$satz" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
	[ -z "$geputzt" ] && continue

	# **Das erste Wort, nicht die ersten Zeichen.** Beim ersten Anlauf stand hier
	# `cut -c1-6`, und damit wurde aus „SHOW TABLES" ein „SHOW T", das durch keine
	# Prüfung kommt: Die Positivliste wies ab, was sie erlauben sollte.
	erstes="$(printf '%s' "$geputzt" | awk '{print toupper($1)}')"
	case "$erstes" in
	SELECT | SHOW) ;;
	*)
		echo "Nur SELECT und SHOW. Abgewiesen: ${geputzt:0:60}" >&2
		exit 3
		;;
	esac
done

# Der Schlüssel — dieselbe Reihenfolge wie in uberspace.sh.
if [ -f ~/.ssh/uberspace ]; then
	schluessel=~/.ssh/uberspace
else
	# Den .pub-Schlüssel aussortieren; der Glob fängt beide.
	schluessel=$(ls ~/Sync/Sonstiges/Schlüssel/ssh-keys/*uberspace 2>/dev/null | grep -v '\.pub$' | head -1 || true)
fi
if [ -z "$schluessel" ]; then
	echo "Kein SSH-Schlüssel unter ~/.ssh/uberspace oder ~/Sync/Sonstiges/Schlüssel/ssh-keys/*uberspace gefunden." >&2
	exit 4
fi

printf '%s\n' "$abfrage" | ssh -i "$schluessel" -o BatchMode=yes -o ConnectTimeout=15 \
	-o StrictHostKeyChecking=accept-new "$HOST" "mysql $DB --table"
