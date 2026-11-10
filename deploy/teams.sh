#!/usr/bin/env bash
# 방 코드 확인: 서버에서 `./teams.sh`
set -euo pipefail
cd "$(dirname "$0")"
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
docker compose exec -T db psql -U lucklounge -d lucklounge -At -F ' ' \
  -c "select name, code, 'https://${DOMAIN}/' from team order by id"
