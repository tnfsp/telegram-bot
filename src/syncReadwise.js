const { parseISO, isAfter, compareAsc } = require('date-fns');

function normalizeHighlight(highlight) {
  // Try to extract heading and URL from the text if present.
  const lines = (highlight.text || '').split(/\r?\n/);
  let derivedTitle = '';
  let derivedSourceUrl = '';
  const remaining = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!derivedTitle && /^#+\s+/.test(line)) {
      derivedTitle = line.replace(/^#+\s+/, '').trim();
      continue;
    }
    const urlMatch = line.match(/^URL:\s*(\S+)/i);
    if (!derivedSourceUrl && urlMatch) {
      derivedSourceUrl = urlMatch[1];
      continue;
    }
    remaining.push(line);
  }

  const cleanTitle =
    (highlight.title && highlight.title.toLowerCase() !== 'untitled' && highlight.title) ||
    (derivedTitle && derivedTitle.toLowerCase() !== 'untitled' && derivedTitle) ||
    (highlight.bookTitle && highlight.bookTitle.toLowerCase() !== 'untitled' && highlight.bookTitle) ||
    '';

  const title = cleanTitle ? `【${cleanTitle}】` : '【摘錄】';
  const sourceUrl = highlight.sourceUrl || derivedSourceUrl || '';
  const text = remaining.join('\n') || highlight.text || '';

  return { title, sourceUrl, text };
}

function buildMessage(highlight) {
  const normalized = normalizeHighlight(highlight);
  const sourceLabel = normalized.sourceUrl ? `🔗 來源：${normalized.sourceUrl}` : '🔗 來源：未提供';
  const parts = [`📚 精選摘錄 #readwise`, normalized.title, normalized.text];
  if (highlight.note) parts.push(`💡 Note: ${highlight.note}`);
  parts.push(sourceLabel);
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
