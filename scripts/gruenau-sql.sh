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
# **Der Schlüssel liegt im Syncthing-Ordner** und trägt dessen Rechte (0644).
# OpenSSH weist ihn deshalb ab. Statt die Rechte dort zu ändern — Syncthing trägt
# sie auf die anderen Geräte weiter — arbeitet das Skript mit einer Kopie, die es
# beim Verlassen wieder wegräumt.
#
# Der Windows-Zweig ist ungeprüft: Unter Git Bash kennt `chmod` keine
# Unix-Rechte, OpenSSH dort nimmt den Schlüssel erfahrungsgemäß trotzdem an.
set -euo pipefail

HOST="${GRUENAU_HOST:-enzlor@enzlor.uber.space}"
DB="${GRUENAU_DB:-enzlor_houses}"
KEY_GLOB="$HOME/Sync/Sonstiges/Schlüssel/ssh-keys/*uberspace"

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

# Der Schlüssel, in einer Kopie mit engen Rechten.
schluessel="$(ls $KEY_GLOB 2>/dev/null | head -1 || true)"
if [ -z "$schluessel" ]; then
	echo "Kein Schlüssel unter $KEY_GLOB gefunden." >&2
	exit 4
fi
kopie="$(mktemp)"
trap 'rm -f "$kopie"' EXIT
cat "$schluessel" >"$kopie"
chmod 600 "$kopie" 2>/dev/null || true

printf '%s\n' "$abfrage" | ssh -i "$kopie" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
	"$HOST" "mysql $DB --table"
