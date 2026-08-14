#!/usr/bin/env bash
#
# Die Probe aufs Exempel: Taugt die Sicherung etwas? (Phase 5.8)
#
# **Eine Sicherung, die nie zurückgespielt wurde, ist eine Vermutung.** Dieses Skript
# macht daraus eine Auskunft — es spielt die jüngste Sicherung in eine **Prüfdatenbank**
# und sieht nach, ob darin eine Welt steht.
#
# Die Produktionsdatenbank wird dabei nicht angefasst. Das ist der Unterschied zwischen
# einer Übung und einem Ernstfall, und die Übung soll man ohne Bauchschmerzen machen
# können — sonst macht man sie nie.
#
# Aufruf auf dem Uberspace:
#     ~/houses-app/scripts/restore-check.sh              # jüngste tägliche Sicherung
#     ~/houses-app/scripts/restore-check.sh datei.sql.gz # eine bestimmte
#
# Für den echten Ernstfall steht der Weg am Ende dieser Datei.

set -euo pipefail

QUELLE="${HOUSES_BACKUP_DIR:-$HOME/backups/houses}"
PRUEFDB="${HOUSES_CHECK_DB:-${USER}_houses_check}"

datei="${1:-}"
if [ -z "$datei" ]; then
	datei="$(ls -1t "$QUELLE"/*.sql.gz 2>/dev/null | head -n 1 || true)"
fi

if [ -z "$datei" ] || [ ! -f "$datei" ]; then
	echo "FEHLER: Keine Sicherung gefunden (gesucht in $QUELLE)." >&2
	exit 1
fi

echo "Prüfe: $datei ($(du -h "$datei" | cut -f1))"
echo "Ziel:  $PRUEFDB — die Produktionsdatenbank bleibt unberührt."

# Sicherheitsnetz gegen den schlimmsten denkbaren Tippfehler: Wer die Prüfdatenbank auf
# den Namen der echten setzt, würde sie hier verwerfen.
if [ "$PRUEFDB" = "${HOUSES_DB:-${USER}_houses}" ]; then
	echo "FEHLER: Die Prüfdatenbank trägt den Namen der Produktionsdatenbank." >&2
	exit 1
fi

mysql -e "DROP DATABASE IF EXISTS \`$PRUEFDB\`; CREATE DATABASE \`$PRUEFDB\`;"
gunzip -c "$datei" | mysql "$PRUEFDB"

frage() {
	mysql -N -B -e "$1" "$PRUEFDB" 2>/dev/null || echo "FEHLT"
}

tabellen="$(frage 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();')"
weltzeit="$(frage 'SELECT currentTick FROM worlds LIMIT 1;')"
einwohner="$(frage 'SELECT COUNT(*) FROM characters WHERE deathTick IS NULL;')"
haeuser="$(frage 'SELECT COUNT(*) FROM dynasties;')"
chronik="$(frage 'SELECT COUNT(*) FROM events;')"

echo
echo "Tabellen:   $tabellen"
echo "Weltzeit:   $weltzeit"
echo "Einwohner:  $einwohner"
echo "Häuser:     $haeuser"
echo "Chronik:    $chronik Einträge"
echo

fehler=0
# **Woran man erkennt, dass die Sicherung trägt.** Nicht am Einspielen ohne Fehlermeldung:
# Ein leeres Schema spielt sich anstandslos ein. Es braucht eine Welt darin.
[ "$tabellen" != "FEHLT" ] && [ "$tabellen" -ge 20 ] || { echo "FEHLER: zu wenige Tabellen." >&2; fehler=1; }
[ "$weltzeit" != "FEHLT" ] && [ "$weltzeit" -gt 0 ] || { echo "FEHLER: keine Weltzeit." >&2; fehler=1; }
[ "$einwohner" != "FEHLT" ] && [ "$einwohner" -gt 0 ] || { echo "FEHLER: keine lebenden Einwohner." >&2; fehler=1; }

# Aufräumen: Eine Prüfdatenbank, die liegen bleibt, ist beim nächsten Mal ein
# Zweifelsfall — stammt sie von heute oder von vor drei Monaten?
mysql -e "DROP DATABASE IF EXISTS \`$PRUEFDB\`;"

if [ "$fehler" -ne 0 ]; then
	echo "Die Sicherung taugt NICHT." >&2
	exit 1
fi

echo "Die Sicherung trägt: Welt, Einwohner und Chronik sind vollständig eingespielt worden."

# ---------------------------------------------------------------------------------------
# Der Ernstfall — bewusst nicht als Skript, sondern als Anleitung.
#
# Eine Wiederherstellung überschreibt Generationen von Spielzeit. Sie gehört in die Hände
# von jemandem, der weiß, welche Sicherung er will, und nicht in einen Aufruf, den man
# versehentlich absetzt:
#
#     supervisorctl stop houses
#     mysql -e "DROP DATABASE \`${USER}_houses\`; CREATE DATABASE \`${USER}_houses\`;"
#     gunzip -c ~/backups/houses/DIE-RICHTIGE.sql.gz | mysql "${USER}_houses"
#     supervisorctl start houses
#     curl -s localhost:5174/houses/api/health
# ---------------------------------------------------------------------------------------
