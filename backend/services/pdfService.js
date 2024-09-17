const fs = require('fs').promises;
const path = require('path');

const pdfUtilsPath = path.join(__dirname, '../utils/pdfUtils.js');
const utilsDir = path.join(__dirname, '../utils');

async function checkFiles() {
  try {
    const stats = await fs.stat(pdfUtilsPath);
    console.log('pdfUtils permissions:', stats.mode.toString(8));

    const content = await fs.readFile(pdfUtilsPath, 'utf8');
    console.log('pdfUtils content:', content);

    const dirContents = await fs.readdir(utilsDir);
    console.log('Contents of utils directory:', dirContents);

    console.log('pdfUtils path:', pdfUtilsPath);

    try {
      await fs.access(pdfUtilsPath);
      console.log('pdfUtils exists: true');
    } catch {
      console.log('pdfUtils exists: false');
    }
  } catch (error) {
    console.error('Error checking files:', error);
  }
}

checkFiles();

// Use absolute paths
const { convertToBlackAndWhite, rotatePDFToLandscape, mergeProcessedPDFs } = require(pdfUtilsPath);
const { PDFDocument, degrees } = require('pdf-lib');

const logger = require('../utils/logger.js');

const handlePdfProcessing = async (filePath, processedFilePath, printSettings) => {
  const startTime = Date.now();
  try {
    if (printSettings.color === 'b&w') {
      await convertToBlackAndWhite(filePath, processedFilePath);
      if (printSettings.orientation === 'landscape') {
        await rotatePDFToLandscape(processedFilePath, processedFilePath);
      }
    } else {
      const existingPdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);

      if (printSettings.orientation === 'landscape') {
        pdfDoc.getPages().forEach(page => page.setRotation(degrees(90)));
      }

      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(processedFilePath, pdfBytes);
    }
    const duration = Date.now() - startTime;
    logger.info('PDF processing completed', {
      filePath,
      processedFilePath,
      printSettings,
      duration: `${duration}ms`
    });
  } catch (error) {
    logger.error('Error processing PDF file', {
      error: error.message,
      stack: error.stack,
      filePath,
      processedFilePath,
      printSettings
    });
    throw new Error('Error processing PDF file');
  }
};

const handleImageProcessing = async (filePath, processedFilePath, printSettings) => {
  const startTime = Date.now();
  try {
    const imageBytes = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.create();
    const embeddedImage = path.extname(filePath).toLowerCase() === '.png'
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });

    if (printSettings.orientation === 'landscape') {
      page.setRotation(degrees(90));
    }
    // Set PDF metadata
    pdfDoc.setTitle(path.basename(filePath, path.extname(filePath)));
    pdfDoc.setAuthor('secureprint');

    const pdfBytes = await pdfDoc.save();

    // Update the processedFilePath to have a .pdf extension
    const pdfFilePath = processedFilePath.replace(path.extname(processedFilePath), '.pdf');

    await fs.writeFile(pdfFilePath, pdfBytes);

    if (printSettings.color === 'b&w') {
      await convertToBlackAndWhite(pdfFilePath, pdfFilePath);
    }

    const duration = Date.now() - startTime;
    logger.info('Image processing completed', {
      filePath,
      processedFilePath: pdfFilePath, // Log with the updated PDF filename
      printSettings,
      duration: `${duration}ms`
    });
  } catch (error) {
    logger.error('Error processing image file', {
      error: error.message,
      stack: error.stack,
      filePath,
      processedFilePath,
      printSettings
    });
    throw new Error('Error processing image file');
  }
};


module.exports = {
  handlePdfProcessing,
  handleImageProcessing,
  mergeProcessedPDFs
};
