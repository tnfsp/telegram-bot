const { loadConfig } = require('./config');
const { createLogger } = require('./logger');

/**
 * Format an error object into a human-readable string, working around
 * the axios AxiosError.from() bug where err.message is set to the literal
 * string "Error" when the underlying error has no message.
 *
 * @param {string} prefix - Label for the error context (e.g. "YouTube sync failed")
 * @param {unknown} err - The caught error object
 * @returns {string}
 */
function formatErr(prefix, err) {
  if (!err) return `${prefix}: (no error object)`;
  const parts = [];
  // Avoid the axios 'Error' literal trap — AxiosError.from() hardcodes "Error"
  if (err.message && err.message !== 'Error') parts.push(err.message);
  if (err.code) parts.push(`code=${err.code}`);
  if (err.response?.status) parts.push(`http=${err.response.status}`);
  if (err.config?.url) parts.push(`url=${err.config.url}`);
  if (err.cause?.message) parts.push(`cause=${err.cause.message}`);
  if (err.response?.data) {
    const d = err.response.data;
    parts.push(`body=${typeof d === 'string' ? d.slice(0, 200) : JSON.stringify(d).slice(0, 200)}`);
  }
  if (!parts.length && err.stack) parts.push(err.stack.split('\n').slice(0, 2).join(' | '));
  if (!parts.length) parts.push(String(err));
  return `${prefix}: ${parts.join(' | ')}`;
}

const { StateStore } = require('./stateStore');
const { YouTubeClient } = require('./clients/youtubeClient');
const { TelegramClient } = require('./clients/telegramClient');
const { ReadwiseClient } = require('./clients/readwiseClient');
const { RssClient } = require('./clients/rssClient');
const { validateConfig } = require('./configValidation');
const { syncYouTube } = require('./syncYouTube');
const { syncReadwise } = require('./syncReadwise');
const { syncRss } = require('./syncRss');
const { createAlerter } = require('./alert');
const { createHeartbeat } = require('./heartbeat');

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
  const alerter = createAlerter(telegramClient, logger, {
    enabled: config.alerts.enabled,
    chatId: config.alerts.chatId || config.telegram.channelId,
    threadId: config.alerts.threadId,
  });
  const heartbeat = createHeartbeat(
    config.heartbeatFilePath || './data/heartbeat.json',
    logger,
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

  const validation = validateConfig(config);
  validation.warnings.forEach((msg) => logger.warn({ msg }, 'Config warning'));
  validation.errors.forEach((msg) => logger.error({ msg }, 'Config error'));

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
        playlists: config.youtube.playlists,
        state,
        stateStore,
        logger,
      });
      heartbeat.touch('youtube');
    } catch (err) {
      logger.error({ err }, 'YouTube sync failed');
      alerter.sendAlert(formatErr('YouTube sync failed', err), { err });
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
      heartbeat.touch('readwise');
    } catch (err) {
      logger.error({ err }, 'Readwise sync failed');
      alerter.sendAlert(formatErr('Readwise sync failed', err), { err });
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
      heartbeat.touch('rss');
    } catch (err) {
      logger.error({ err }, 'RSS sync failed');
      alerter.sendAlert(formatErr('RSS sync failed', err), { err });
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
