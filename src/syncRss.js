const { parseISO, isAfter, compareAsc, formatDistanceToNowStrict } = require('date-fns');

function formatMessage(item) {
  const link = item.link ? `\n${item.link}` : '';
  let published = '';
  if (item.publishedAt) {
    try {
      published = `\nPublished ${formatDistanceToNowStrict(parseISO(item.publishedAt), {
        addSuffix: true,
      })}.`;
    } catch (e) {
      published = '';
    }
  }
  const desc =
    item.description && item.description.length
      ? `\n\n${String(item.description).replace(/<[^>]+>/g, '').slice(0, 400)}`
      : '';
  return `${item.title}${published}${link}${desc}`;
}

async function syncRss({ rssClient, telegramClient, feeds, state, stateStore, logger }) {
  if (!rssClient || !telegramClient) {
    throw new Error('RSS client or Telegram client not configured');
  }

  for (const feedUrl of feeds) {
    let items;
    try {
      items = await rssClient.fetchFeed(feedUrl);
    } catch (err) {
      logger.error({ feedUrl, err }, 'RSS sync: failed to fetch feed');
      continue;
    }

    const normalized = items
      .filter((it) => it.title)
      .map((it) => ({
        ...it,
        publishedAt: it.publishedAt || null,
      }));

    const sorted = normalized
      .filter((it) => it.publishedAt)
      .sort((a, b) => compareAsc(parseISO(a.publishedAt), parseISO(b.publishedAt)));

    const last = state.rss?.[feedUrl];
    let newItems;
    if (last) {
      const cutoff = parseISO(last);
      newItems = sorted.filter((it) => isAfter(parseISO(it.publishedAt), cutoff));
    } else {
      // First run: only send the latest article to avoid flooding.
      newItems = sorted.slice(-1);
    }

    if (!newItems.length) {
      logger.info({ feedUrl }, 'No new RSS items to send');
      continue;
    }

    for (const item of newItems) {
      const message = formatMessage(item);
      await telegramClient.sendMessage(message);
      logger.info({ feedUrl, title: item.title }, 'Sent RSS item to Telegram');
      state.rss = state.rss || {};
      state.rss[feedUrl] = item.publishedAt;
      stateStore.save(state);
    }
  }
}

module.exports = { syncRss };
