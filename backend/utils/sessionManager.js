const crypto = require('crypto');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
  }

  createSession() {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      files: [],
      lastActivity: Date.now()
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
      
      // Check if session has no files, and delete the session
      if (session.files.length === 0) {
        this.clearSession(sessionId);
      }
    }
  }

  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  cleanupInactiveSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeout) {
        this.clearSession(sessionId);
      }
    }
  }
}

module.exports = new SessionManager();
