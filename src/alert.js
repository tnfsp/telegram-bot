function createAlerter(telegramClient, logger, { enabled = true, chatId, threadId } = {}) {
  const canAlert = enabled && telegramClient && telegramClient.canSend();

  async function sendAlert(text, meta = {}) {
    if (!canAlert) {
      logger?.warn({ text }, 'Alert skipped (disabled or Telegram not configured)');
      return;
    }
    const safeText = text.slice(0, 3500);
    try {
      await telegramClient.sendMessage(`⚠️ Bridge alert\n${safeText}`, {
        chatId: chatId || telegramClient.channelId,
        threadId,
      });
    } catch (err) {
      logger?.error(
        {
          err,
          meta,
          errCode: err?.code,
          errStatus: err?.response?.status,
          errCause: err?.cause?.message,
          errBody: err?.response?.data,
        },
        'Failed to send alert',
      );
    }
  }

  return { sendAlert };
}

module.exports = { createAlerter };
