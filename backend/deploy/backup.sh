#!/bin/sh
# /etc/cron.daily/clivra-backup — roda como root; o dump é feito pelo usuário postgres.
# Guarda 14 dias em /var/backups/clivra (0700, só postgres lê).
set -eu
DEST=/var/backups/clivra
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
runuser -u postgres -- pg_dump -Fc -d clivra -f "$DEST/clivra-$STAMP.dump"
find "$DEST" -name 'clivra-*.dump' -mtime +14 -delete
