const { loadConfig } = require('./config');
const { createLogger } = require('./logger');
const { StateStore } = require('./stateStore');
const { YouTubeClient } = require('./clients/youtubeClient');
const { TelegramClient } = require('./clients/telegramClient');
const { ReadwiseClient } = require('./clients/readwiseClient');
const { RssClient } = require('./clients/rssClient');
const { syncYouTube } = require('./syncYouTube');
const { syncReadwise } = require('./syncReadwise');
const { syncRss } = require('./syncRss');

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const stateStore = new StateStore(config.stateFilePath, logger);
  const state = stateStore.load();

  const telegramClient = new TelegramClient(
    config.telegram.botToken,
    config.telegram.channelId,
    logger,
    { dryRun: config.dryRun },
  );

  const youtubeClient = new YouTubeClient(config.youtube.apiKey, logger);
  const readwiseClient = new ReadwiseClient(config.readwise.apiToken, logger, {
    dryRun: config.dryRun,
  });
  const rssClient = new RssClient(logger);

  logger.info(
    {
      dryRun: config.dryRun,
      stateFile: config.stateFilePath,
      youtubeIntervalMinutes: config.youtube.syncIntervalMinutes,
      youtubePlaylists: config.youtube.playlists,
      readwiseIntervalMinutes: config.readwise.syncIntervalMinutes,
      rssIntervalMinutes: config.rss.syncIntervalMinutes,
      rssFeeds: config.rss.feeds,
    },
    'Bridge starting',
  );

  const runYouTubeSync = async () => {
    if (!config.youtube.apiKey || !config.youtube.playlists.length) {
      logger.warn('Skipping YouTube sync: API key or playlists missing');
      return;
    }
    if (!telegramClient.canSend()) {
      logger.warn('Skipping YouTube sync: Telegram not configured');
      return;
    }
    try {
      await syncYouTube({
        youtubeClient,
        telegramClient,
        readwiseClient,
        playlists: config.youtube.playlists,
        state,
        stateStore,
        logger,
      });
    } catch (err) {
      logger.error({ err }, 'YouTube sync failed');
    }
  };

  const runReadwiseSync = async () => {
    if (!readwiseClient.canUse()) {
      logger.warn('Skipping Readwise sync: API token missing');
      return;
    }
    if (!telegramClient.canSend()) {
      logger.warn('Skipping Readwise sync: Telegram not configured');
      return;
    }
    try {
      await syncReadwise({
        readwiseClient,
        telegramClient,
        state,
        stateStore,
        logger,
      });
    } catch (err) {
      logger.error({ err }, 'Readwise sync failed');
    }
  };

  const runRssSync = async () => {
    if (!config.rss.feeds.length) {
      logger.warn('Skipping RSS sync: no feeds configured');
      return;
    }
    if (!telegramClient.canSend()) {
      logger.warn('Skipping RSS sync: Telegram not configured');
      return;
    }
    try {
      await syncRss({
        rssClient,
        telegramClient,
        feeds: config.rss.feeds,
        state,
        stateStore,
        logger,
      });
    } catch (err) {
      logger.error({ err }, 'RSS sync failed');
    }
  };

  // Kick off immediately, then schedule intervals.
  runYouTubeSync();
  runReadwiseSync();
  runRssSync();

  const youtubeMs = config.youtube.syncIntervalMinutes * 60 * 1000;
  const readwiseMs = config.readwise.syncIntervalMinutes * 60 * 1000;
  const rssMs = config.rss.syncIntervalMinutes * 60 * 1000;

  setInterval(runYouTubeSync, youtubeMs);
  setInterval(runReadwiseSync, readwiseMs);
  setInterval(runRssSync, rssMs);
}

main().catch((err) => {
  console.error('Fatal error starting bridge', err);
  process.exit(1);
});
