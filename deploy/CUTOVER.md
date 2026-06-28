# Cutover guide

> ⚠️ **DO NOT load the launchd plist on Wilson's main machine (2026-06-28).**
> This bot is ALREADY supervised by **PM2** (`pm2 id 2`, name `telegram-bot`,
> `autorestart=true`). Loading the launchd plist would create a SECOND
> supervisor competing with PM2 → two concurrent instances → the exact
> duplicate-posting bug this change was meant to fix.
>
> The launchd plist in this `deploy/` folder is kept only as a reference for
> a hypothetical PM2-free deployment. On the current machine, **PM2 is the
> supervisor** — manage the bot with:
>
> ```bash
> pm2 restart telegram-bot   # after a code change
> pm2 logs telegram-bot      # view logs
> pm2 save                   # persist the process list
> ```
>
> Root cause of the original duplicate posts (confirmed 2026-06-28): the old
> code saved RSS state only once after sending ALL items. PM2 restarted the
> process mid-sync (crash-loop driven by node_modules being deleted by an
> external cleanup tool), so an already-sent article was re-sent because the
> cutoff hadn't been persisted yet. Fixed by per-item state persistence +
> guid-set dedup + a single-instance PID lock.

---

## (Reference only) Switching to launchd on a PM2-free machine

The steps below apply ONLY if you first remove the bot from PM2
(`pm2 delete telegram-bot && pm2 save`). Otherwise skip this entire file.

This describes how to switch the Telegram bot from a manually
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
