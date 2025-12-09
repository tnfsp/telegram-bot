function formatMessage(video, label = 'youtube') {
  const link = `https://www.youtube.com/watch?v=${video.id}`;
  if (label === 'music') {
    return `\uD83C\uDFB5 Chill\u97f3\u6a02\u3000${video.title} #music\n\n${link}`;
  }
  return `\u25B6\uFE0F Cool \u5f71\u7247 ${video.title} #video\n\n${link}`;
}

async function syncYouTube({
  youtubeClient,
  telegramClient,
  readwiseClient,
  playlists,
  state,
  stateStore,
  logger,
}) {
  if (!youtubeClient || !telegramClient || !playlists?.length) {
    throw new Error('YouTube client, playlists, or Telegram client not configured');
  }

  for (const { id: playlistId, label } of playlists) {
    const items = await youtubeClient.fetchPlaylistItems(playlistId, 3);

    if (!items.length) {
      logger.info({ playlistId }, 'No videos returned from playlist');
      continue;
    }

    const lastPublishedAt = state.lastYouTubePublishedAt?.[playlistId];
    const sorted = items.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
    let newItems = sorted;
    if (lastPublishedAt) {
      newItems = sorted.filter((item) => new Date(item.publishedAt) > new Date(lastPublishedAt));
    } else {
      // First run: send only the latest video to avoid flooding.
      newItems = sorted.slice(-1);
    }

    if (!newItems.length) {
      logger.info({ playlistId }, 'No new YouTube videos to send');
      continue;
    }

    for (const video of newItems) {
      const message = formatMessage(video, label);
      await telegramClient.sendMessage(message);
      logger.info({ videoId: video.id, playlistId }, 'Sent YouTube video to Telegram');

      state.lastYouTubePublishedAt[playlistId] = video.publishedAt;
      stateStore.save(state);

      if (readwiseClient?.canUse()) {
        try {
          await readwiseClient.saveHighlight({
            text: video.title,
            title: video.title,
            sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
          });
          logger.info({ videoId: video.id, playlistId }, 'Saved highlight to Readwise');
        } catch (err) {
          logger.error({ err, videoId: video.id, playlistId }, 'Readwise highlight save failed (skipping)');
          // Do not rethrow; state already updated so we don't resend the same video.
        }
      }
    }
  }
}

module.exports = { syncYouTube };
