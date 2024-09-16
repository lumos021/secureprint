const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger.js');
const File = require('../models/fileModel.js');
const { getResolvedFilePath } = require('../utils/fileUtils.js');

class SessionManager {
  constructor(cleanupInterval = 15 * 60 * 1000, sessionTimeout = 30 * 60 * 1000) {
    this.sessions = new Map();
    this.cleanupInterval = cleanupInterval; // 15 minutes
    this.sessionTimeout = sessionTimeout; // 30 minutes
    this.startCleanupTask();
  }

  createSession() {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      files: [],
      lastActivity: Date.now(),
      mergedFilename: null
    };
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  addFileToSession(sessionId, fileData) {
    const session = this.getSession(sessionId);
    if (session) {
      session.files.push(fileData);
      session.lastActivity = Date.now();
    }
  }

  removeFileFromSession(sessionId, filename) {
    const session = this.getSession(sessionId);
    if (session) {
      session.files = session.files.filter(file => file.filename !== filename);
      session.lastActivity = Date.now();

      if (session.files.length === 0) {
        this.clearSession(sessionId);
      }
    }
  }

  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  getAllSessions() {
    return this.sessions;
  }

  updateLastActivity(sessionId) {
    const session = this.getSession(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  setMergedFilename(sessionId, filename) {
    const session = this.getSession(sessionId);
    if (session) {
      session.mergedFilename = filename;
    }
  }

  startCleanupTask() {
    setInterval(() => this.cleanupInactiveSessions(), this.cleanupInterval);
  }

  async cleanupInactiveSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeout) {
        try {
          await this.cleanupSession(session);
          this.clearSession(sessionId);
          logger.info(`Cleaned up inactive session: ${sessionId}`);
        } catch (error) {
          logger.error(`Error cleaning up session ${sessionId}`, { error: error.message, stack: error.stack });
        }
      }
    }
  }

  async cleanupSession(session) {
    const filesToDelete = [];

    // Add original and processed files
    for (const file of session.files) {
      filesToDelete.push(getResolvedFilePath(file.filename));
      if (file.processedFilename) {
        filesToDelete.push(getResolvedFilePath(file.processedFilename));
      }
    }

    // Add the final merged file if it exists
    if (session.mergedFilename) {
      filesToDelete.push(getResolvedFilePath(session.mergedFilename));
    }

    // Delete files from uploads directory
    for (const filePath of filesToDelete) {
      try {
        await fs.unlink(filePath);
        logger.info(`Deleted file: ${filePath}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Failed to delete file: ${filePath}`, { error: error.message });
        }
      }
    }

    // Delete files from database
    const filenames = session.files.map(file => file.filename);
    const processedFilenames = session.files
      .filter(file => file.processedFilename)
      .map(file => file.processedFilename);

    await File.deleteMany({
      $or: [
        { filename: { $in: filenames } },
        { processedFilename: { $in: processedFilenames } }
      ]
    });

    logger.info('Cleanup completed', {
      sessionId: session.id,
      deletedFilesCount: filesToDelete.length
    });
  }
}

module.exports = new SessionManager();