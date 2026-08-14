#!/usr/bin/env bash
#
# Die tägliche Sicherung der Produktionsdatenbank (Phase 5.8).
#
# Ein Dump vor jedem Deploy gibt es seit 2.4 — aber ein Deploy ist kein Sicherungsplan.
# Wer zwei Wochen nichts ausliefert, hat zwei Wochen keine Sicherung, und ausgerechnet
# die ruhigen Zeiten sind die, in denen die Welt am meisten Spielzeit ansammelt.
#
# Läuft auf dem Uberspace per Cron. Zugangsdaten kommen aus ~/.my.cnf des Benutzers und
# stehen deshalb nirgends in diesem Skript.
#
# Einrichten:
#     crontab -e
#     17 4 * * * $HOME/houses-app/scripts/backup.sh >> $HOME/logs/backup.log 2>&1
#
# Die krumme Minute mit Absicht: Zur vollen Stunde laufen auf einem geteilten Host die
# Aufgaben aller Nutzer gleichzeitig.

set -euo pipefail

DB="${HOUSES_DB:-${USER}_houses}"
ZIEL="${HOUSES_BACKUP_DIR:-$HOME/backups/houses}"
# Wie viele tägliche Sicherungen liegen bleiben. Vierzehn wie beim Deploy-Dump: lang
# genug, dass ein Schaden auffällt, kurz genug für den Plattenplatz.
BEHALTEN="${HOUSES_BACKUP_KEEP:-14}"

mkdir -p "$ZIEL"

stempel="$(date +%Y%m%d-%H%M%S)"
fertig="$ZIEL/taeglich-$stempel.sql.gz"
# **Erst schreiben, dann benennen.** Bricht der Dump mittendrin ab, bleibt sonst eine
# halbe Datei liegen, die aussieht wie eine Sicherung — und genau darauf verlässt man
# sich im Ernstfall. Die Umbenennung ist der Moment, in dem sie eine wird.
vorlaeufig="$ZIEL/.unfertig-$stempel.sql.gz"

trap 'rm -f "$vorlaeufig"' EXIT

# --single-transaction: ein konsistenter Stand ohne Sperren auf den Tabellen. Der Server
# darf während der Sicherung weiterlaufen — die Welt hält für niemanden an.
mysqldump --single-transaction --quick "$DB" | gzip > "$vorlaeufig"

# Eine leere oder winzige Datei ist kein Erfolg. mysqldump gibt auch bei Teilfehlern
# gelegentlich 0 zurück; die Größe ist die ehrlichere Auskunft.
groesse="$(stat -c %s "$vorlaeufig")"
if [ "$groesse" -lt 1024 ]; then
	echo "FEHLER: Die Sicherung ist nur $groesse Bytes groß — das kann nicht stimmen." >&2
	exit 1
fi

mv "$vorlaeufig" "$fertig"
trap - EXIT

echo "$(date +%F\ %T) Sicherung: $fertig ($(du -h "$fertig" | cut -f1))"

# Aufräumen — nur die täglichen. Die Deploy-Dumps haben ihre eigene Aufbewahrung, und
# ein Muster, das beide erwischt, löschte irgendwann die falschen.
ls -1t "$ZIEL"/taeglich-*.sql.gz 2>/dev/null | tail -n "+$((BEHALTEN + 1))" | xargs -r rm --
