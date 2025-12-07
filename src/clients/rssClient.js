const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { getProxyAgent } = require('../proxy');

class RssClient {
  constructor(logger) {
    this.logger = logger;
    const agent = getProxyAgent(logger);
    this.http = axios.create({
      timeout: 15000,
      httpsAgent: agent,
      proxy: agent ? false : undefined,
    });
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
  }

  async fetchFeed(url) {
    try {
      const { data } = await this.http.get(url);
      const parsed = this.parser.parse(data);
      const rawItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
      // Ensure array shape
      const items = Array.isArray(rawItems) ? rawItems : [rawItems].filter(Boolean);
      return items.map((item) => ({
        title: item.title || 'Untitled',
        link: item.link?.href || item.link || '',
        publishedAt: item.pubDate || item.published || item.updated || null,
        description: item.description || item.summary || '',
      }));
    } catch (err) {
      this.logger.error({ url, status: err.response?.status }, 'RSS fetch failed');
      throw err;
    }
  }
}

module.exports = { RssClient };
