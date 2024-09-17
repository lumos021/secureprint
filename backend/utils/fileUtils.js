// backend/utils/fileUtils.js
const path = require('path');
const config = require('../config.js');

function validateFilename(filename) {
    if (typeof filename !== 'string' || filename.length === 0) {
        return false;
    }
    
    const extension = path.extname(filename).toLowerCase();
    if (!config.allowedFileTypes.includes(extension)) {
        return false;
    }

    // Check for any potentially malicious characters
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
    return !invalidChars.test(filename);
}

function sanitizeFilename(filename) {
    if (typeof filename !== 'string' || filename.length === 0) {
        throw new Error('Invalid filename provided');
    }
    const basename = path.basename(filename);
    return basename.replace(/[^a-z0-9.-]/gi, '_');
}


// Utility functions
function isValidFileType(mimetype) {
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    return allowedMimeTypes.includes(mimetype);
}

const validatePrintSettings = (settings) => {
    const validColors = ['b&w', 'color'];
    const validOrientations = ['portrait', 'landscape'];
    return validColors.includes(settings.color) && validOrientations.includes(settings.orientation);
  };

  function getResolvedFilePath(filename) {
    if (typeof filename !== 'string' || filename.length === 0) {
        throw new Error('Filename must be a non-empty string');
    }
    console.log('Sanitized filename:', sanitizeFilename(filename));

    return path.resolve(config.uploadDir, sanitizeFilename(filename));
}



module.exports = {
    validateFilename,
    sanitizeFilename,
    isValidFileType,
    validatePrintSettings,
    getResolvedFilePath,
};