# yt-readwise-telegram-bridge

Bridge new YouTube playlist uploads to a Telegram channel (and optionally to Readwise), plus forward new Readwise highlights to Telegram. Designed to be simple to run as a long-lived Node.js process.
Now also pulls RSS feeds (defaults: `https://wilsonchao.com/feed.xml`, `https://wilsonchao.com/daily/feed.xml`) and posts new items to Telegram.

## Prerequisites
- Node.js 18+
- YouTube Data API v3 key with access to the target playlist
- Telegram bot token and channel ID (the bot must be an admin of the channel)
- Optional: Readwise API token if you want Readwise integration

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env` and fill in your secrets:
   ```ini
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHANNEL_ID=@your_channel_or_id
   YOUTUBE_API_KEY=your_youtube_api_key
   # YouTube playlists (supports multiple)
   # Either use legacy YOUTUBE_PLAYLIST_ID or the dedicated ones below:
   YOUTUBE_PLAYLIST_ID=target_playlist_id_optional
   YOUTUBE_PLAYLIST_ID_VIDEO=video_playlist_id
   YOUTUBE_PLAYLIST_ID_MUSIC=music_playlist_id
   # Or provide a comma list:
   # YOUTUBE_PLAYLISTS=playlist1,playlist2
   READWISE_API_TOKEN=your_readwise_token_optional
   RSS_FEEDS=https://wilsonchao.com/feed.xml,https://wilsonchao.com/daily/feed.xml

   YOUTUBE_SYNC_INTERVAL_MINUTES=15
   READWISE_SYNC_INTERVAL_MINUTES=60
    RSS_SYNC_INTERVAL_MINUTES=30
   STATE_FILE_PATH=./data/state.json
   DRY_RUN=false
   LOG_LEVEL=info
   ```
3. Start the bridge:
   ```bash
   npm start
   ```

## What it does
- Polls the configured YouTube playlist and posts newly published videos to Telegram. On the first run it only sends the latest video to avoid flooding. If a Readwise token is provided, it also creates a highlight for each new video.
- Polls Readwise highlights (most recently updated) and posts new ones to Telegram. On the first run it sends the latest 3 highlights, then only new updates afterwards.
- Polls the configured RSS feeds and posts new items to Telegram. On the first run it sends the latest item per feed, then only new items.
- Persists progress in `STATE_FILE_PATH` so restarts continue where they left off.

## Notes
- Set `DRY_RUN=true` to log actions without sending to Telegram/Readwise.
- Tweak the sync intervals to suit your usage; defaults are YouTube every 15 minutes and Readwise every 60 minutes.
- Logs are pretty-printed via pino; adjust `LOG_LEVEL` (e.g., `debug`) for more detail.
