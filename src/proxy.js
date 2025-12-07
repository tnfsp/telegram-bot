const { HttpsProxyAgent } = require('https-proxy-agent');

function getProxyAgent(logger) {
  const proxyUrl = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return undefined;
  try {
    return new HttpsProxyAgent(proxyUrl);
  } catch (err) {
    logger?.error({ err }, 'Invalid proxy URL');
    return undefined;
  }
}

module.exports = { getProxyAgent };
