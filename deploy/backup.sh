#!/usr/bin/env bash
# DB 백업: 하루 한 번 cron으로 실행. 최근 14개만 남긴다.
#   crontab -e →  30 19 * * *  (UTC 19:30 = 한국 04:30) /opt/luck-lounge/backup.sh >> /opt/luck-lounge/backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
file="backups/lucklounge-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U lucklounge -d lucklounge | gzip > "$file"
ls -1t backups/lucklounge-*.sql.gz | tail -n +15 | xargs -r rm --
echo "$(date '+%F %T') 백업 완료: $file"
