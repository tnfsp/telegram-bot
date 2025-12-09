const axios = require('axios');

class ReadwiseClient {
  constructor(apiToken, logger, { dryRun = false } = {}) {
    this.apiToken = apiToken;
    this.logger = logger;
    this.dryRun = dryRun;
    this.bookCache = new Map();
    this.http = axios.create({
      baseURL: 'https://readwise.io/api/v2',
      timeout: 15000,
      headers: {
        Authorization: `Token ${apiToken}`,
      },
    });
  }

  canUse() {
    return Boolean(this.apiToken);
  }

  async fetchHighlights({ updatedAfter } = {}) {
    if (!this.canUse()) {
      throw new Error('Readwise API token missing');
    }

    const params = {
      page_size: 100,
      order: 'updated',
    };
    if (updatedAfter) params.updated_after = updatedAfter;

    let pageCursor = undefined;
    const items = [];
    do {
      const { data } = await this.http.get('/highlights/', {
        params: pageCursor ? { ...params, pageCursor } : params,
      });
      const results = data?.results || [];
      items.push(
        ...results.map((item) => ({
          id: item.id,
          text: item.text,
          title: item.title || item.book_title || 'Untitled',
          bookTitle: item.book_title || '',
          // Prefer the original source URL; fall back to the Readwise permalink if missing.
          sourceUrl: item.source_url || item.url || '',
          highlightUrl: item.url || '',
          bookId: item.book_id || null,
          note: item.note || '',
          updatedAt: item.updated_at || item.updated,
          location: item.location,
        })),
      );
      pageCursor = data?.nextPageCursor;
    } while (pageCursor);

    return items;
  }

  async saveHighlight({ text, title, sourceUrl, locationType = 'article', location = 0 }) {
    if (!this.canUse()) {
      throw new Error('Readwise API token missing');
    }

    if (this.dryRun) {
      this.logger.info({ title, sourceUrl }, 'DRY_RUN enabled: skipping Readwise highlight creation');
      return;
    }

    try {
      await this.http.post('/highlights/', {
        highlights: [
          {
            text,
            title,
            source_url: sourceUrl,
            location_type: locationType, // Readwise does not accept "video"; use "article" by default
            location,
          },
        ],
      });
    } catch (err) {
      this.logger.error(
        {
          status: err.response?.status,
          data: err.response?.data,
        },
        'Readwise highlight creation failed',
      );
      throw err;
    }
  }

  async fetchBooksByIds(ids = []) {
    if (!this.canUse()) {
      throw new Error('Readwise API token missing');
    }
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return {};

    const missing = unique.filter((id) => !this.bookCache.has(id));
    for (const id of missing) {
      try {
        const { data } = await this.http.get(`/books/${id}/`);
        this.bookCache.set(id, data);
      } catch (err) {
        this.logger.error(
          { id, status: err.response?.status, data: err.response?.data },
          'Readwise book fetch failed',
        );
      }
    }

    const result = {};
    for (const id of unique) {
      const book = this.bookCache.get(id);
      if (book) result[id] = book;
    }
    return result;
  }
}

module.exports = { ReadwiseClient };
