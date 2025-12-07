const { parseISO, isAfter, compareAsc } = require('date-fns');

function buildMessage(highlight) {
  const sourceLabel = highlight.sourceUrl ? `🔗 來源：${highlight.sourceUrl}` : '';
  const title = highlight.title ? `【${highlight.title}】` : '';
  const parts = [`📚 精選摘錄 #readwise`, title || '【摘錄】', highlight.text];
  if (highlight.note) parts.push(`💡 Note: ${highlight.note}`);
  if (sourceLabel) parts.push(sourceLabel);
  return parts.join('\n');
}

async function syncReadwise({
  readwiseClient,
  telegramClient,
  state,
  stateStore,
  logger,
}) {
  if (!readwiseClient || !telegramClient) {
    throw new Error('Readwise or Telegram client not configured');
  }

  const lastUpdated = state.lastReadwiseHighlightUpdatedAt;
  const highlights = await readwiseClient.fetchHighlights({
    updatedAfter: lastUpdated,
  });
  if (!highlights.length) {
    logger.info('No highlights returned from Readwise');
    return;
  }

  const withDates = highlights.filter((h) => h.updatedAt);
  const sorted = withDates.sort((a, b) => compareAsc(parseISO(a.updatedAt), parseISO(b.updatedAt)));

  let newHighlights;
  if (lastUpdated) {
    const cutoff = parseISO(lastUpdated);
    newHighlights = sorted.filter((h) => isAfter(parseISO(h.updatedAt), cutoff));
  } else {
    // First run: send a small sample (latest 3) to avoid flooding.
    newHighlights = sorted.slice(-3);
  }

  if (!newHighlights.length) {
    logger.info('No new Readwise highlights to send');
    return;
  }

  for (const highlight of newHighlights) {
    const message = buildMessage(highlight);
    await telegramClient.sendMessage(message);
    logger.info({ highlightId: highlight.id }, 'Sent Readwise highlight to Telegram');
    state.lastReadwiseHighlightUpdatedAt = highlight.updatedAt;
    stateStore.save(state);
  }
}

module.exports = { syncReadwise };
