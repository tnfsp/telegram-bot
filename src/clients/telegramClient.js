const axios = require('axios');
const { getProxyAgent } = require('../proxy');

class TelegramClient {
  constructor(botToken, channelId, logger, { dryRun = false } = {}) {
    this.botToken = botToken;
    this.channelId = channelId;
    this.logger = logger;
    this.dryRun = dryRun;
    const agent = getProxyAgent(this.logger);
    this.http = axios.create({
      baseURL: `https://api.telegram.org/bot${botToken}`,
      timeout: 20000,
      httpsAgent: agent,
      proxy: agent ? false : undefined,
    });
  }

  canSend() {
    return Boolean(this.botToken && this.channelId);
  }

  async sendMessage(text) {
    if (!this.canSend()) {
      throw new Error('Telegram bot token or channel ID missing');
    }

    if (this.dryRun) {
      this.logger.info({ preview: text }, 'DRY_RUN enabled: skipping Telegram send');
      return;
    }

    const maxAttempts = 3;
    let attempt = 0;
    // Basic retry loop to handle transient network errors/timeouts.
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await this.http.post('/sendMessage', {
          chat_id: this.channelId,
          text,
          disable_web_page_preview: false,
        });
        return;
      } catch (err) {
        const isLast = attempt === maxAttempts;
        this.logger.error(
          {
            attempt,
            status: err.response?.status,
            data: err.response?.data,
            code: err.code,
          },
          'Telegram send failed',
        );
        if (isLast) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
}

module.exports = { TelegramClient };
