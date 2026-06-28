# Cutover: Switch from manual `npm start` to launchd

This document describes how to switch the Telegram bot from a manually
started process to a launchd LaunchAgent that auto-starts at login and
auto-restarts after crashes.

Review the plist at `deploy/com.wilsonchao.telegram-bot.plist` before
loading it. In particular confirm:
- The node binary path (`/opt/homebrew/bin/node` or wherever your brew node lives).
- The `WorkingDirectory` matches the repo root.
- The log file paths are writable.

---

## Step 1 — Find and kill any manually started instances

```bash
# Find all node processes running src/index.js from this repo
ps aux | grep 'telegram-bot/src/index.js' | grep -v grep

# Kill each PID you find (replace <PID> with the actual number)
kill <PID>

# Confirm nothing is left
ps aux | grep 'telegram-bot/src/index.js' | grep -v grep

# Also remove any stale lock file (the new code creates data/bot.lock)
rm -f /Users/zhaoyixiang/Project/_tools/telegram-bot/data/bot.lock
```

---

## Step 2 — Copy the plist to the LaunchAgents directory

```bash
cp /Users/zhaoyixiang/Project/_tools/telegram-bot/deploy/com.wilsonchao.telegram-bot.plist \
   ~/Library/LaunchAgents/com.wilsonchao.telegram-bot.plist
```

---

## Step 3 — Load (start) the agent

```bash
launchctl load ~/Library/LaunchAgents/com.wilsonchao.telegram-bot.plist
```

On macOS 11+ you can also use the newer bootstrap syntax:

```bash
launchctl bootstrap gui/$(id -u) \
  ~/Library/LaunchAgents/com.wilsonchao.telegram-bot.plist
```

---

## Step 4 — Verify only one instance is running

```bash
# Should show exactly one node process for this bot
ps aux | grep 'telegram-bot/src/index.js' | grep -v grep

# Check the lock file was written
cat /Users/zhaoyixiang/Project/_tools/telegram-bot/data/bot.lock

# Tail the log to confirm it started cleanly
tail -f /Users/zhaoyixiang/Project/_tools/telegram-bot/data/launchd-stdout.log
```

---

## Step 5 — Test the single-instance lock

```bash
# Try starting a second instance manually; it should exit immediately
cd /Users/zhaoyixiang/Project/_tools/telegram-bot && node src/index.js
# Expected output: "Another bot instance is already running (PID XXXXX). Exiting."
```

---

## Stopping the agent

```bash
launchctl unload ~/Library/LaunchAgents/com.wilsonchao.telegram-bot.plist
```

Or with the newer syntax:

```bash
launchctl bootout gui/$(id -u) \
  ~/Library/LaunchAgents/com.wilsonchao.telegram-bot.plist
```

---

## Updating after a code change

```bash
# 1. Unload
launchctl unload ~/Library/LaunchAgents/com.wilsonchao.telegram-bot.plist

# 2. Pull / edit code
cd /Users/zhaoyixiang/Project/_tools/telegram-bot && git pull

# 3. Reload
launchctl load ~/Library/LaunchAgents/com.wilsonchao.telegram-bot.plist
```

---

## Log rotation (optional)

The launchd agent writes stdout/stderr to:
- `data/launchd-stdout.log`
- `data/launchd-stderr.log`

These files grow unbounded. Add a newsyslog entry or a periodic cron to
rotate them, for example:

```bash
# Rotate manually (compresses and starts a fresh file)
gzip data/launchd-stdout.log && mv data/launchd-stdout.log.gz data/logs/
gzip data/launchd-stderr.log && mv data/launchd-stderr.log.gz data/logs/
```
