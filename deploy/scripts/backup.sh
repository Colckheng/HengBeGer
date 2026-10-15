#!/usr/bin/env bash
# 云端 MySQL 每日备份（保留 14 天）。部署时放到 /srv/hengbeger/deploy/backup.sh，由 root crontab 调用：
#   30 3 * * * /srv/hengbeger/deploy/backup.sh >> /var/log/hengbeger-backup.log 2>&1
# 注意：脚本从 Windows 传上去后是 CRLF，远端要先 `tr -d '\r'` 清洗再 chmod +x。
set -euo pipefail
cd /srv/hengbeger
mkdir -p deploy/backups
stamp=$(date +%F)
docker compose -f deploy/docker-compose.yml exec -T mysql \
  sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  | gzip > "deploy/backups/hengbeger-$stamp.sql.gz"
# 只留最近 14 份（设计文档 §4.6）
ls -1t deploy/backups/hengbeger-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "[backup] $(date -Is) -> deploy/backups/hengbeger-$stamp.sql.gz"
