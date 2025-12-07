const { formatDistanceToNowStrict, parseISO } = require('date-fns');

function formatMessage(video) {
  const link = `https://www.youtube.com/watch?v=${video.id}`;
  const published = formatDistanceToNowStrict(parseISO(video.publishedAt), { addSuffix: true });
  const description = video.description ? `\n\n${video.description.slice(0, 400)}` : '';
  return `${video.title}\n${link}\nPublished ${published}.${description}`;
}

async function syncYouTube({
  youtubeClient,
  telegramClient,
  readwiseClient,
  playlistId,
  state,
  stateStore,
  logger,
}) {
  if (!youtubeClient || !telegramClient || !playlistId) {
    throw new Error('YouTube client, playlist ID, or Telegram client not configured');
  }

  const items = await youtubeClient.fetchPlaylistItems(playlistId, 3);

  if (!items.length) {
    logger.info('No videos returned from playlist');
    return;
  }

  // Filter new videos based on state
  const lastPublishedAt = state.lastYouTubePublishedAt;
  const sorted = items.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  let newItems = sorted;
  if (lastPublishedAt) {
    newItems = sorted.filter((item) => new Date(item.publishedAt) > new Date(lastPublishedAt));
  } else {
    // First run: send only the latest video to avoid flooding.
    newItems = sorted.slice(-1);
  }

  if (!newItems.length) {
    logger.info('No new YouTube videos to send');
    return;
  }

  for (const video of newItems) {
    const message = formatMessage(video);
    await telegramClient.sendMessage(message);
    logger.info({ videoId: video.id }, 'Sent YouTube video to Telegram');

    if (readwiseClient?.canUse()) {
      await readwiseClient.saveHighlight({
        text: video.title,
        title: video.title,
        sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
      });
      logger.info({ videoId: video.id }, 'Saved highlight to Readwise');
    }

    state.lastYouTubePublishedAt = video.publishedAt;
    stateStore.save(state);
  }
}

module.exports = { syncYouTube };
