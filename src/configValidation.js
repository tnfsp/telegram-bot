function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.telegram.botToken) {
    errors.push('TELEGRAM_BOT_TOKEN is missing');
  }
  if (!config.telegram.channelId) {
    errors.push('TELEGRAM_CHANNEL_ID is missing');
  }

  if (!config.youtube.apiKey && config.youtube.playlists.length) {
    errors.push('YOUTUBE_API_KEY is missing while playlists are configured');
  }
  if (config.youtube.playlists.length === 0) {
    warnings.push('No YouTube playlists configured; YouTube sync will be skipped');
  }

  if (!config.readwise.apiToken) {
    warnings.push('READWISE_API_TOKEN missing; Readwise sync will be skipped');
  }

  if (!config.rss.feeds.length) {
    warnings.push('No RSS feeds configured; RSS sync will be skipped');
  }

  return { errors, warnings };
}

module.exports = { validateConfig };
