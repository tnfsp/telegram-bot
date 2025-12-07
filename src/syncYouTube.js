const { formatDistanceToNowStrict, parseISO } = require('date-fns');

function formatMessage(video, label = 'youtube') {
  const link = `https://www.youtube.com/watch?v=${video.id}`;
  if (label === 'music') {
    return `🎵 好音樂　${video.title} #music\n\n${link}`;
  }
  const published = formatDistanceToNowStrict(parseISO(video.publishedAt), { addSuffix: true });
  const description = video.description ? `\n\n${video.description.slice(0, 400)}` : '';
  return `▶️ 有趣影片　${video.title}#youtube \n\n${link}\nPublished ${published}.${description}`;
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

      if (readwiseClient?.canUse()) {
        await readwiseClient.saveHighlight({
          text: video.title,
          title: video.title,
          sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
        });
        logger.info({ videoId: video.id, playlistId }, 'Saved highlight to Readwise');
      }

      state.lastYouTubePublishedAt[playlistId] = video.publishedAt;
      stateStore.save(state);
    }
  }
}

module.exports = { syncYouTube };
