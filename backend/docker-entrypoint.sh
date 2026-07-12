#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  php /var/www/html/scripts/run-migrations.php
fi

exec apache2-foreground
