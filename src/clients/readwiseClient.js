const axios = require('axios');

class ReadwiseClient {
  constructor(apiToken, logger, { dryRun = false } = {}) {
    this.apiToken = apiToken;
    this.logger = logger;
    this.dryRun = dryRun;
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

  async fetchHighlights() {
    if (!this.canUse()) {
      throw new Error('Readwise API token missing');
    }

    const { data } = await this.http.get('/highlights/', {
      params: {
        page_size: 100,
        order: 'updated',
      },
    });

    const results = data?.results || [];
    return results.map((item) => ({
      id: item.id,
      text: item.text,
      title: item.title || item.book_title || 'Untitled',
      sourceUrl: item.source_url || '',
      note: item.note || '',
      updatedAt: item.updated_at,
      location: item.location,
    }));
  }

  async saveHighlight({ text, title, sourceUrl }) {
    if (!this.canUse()) {
      throw new Error('Readwise API token missing');
    }

    if (this.dryRun) {
      this.logger.info({ title, sourceUrl }, 'DRY_RUN enabled: skipping Readwise highlight creation');
      return;
    }

    await this.http.post('/highlights/', {
      highlights: [
        {
          text,
          title,
          source_url: sourceUrl,
          location_type: 'video',
          location: 0,
        },
      ],
    });
  }
}

module.exports = { ReadwiseClient };
