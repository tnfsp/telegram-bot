const fs = require('fs');
const path = require('path');

const DEFAULT_STATE = {
  lastYouTubePublishedAt: {}, // keyed by playlistId
  lastReadwiseHighlightUpdatedAt: null,
  rss: {},
};

function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

class StateStore {
  constructor(filePath, logger) {
    this.filePath = filePath;
    this.logger = logger;
    ensureDirectoryExists(filePath);
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.logger.info({ path: this.filePath }, 'State file not found, creating with defaults');
        this.save(DEFAULT_STATE);
        return { ...DEFAULT_STATE };
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Migrate legacy single-value lastYouTubePublishedAt to object.
      const state = { ...DEFAULT_STATE, ...parsed };
      if (typeof state.lastYouTubePublishedAt === 'string') {
        state.lastYouTubePublishedAt = { default: state.lastYouTubePublishedAt };
      }
      return state;
    } catch (err) {
      this.logger.error({ err }, 'Failed to load state file, falling back to defaults');
      return { ...DEFAULT_STATE };
    }
  }

  save(state) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error({ err }, 'Failed to persist state file');
      throw err;
    }
  }
}

module.exports = { StateStore, DEFAULT_STATE };
