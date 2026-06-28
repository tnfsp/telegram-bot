const { compareAsc } = require('date-fns');

/**
 * Maximum number of sent GUIDs to retain per feed in state.
 * Older entries beyond this cap are trimmed to prevent unbounded growth.
 */
const MAX_SEEN_GUIDS = 200;

function parseRssDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatMessage(item) {
  const title = item.title || '(無標題)';
  const linkLine = item.link ? `\n${item.link}` : '';
  const description = item.description ? String(item.description) : '';
  const cleaned = description.replace(/<[^>]+>/g, '').trim().slice(0, 400);
  const descBlock = cleaned ? `\n\n${cleaned}` : '';
  return `\u{1F4F0} 新文章 #blog\n${title}${linkLine}${descBlock}`;
}

/**
 * Extract the most stable unique identifier from a feed item.
 * Prefers `guid` (RSS 2.0) or `id` (Atom), falls back to `link`.
 *
 * @param {object} item - Parsed feed item
 * @returns {string|null}
 */
function extractGuid(item) {
  return item.guid || item.id || item.link || null;
}

/**
 * Migrate old cutoff-based state to guid-set state for a given feed.
 *
 * When upgrading from the legacy timestamp-only format we use the existing
 * cutoff as a floor: items published on or before it are considered already
 * sent and their guids are seeded into the new seen set so we do not re-post
 * them on the first run of the new code.
 *
 * @param {object} legacyRssState   - state.rss (may be legacy or already migrated)
 * @param {string} feedUrl
 * @param {object[]} items          - All parsed items from the feed (with parsedDate)
 * @returns {{ seenGuids: string[], cutoff: Date|null, isMigrated: boolean }}
 */
function resolveFeedState(legacyRssState, feedUrl, items) {
  const existing = legacyRssState?.[feedUrl];

  // Already in new format: { cutoff, seenGuids }
  if (existing && typeof existing === 'object' && !Array.isArray(existing) && existing.seenGuids) {
    const cutoff = parseRssDate(existing.cutoff);
    return { seenGuids: existing.seenGuids, cutoff, isMigrated: true };
  }

  // Legacy format: a bare ISO string (cutoff timestamp)
  if (typeof existing === 'string') {
    const cutoff = parseRssDate(existing);
    // Seed seen-guids with items that are at or before the old cutoff
    const seenGuids = items
      .filter((it) => it.parsedDate && cutoff && it.parsedDate <= cutoff)
      .map((it) => extractGuid(it))
      .filter(Boolean);
    return { seenGuids, cutoff, isMigrated: false };
  }

  // No prior state at all (brand-new feed)
  return { seenGuids: [], cutoff: null, isMigrated: false };
}

/**
 * Trim the seenGuids array to at most MAX_SEEN_GUIDS entries, keeping the
 * most recent ones. Because guids are appended in chronological order during
 * a sync run the tail is the newest.
 *
 * @param {string[]} guids
 * @returns {string[]}
 */
function trimGuids(guids) {
  if (guids.length <= MAX_SEEN_GUIDS) return guids;
  return guids.slice(guids.length - MAX_SEEN_GUIDS);
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
          guid: extractGuid(it),
        };
      });

    const sorted = normalized
      .filter((it) => it.parsedDate)
      .sort((a, b) => compareAsc(a.parsedDate, b.parsedDate));

    state.rss = state.rss || {};

    const { seenGuids, cutoff, isMigrated } = resolveFeedState(state.rss, feedUrl, sorted);

    const seenSet = new Set(seenGuids);

    let newItems;
    if (!isMigrated && cutoff === null) {
      // Brand-new feed: only send the latest article to avoid flooding.
      newItems = sorted.slice(-1);
    } else {
      // Filter by both cutoff (coarse) and guid set (precise).
      newItems = sorted.filter((it) => {
        // If we have a cutoff, skip anything older than or equal to it
        // unless the guid is unknown (unlikely but safe).
        if (cutoff && it.parsedDate <= cutoff && seenSet.has(it.guid)) {
          return false;
        }
        // Primary dedup gate: guid already sent
        if (it.guid && seenSet.has(it.guid)) {
          return false;
        }
        return true;
      });
    }

    if (!newItems.length) {
      logger.info({ feedUrl }, 'No new RSS items to send');
      // Still upgrade the state format if we haven't yet
      if (!isMigrated) {
        state.rss[feedUrl] = {
          cutoff: cutoff ? cutoff.toISOString() : null,
          seenGuids: trimGuids(seenGuids),
        };
        stateStore.save(state);
      }
      continue;
    }

    // Send new items and accumulate guids
    const updatedSeenGuids = [...seenGuids];
    let latestCutoff = cutoff;

    for (const item of newItems) {
      const message = formatMessage(item);
      await telegramClient.sendMessage(message);
      logger.info({ feedUrl, title: item.title, guid: item.guid }, 'Sent RSS item to Telegram');

      if (item.guid) {
        updatedSeenGuids.push(item.guid);
        seenSet.add(item.guid);
      }
      if (item.parsedDate && (!latestCutoff || item.parsedDate > latestCutoff)) {
        latestCutoff = item.parsedDate;
      }

      // Persist after each item in case the process is interrupted mid-run
      state.rss[feedUrl] = {
        cutoff: latestCutoff ? latestCutoff.toISOString() : null,
        seenGuids: trimGuids(updatedSeenGuids),
      };
      stateStore.save(state);
    }
  }
}

module.exports = { syncRss };
