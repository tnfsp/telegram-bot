/**
 * Single-instance lock using a PID file.
 *
 * On acquire():
 *   - If the lock file does not exist → write current PID, continue.
 *   - If the lock file exists and the recorded PID is still alive → exit(1).
 *   - If the lock file exists but the PID is dead (stale lock) → overwrite and continue.
 *
 * On release() (called via process exit hooks):
 *   - Remove the lock file.
 *
 * @module instanceLock
 */

const fs = require('fs');
const path = require('path');

/**
 * Returns true when a process with `pid` is currently running on this machine.
 * Uses kill(pid, 0) which does not actually send a signal; it only checks
 * whether the process exists and is accessible.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = exists but we can't signal it (still alive)
    return err.code === 'EPERM';
  }
}

/**
 * Acquire the single-instance lock.
 *
 * @param {string} lockFilePath - Absolute or relative path to the PID lock file.
 * @param {import('pino').Logger} logger
 * @returns {void}  Returns normally if the lock was acquired; exits the process otherwise.
 */
function acquireLock(lockFilePath, logger) {
  const absPath = path.resolve(lockFilePath);
  const currentPid = process.pid;

  if (fs.existsSync(absPath)) {
    let existingPid;
    try {
      existingPid = parseInt(fs.readFileSync(absPath, 'utf-8').trim(), 10);
    } catch (_) {
      // Unreadable lock file → treat as stale
      existingPid = NaN;
    }

    if (Number.isFinite(existingPid) && existingPid !== currentPid && isProcessAlive(existingPid)) {
      const msg = `Another bot instance is already running (PID ${existingPid}). Exiting.`;
      if (logger) {
        logger.error({ existingPid }, msg);
      } else {
        console.error(msg);
      }
      process.exit(1);
    }

    // Stale lock (dead PID or unreadable) — overwrite it
    if (logger) {
      logger.warn({ stalePid: existingPid, lockFile: absPath }, 'Stale lock file detected; overwriting');
    }
  }

  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, String(currentPid), 'utf-8');
  } catch (err) {
    if (logger) {
      logger.error({ err, lockFile: absPath }, 'Failed to write lock file; proceeding without lock');
    } else {
      console.error('Failed to write lock file:', err);
    }
    return; // Non-fatal: we tried; better to run than to hard-fail.
  }

  if (logger) {
    logger.info({ pid: currentPid, lockFile: absPath }, 'Instance lock acquired');
  }

  // Register cleanup handlers so the lock is released on any normal exit
  const releaseLock = () => {
    try {
      if (fs.existsSync(absPath)) {
        const storedPid = parseInt(fs.readFileSync(absPath, 'utf-8').trim(), 10);
        // Only remove the file if it still belongs to us
        if (storedPid === currentPid) {
          fs.unlinkSync(absPath);
        }
      }
    } catch (_) {
      // Best-effort; ignore errors during shutdown
    }
  };

  process.once('exit', releaseLock);
  process.once('SIGINT', () => { releaseLock(); process.exit(0); });
  process.once('SIGTERM', () => { releaseLock(); process.exit(0); });
  process.once('uncaughtException', (err) => {
    if (logger) logger.fatal({ err }, 'Uncaught exception; releasing lock and exiting');
    releaseLock();
    process.exit(1);
  });
}

module.exports = { acquireLock };
