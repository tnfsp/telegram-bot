const { compareAsc } = require('date-fns');

function parseRssDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatMessage(item) {
  const title = item.title || '(\u7121\u6a19\u984c)';
  const linkLine = item.link ? `\n${item.link}` : '';
  return `\u{1F4F0} \u65b0\u6587\u7ae0 #blog\n${title}${linkLine}`;
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
      .map((it) => {
        const parsedDate = parseRssDate(it.publishedAt || it.pubDate || it.published || it.updated);
        return {
          ...it,
          publishedAt: it.publishedAt || it.pubDate || it.published || it.updated || null,
          parsedDate,
        };
      });

    const sorted = normalized
      .filter((it) => it.parsedDate)
      .sort((a, b) => compareAsc(a.parsedDate, b.parsedDate));

    const last = state.rss?.[feedUrl];
    let newItems;
    if (last) {
      const cutoff = parseRssDate(last);
      newItems = cutoff ? sorted.filter((it) => it.parsedDate > cutoff) : sorted;
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
      state.rss[feedUrl] = item.parsedDate ? item.parsedDate.toISOString() : item.publishedAt;
      stateStore.save(state);
    }
  }
}

module.exports = { syncRss };
