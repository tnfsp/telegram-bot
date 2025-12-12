const dotenv = require('dotenv');

dotenv.config();

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadConfig() {
  const {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHANNEL_ID,
    ALERT_CHAT_ID,
    ALERTS_ENABLED,
    YOUTUBE_API_KEY,
    YOUTUBE_PLAYLIST_ID,
    YOUTUBE_PLAYLIST_ID_MUSIC,
    YOUTUBE_PLAYLIST_ID_VIDEO,
    YOUTUBE_PLAYLISTS,
    READWISE_API_TOKEN,
    YOUTUBE_SYNC_INTERVAL_MINUTES,
    READWISE_SYNC_INTERVAL_MINUTES,
    RSS_FEEDS,
    RSS_SYNC_INTERVAL_MINUTES,
    STATE_FILE_PATH,
    DRY_RUN,
    LOG_LEVEL,
  } = process.env;

  // No default feeds; must be configured explicitly via RSS_FEEDS.
  const defaultFeeds = [];

  const rssFeeds =
    RSS_FEEDS && RSS_FEEDS.trim().length > 0
      ? RSS_FEEDS.split(',').map((s) => s.trim()).filter(Boolean)
      : defaultFeeds;

  return {
    telegram: {
      botToken: TELEGRAM_BOT_TOKEN || '',
      channelId: TELEGRAM_CHANNEL_ID || '',
    },
    alerts: {
      enabled: (ALERTS_ENABLED || 'true').toLowerCase() === 'true',
      chatId: ALERT_CHAT_ID || '',
    },
    youtube: {
      apiKey: YOUTUBE_API_KEY || '',
      // Support multiple playlists; legacy single playlist still respected.
      playlists: (() => {
        const list = [];
        const add = (id, label) => {
          if (id) list.push({ id: id.trim(), label });
        };
        if (YOUTUBE_PLAYLIST_ID) add(YOUTUBE_PLAYLIST_ID, 'youtube');
        if (YOUTUBE_PLAYLIST_ID_VIDEO) add(YOUTUBE_PLAYLIST_ID_VIDEO, 'youtube');
        if (YOUTUBE_PLAYLIST_ID_MUSIC) add(YOUTUBE_PLAYLIST_ID_MUSIC, 'music');
        if (YOUTUBE_PLAYLISTS) {
          YOUTUBE_PLAYLISTS.split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((id) => add(id, 'youtube'));
        }
        return list;
      })(),
      syncIntervalMinutes: asNumber(YOUTUBE_SYNC_INTERVAL_MINUTES, 15),
    },
    readwise: {
      apiToken: READWISE_API_TOKEN || '',
      syncIntervalMinutes: asNumber(READWISE_SYNC_INTERVAL_MINUTES, 60),
    },
    rss: {
      feeds: rssFeeds,
      syncIntervalMinutes: asNumber(RSS_SYNC_INTERVAL_MINUTES, 30),
    },
    stateFilePath: STATE_FILE_PATH || './data/state.json',
    dryRun: (DRY_RUN || 'false').toLowerCase() === 'true',
    logLevel: LOG_LEVEL || 'info',
  };
}

module.exports = {
  loadConfig,
};
