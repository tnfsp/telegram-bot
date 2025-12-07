const pino = require('pino');

let logger;

function createLogger(level = 'info') {
  if (logger) return logger;
  logger = pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'SYS:standard',
        colorize: true,
      },
    },
  });
  return logger;
}

module.exports = { createLogger };
