const axios = require('axios');

class YouTubeClient {
  constructor(apiKey, logger) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.http = axios.create({
      baseURL: 'https://www.googleapis.com/youtube/v3',
      timeout: 15000,
    });
  }

  async fetchPlaylistItems(playlistId, maxPages = 2) {
    if (!this.apiKey || !playlistId) {
      throw new Error('YouTube API key or playlist ID missing');
    }

    const trimmedPlaylistId = playlistId.trim();
    if (trimmedPlaylistId.endsWith('.')) {
      throw new Error('YouTube playlist ID looks invalid (trailing period)');
    }

    let pageToken = undefined;
    let pagesFetched = 0;
    const items = [];

    while (pagesFetched < maxPages) {
      pagesFetched += 1;
      const params = {
        part: 'snippet,contentDetails',
        playlistId: trimmedPlaylistId,
        maxResults: 50,
        key: this.apiKey,
      };
      if (pageToken) params.pageToken = pageToken;

      let data;
      try {
        ({ data } = await this.http.get('/playlistItems', { params }));
      } catch (err) {
        const status = err.response?.status;
        const errorData = err.response?.data;
        this.logger.error(
          { status, errorData, playlistId: trimmedPlaylistId },
          'YouTube API request failed',
        );
        throw err;
      }
      const pageItems =
        data.items?.map((item) => ({
          id: item.contentDetails?.videoId,
          title: item.snippet?.title,
          description: item.snippet?.description || '',
          publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt,
        })) || [];

      items.push(...pageItems);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return items.filter((item) => item.id && item.publishedAt);
  }
}

module.exports = { YouTubeClient };
