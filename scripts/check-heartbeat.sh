#!/usr/bin/env bash
# Heartbeat watchdog for telegram-bot.
# Reads data/heartbeat.json, alerts via Telegram if lastSuccessfulSync is stale.
# Designed to be invoked by launchd every hour; runs independently of the bot process.

set -euo pipefail

BOT_DIR="/Users/zhaoyixiang/Project/_tools/telegram-bot"
HEARTBEAT_FILE="${BOT_DIR}/data/heartbeat.json"
ENV_FILE="${BOT_DIR}/.env"
THRESHOLD_SECONDS="${HEARTBEAT_THRESHOLD_SECONDS:-10800}"   # 3h default
COOLDOWN_FILE="${BOT_DIR}/data/.heartbeat-alert-cooldown"
COOLDOWN_SECONDS="${HEARTBEAT_COOLDOWN_SECONDS:-21600}"     # 6h between alerts

# Load TELEGRAM_BOT_TOKEN / ALERT_CHAT_ID / TELEGRAM_CHANNEL_ID from .env
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

CHAT_ID="${ALERT_CHAT_ID:-${TELEGRAM_CHANNEL_ID:-}}"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "$CHAT_ID" ]; then
  echo "[$(date -Iseconds)] missing TELEGRAM_BOT_TOKEN or chat id; skipping" >&2
  exit 0
fi

send_alert() {
  local text="$1"
  # Cooldown: avoid re-alerting every hour for the same outage
  if [ -f "$COOLDOWN_FILE" ]; then
    local last_alert now_epoch age
    last_alert=$(cat "$COOLDOWN_FILE")
    now_epoch=$(date +%s)
    age=$((now_epoch - last_alert))
    if [ "$age" -lt "$COOLDOWN_SECONDS" ]; then
      echo "[$(date -Iseconds)] within cooldown (${age}s < ${COOLDOWN_SECONDS}s); suppressing" >&2
      return 0
    fi
  fi
  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=⚠️ ${text}" >/dev/null
  date +%s > "$COOLDOWN_FILE"
  echo "[$(date -Iseconds)] alert sent: ${text}" >&2
}

if [ ! -f "$HEARTBEAT_FILE" ]; then
  send_alert "telegram-bot heartbeat file missing (${HEARTBEAT_FILE}). Bot may never have started."
  exit 0
fi

age=$(python3 - <<PY
import json, datetime, sys
try:
    with open("$HEARTBEAT_FILE") as f:
        iso = json.load(f)["lastSuccessfulSync"]
    last = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    now = datetime.datetime.now(datetime.timezone.utc)
    print(int((now - last).total_seconds()))
except Exception as e:
    print(f"ERR:{e}", file=sys.stderr)
    sys.exit(2)
PY
)

if [ "$age" -gt "$THRESHOLD_SECONDS" ]; then
  human=$(python3 -c "s=$age; print(f'{s//3600}h{(s%3600)//60}m')")
  send_alert "telegram-bot heartbeat stale: ${human} old (threshold $((THRESHOLD_SECONDS/3600))h). Process may be stopped or stuck."
else
  echo "[$(date -Iseconds)] heartbeat healthy: ${age}s old" >&2
fi
