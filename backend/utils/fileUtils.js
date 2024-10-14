// backend/utils/fileUtils
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
    const validPagesPerSheet = [1, 2, 4, 9]; // Supported values for pages per sheet
    console.log('Validating print settings:', settings);

    if (!validColors.includes(settings.color)) {
        return {
            isValid: false,
            message: 'Invalid color option. Valid options are "b&w" and "color".'
        };
    }
    if (!validOrientations.includes(settings.orientation)) {
        return {
            isValid: false,
            message: 'Invalid orientation. Valid options are "portrait" and "landscape".'
        };
    }
    if (!validPagesPerSheet.includes(settings.pagesPerSheet || 1)) {
        return {
            isValid: false,
            message: `Invalid pagesPerSheet value. Supported values are ${validPagesPerSheet.join(', ')}.`
        };
    }

    return {
        isValid: true,
        message: 'Validation passed'
    }; // All validations passed
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