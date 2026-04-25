const fs = require('fs');
const path = require('path');

function createHeartbeat(filePath, logger) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return {
    touch(source) {
      try {
        fs.writeFileSync(
          resolved,
          JSON.stringify({ lastSuccessfulSync: new Date().toISOString(), source }),
          'utf-8',
        );
      } catch (err) {
        logger?.warn({ err }, 'Failed to write heartbeat');
      }
    },
  };
}

module.exports = { createHeartbeat };
