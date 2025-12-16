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

  const title =
    (highlight.book && highlight.book.title) ||
    cleanTitle ||
    '(\u672a\u63d0\u4f9b\u6a19\u984c)';

  const bookSourceUrl = highlight.book && highlight.book.source_url;
  const bookReviewUrl = highlight.book && highlight.book.highlights_url;

  const sourceUrl =
    derivedSourceUrl || // parsed from text lines like "URL: ..."
    bookSourceUrl || // original article/book URL
    highlight.sourceUrl || // highlight-level source (may be Readwise)
    highlight.highlightUrl || // Readwise permalink
    bookReviewUrl || // Readwise book review URL
    '';

  const text = remaining.join('\n') || highlight.text || '';
  const author = (highlight.book && highlight.book.author) || '';

  return { title, sourceUrl, text, author };
}

function buildMessage(highlight, book) {
  const normalized = normalizeHighlight({ ...highlight, book });
  const isMailto = normalized.sourceUrl && /^mailto:/i.test(normalized.sourceUrl);
  const sourceLabel = `\u4f86\u6e90: ${isMailto ? '(\u7121)' : normalized.sourceUrl || '\u7121'}`;

  const parts = [
    '\u{1F4DA} \u7cbe\u9078\u6458\u8981 #readwise',
    normalized.title,
    `\u4f5c\u8005: ${normalized.author || '(\u672a\u77e5)'}`,
    sourceLabel,
    '',
    normalized.text || '(\u7a7a\u767d)',
  ];

  if (highlight.note) {
    parts.push('', `\u{1F4A1} Note: ${highlight.note}`);
  }

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

  let books = {};
  const bookIds = newHighlights.map((h) => h.bookId).filter(Boolean);
  if (bookIds.length) {
    try {
      books = await readwiseClient.fetchBooksByIds(bookIds);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Readwise books (skipping enrichment)');
    }
  }

  for (const highlight of newHighlights) {
    const book = highlight.bookId ? books[highlight.bookId] : undefined;
    const message = buildMessage(highlight, book);
    await telegramClient.sendMessage(message);
    logger.info({ highlightId: highlight.id }, 'Sent Readwise highlight to Telegram');
    state.lastReadwiseHighlightUpdatedAt = highlight.updatedAt;
    stateStore.save(state);
  }
}

module.exports = { syncReadwise, buildMessage };
