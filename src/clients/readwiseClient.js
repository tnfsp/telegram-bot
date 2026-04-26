const axios = require('axios');

class ReadwiseClient {
  constructor(apiToken, logger, { dryRun = false } = {}) {
    this.apiToken = apiToken;
    this.logger = logger;
    this.dryRun = dryRun;
    this.bookCache = new Map();
    this.http = axios.create({
      baseURL: 'https://readwise.io/api/v2',
      timeout: 30000,
      headers: {
        Authorization: `Token ${apiToken}`,
      },
    });
    this.http.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        if (!config || config.__retried) return Promise.reject(error);
        const status = error.response?.status;
        const retriable =
          error.code === 'ECONNABORTED' ||
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          status === 429 ||
          (status >= 500 && status < 600);
        if (!retriable) return Promise.reject(error);
        config.__retried = true;
        if (this.logger) {
          this.logger.warn(`[readwise] retry once: ${error.code || status} ${config.url || ''}`);
        }
        return this.http.request(config);
      }
    );
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
