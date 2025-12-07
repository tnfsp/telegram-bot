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
    YOUTUBE_API_KEY,
    YOUTUBE_PLAYLIST_ID,
    READWISE_API_TOKEN,
    YOUTUBE_SYNC_INTERVAL_MINUTES,
    READWISE_SYNC_INTERVAL_MINUTES,
    RSS_FEEDS,
    RSS_SYNC_INTERVAL_MINUTES,
    STATE_FILE_PATH,
    DRY_RUN,
    LOG_LEVEL,
  } = process.env;

  const defaultFeeds = [
    'https://wilsonchao.com/feed.xml',
    'https://wilsonchao.com/daily/feed.xml',
  ];

  const rssFeeds =
    RSS_FEEDS && RSS_FEEDS.trim().length > 0
      ? RSS_FEEDS.split(',').map((s) => s.trim()).filter(Boolean)
      : defaultFeeds;

  return {
    telegram: {
      botToken: TELEGRAM_BOT_TOKEN || '',
      channelId: TELEGRAM_CHANNEL_ID || '',
    },
    youtube: {
      apiKey: YOUTUBE_API_KEY || '',
      playlistId: YOUTUBE_PLAYLIST_ID || '',
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
