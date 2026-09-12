#!/usr/bin/env bash
set -euo pipefail
project=/home/ubuntu/demo/SynthApi
release=/var/www/synthapi-web/releases/r2-monitor-20260908-final
backup="$project/deploy-backups/r2-monitor-$(date -u +%Y%m%dT%H%M%SZ)"
archive="$project/synthapi-server-20260908-r2monitor-clean.gz"
test -s "$archive"
test -s "$release/index.html"
gzip -t "$archive"
install -d -m 0700 "$backup"
cp -p "$project/synthapi-server-new" "$backup/synthapi-server-new"
readlink -f /var/www/synthapi-web/current > "$backup/frontend-path"
tar -czf "$backup/monitor-source.tar.gz" -C "$project" controller/r2_monitor.go router/api-router.go scripts/r2-monitor.py web/default/src/features/r2-monitor web/default/src/routes/_authenticated/r2-monitor.tsx
rollback() {
  cp -p "$backup/synthapi-server-new" "$project/synthapi-server-rollback"
  mv -f "$project/synthapi-server-rollback" "$project/synthapi-server-new"
  ln -sfn "$(cat "$backup/frontend-path")" /var/www/synthapi-web/rollback-next
  mv -Tf /var/www/synthapi-web/rollback-next /var/www/synthapi-web/current
  systemctl restart synthapi.service
}
trap rollback ERR
gzip -dkf "$archive"
install -o ubuntu -g ubuntu -m 0750 "${archive%.gz}" "$project/synthapi-server-candidate"
mv -f "$project/synthapi-server-candidate" "$project/synthapi-server-new"
systemctl restart synthapi.service
healthy=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:13000/api/status | jq -e '.success == true' >/dev/null; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/api/admin/r2-monitor)" = 401
ln -sfn "$release" /var/www/synthapi-web/next
mv -Tf /var/www/synthapi-web/next /var/www/synthapi-web/current
curl -fsS --max-time 15 https://admin.synthapi.asia/r2-monitor >/dev/null
trap - ERR
printf 'Deployed. Rollback backup: %s\n' "$backup"
