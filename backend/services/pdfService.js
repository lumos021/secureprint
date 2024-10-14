const fs = require('fs').promises;
const path = require('path');

const pdfUtilsPath = path.join(__dirname, '../utils/utils.js');

const { convertToBlackAndWhite, rotatePDFToLandscape, mergeProcessedPDFs, combinePagesPerSheet } = require(pdfUtilsPath);
const { PDFDocument, degrees } = require('pdf-lib');

const logger = require('../utils/logger.js');

const mergeAndCombineFiles = async (filesData, settings, newFile = null) => {
  const startTime = Date.now();
  const outputPath = path.join(__dirname, '../uploads', `merged-${Date.now()}.pdf`);
  let pdfDocs = [];

  try {
    logger.info('Starting mergeAndCombineFiles', { filesCount: filesData.length, settings, newFile });

    // Process existing files
    for (const fileData of filesData) {
      const filePath = path.join(__dirname, '../uploads', fileData.filename);
      const fileBytes = await fs.readFile(filePath);

      if (fileData.mimetype.startsWith('image/')) {
        pdfDocs.push(await createPdfFromImage(fileBytes, fileData.mimetype));
      } else {
        pdfDocs.push(await PDFDocument.load(fileBytes));
      }
    }

    // Process new file if exists
    if (newFile) {
      const newFilePath = path.join(__dirname, '../uploads', newFile.filename);
      const newFileBytes = await fs.readFile(newFilePath);

      if (newFile.mimetype.startsWith('image/')) {
        pdfDocs.push(await createPdfFromImage(newFileBytes, newFile.mimetype));
      } else {
        pdfDocs.push(await PDFDocument.load(newFileBytes));
      }
    }

    // Merge all PDFs
    let mergedPdf = await PDFDocument.create();
    for (const pdfDoc of pdfDocs) {
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    // Apply color and orientation settings
    if (settings.color === 'b&w') {
      const tempPath = path.join(path.dirname(outputPath), `temp-${Date.now()}.pdf`);
      await fs.writeFile(tempPath, await mergedPdf.save());
      await convertToBlackAndWhite(tempPath, tempPath);
      mergedPdf = await PDFDocument.load(await fs.readFile(tempPath));
      await fs.unlink(tempPath);
    }

    if (settings.orientation === 'landscape') {
      logger.info('Rotating PDF to landscape');
      mergedPdf = await rotateToLandscape(mergedPdf);
      logger.info('PDF rotation completed');
    }

    // Apply pages per sheet
    const pagesPerSheet = parseInt(settings.pagesPerSheet, 10);
    const totalPages = mergedPdf.getPageCount();
    const processedFiles = [];

    if (pagesPerSheet > 1) {
      const fullSheets = Math.floor(totalPages / pagesPerSheet);
      const remainingPages = totalPages % pagesPerSheet;

      if (fullSheets > 0) {
        const mainFileName = `merged-main-${Date.now()}.pdf`;
        const mainFilePath = path.join(__dirname, '../uploads', mainFileName);
        await fs.writeFile(mainFilePath, await mergedPdf.save());
        await combinePagesPerSheet(mainFilePath, mainFilePath, pagesPerSheet);
        processedFiles.push(mainFileName);
      }

      if (remainingPages > 0) {
        const remainingFileName = `merged-remaining-${Date.now()}.pdf`;
        const remainingFilePath = path.join(__dirname, '../uploads', remainingFileName);
        const remainingPdf = await PDFDocument.create();
        const copiedPages = await remainingPdf.copyPages(mergedPdf, mergedPdf.getPageIndices().slice(-remainingPages));
        copiedPages.forEach(page => remainingPdf.addPage(page));
        await fs.writeFile(remainingFilePath, await remainingPdf.save());
        await combinePagesPerSheet(remainingFilePath, remainingFilePath, pagesPerSheet);
        processedFiles.push(remainingFileName);
      }
    } else {
      await fs.writeFile(outputPath, await mergedPdf.save());
      processedFiles.push(path.basename(outputPath));
    }

    const duration = Date.now() - startTime;
    logger.info('Files merged and combined successfully', { processedFiles, settings, duration: `${duration}ms` });

    return {
      success: true,
      processedFilenames: processedFiles
    };
  } catch (error) {
    logger.error('Error merging and combining files', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: 'Error merging and combining files',
      errorDetails: error.message
    };
  }
};

// Helper functions

const createPdfFromImage = async (imageBytes, mimetype) => {
  const pdfDoc = await PDFDocument.create();
  const image = mimetype === 'image/png'
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);
  const page = pdfDoc.addPage();
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  return pdfDoc;
};

const rotateToLandscape = async (pdfDoc) => {
  const pdfBytes = await pdfDoc.save();
  const rotatedPdf = await PDFDocument.load(pdfBytes);
  rotatedPdf.getPages().forEach(page => page.setRotation(degrees(90)));
  return rotatedPdf;
};

const saveAndAddToProcessedFiles = async (pdfDoc, fileName, processedFiles) => {
  const filePath = path.join(__dirname, '../uploads', fileName);
  await fs.writeFile(filePath, await pdfDoc.save());
  processedFiles.push(fileName);
};

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
    return {
      success: true,
      processedFilename: path.basename(processedFilePath)
    };
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
    return { success: true, processedFilename: path.basename(pdfFilePath) };
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
  mergeProcessedPDFs,
  mergeAndCombineFiles
};
