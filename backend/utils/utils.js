const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, degrees } = require('pdf-lib');
const { exec } = require('child_process');
const os = require('os');
const util = require('util');
const logger = require('./logger.js');


const execAsync = util.promisify(exec);

const convertToBlackAndWhite = async (inputPath, outputPath) => {
    const tempPath = path.join(path.dirname(outputPath), `temp-${path.basename(outputPath)}`);

    // Convert PDF to an earlier version to ensure compatibility with Ghostscript
    try {
        const existingPdfBytes = await fs.readFile(inputPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        await fs.writeFile(tempPath, pdfBytes);
    } catch (error) {
        console.error('Error re-encoding PDF:', error);
        throw new Error('Failed to re-encode PDF for compatibility');
    }

    try {
        const platform = os.platform();
        const gsCommand = platform === 'win32'
            ? `"C:\\Program Files\\gs\\gs10.03.1\\bin\\gswin64c.exe" -sOutputFile="${outputPath}" -sDEVICE=pdfwrite -sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray -dCompatibilityLevel=1.4 -dPDFSETTINGS=/printer -dNOPAUSE -dBATCH "${tempPath}"`
            : `gs -o "${outputPath}" -sDEVICE=pdfwrite -sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray -dCompatibilityLevel=1.4 -dPDFSETTINGS=/printer -dNOPAUSE -dBATCH "${tempPath}"`;

        console.log('Executing Ghostscript command:', gsCommand);

        const { stdout, stderr } = await execAsync(gsCommand);
        await fs.unlink(tempPath);  // Clean up temporary file

        if (stderr) {
            console.error(`Ghostscript stderr: ${stderr}`);
        }

        console.log(`Ghostscript stdout: ${stdout}`);
    } catch (error) {
        console.error('Error converting PDF to black and white:', error);
        throw new Error('Failed to convert PDF to black and white');
    }
};

const rotatePDFToLandscape = async (inputPath, outputPath) => {
    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const pages = pdfDoc.getPages();
    pages.forEach(page => {
        page.setRotation(degrees(90));
    });

    const modifiedPdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, modifiedPdfBytes);
};

const combinePagesPerSheet = async (inputPath, outputPath, pagesPerSheet) => {
    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
  
    const newPdfDoc = await PDFDocument.create();
    const { width, height } = pages[0].getSize();
  
    // Define gap size (adjust as needed)
    const gap = 5; // 5 points gap
  
    for (let i = 0; i < pages.length; i += pagesPerSheet) {
      const newPage = newPdfDoc.addPage([width, height]);
      const pagesInSheet = Math.min(pagesPerSheet, pages.length - i);
  
      for (let j = 0; j < pagesInSheet; j++) {
        const pageIndex = i + j;
        const embeddedPage = await newPdfDoc.embedPage(pages[pageIndex]);
  
        let x, y, scaleFactor;
        if (pagesPerSheet === 2) {
          // Center-align and stack pages vertically with gap
          scaleFactor = (height - gap) / (2 * height);
          const scaledHeight = height * scaleFactor;
          x = (width - width * scaleFactor) / 2; // Center horizontally
          y = height - scaledHeight - (j * (scaledHeight + gap)); // Start from top with gap
        } else if (pagesPerSheet === 4) {
          scaleFactor = (width - gap) / (2 * width);
          const scaledWidth = width * scaleFactor;
          const scaledHeight = height * scaleFactor;
          x = (j % 2) * (scaledWidth + gap);
          y = height - scaledHeight - Math.floor(j / 2) * (scaledHeight + gap);
        } else if (pagesPerSheet === 9) {
          scaleFactor = (width - 2 * gap) / (3 * width);
          const scaledWidth = width * scaleFactor;
          const scaledHeight = height * scaleFactor;
          x = (j % 3) * (scaledWidth + gap);
          y = height - scaledHeight - Math.floor(j / 3) * (scaledHeight + gap);
        }
  
        newPage.drawPage(embeddedPage, {
          x,
          y,
          width: width * scaleFactor,
          height: height * scaleFactor,
        });
      }
    }
  
    const newPdfBytes = await newPdfDoc.save();
    await fs.writeFile(outputPath, newPdfBytes);
  };

const mergeProcessedPDFs = async (filesData, printSettings) => {
  const mergedPdf = await PDFDocument.create();
  let totalPageCount = 0;

  for (const fileData of filesData) {
      const pdfPath = path.join(__dirname, '../uploads', fileData.filename);
      try {
          const pdfBytes = await fs.readFile(pdfPath);
          const pdfDoc = await PDFDocument.load(pdfBytes);

          // Check if the PDF is valid
          if (!pdfDoc.getPages().length) {
              throw new Error('PDF has no pages');
          }

          const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach(page => {
              mergedPdf.addPage(page);
          });

          // Add the page count of this PDF to the total
          totalPageCount += pdfDoc.getPageCount();
      } catch (error) {
          logger.error('Error loading or merging PDF', {
              filename: fileData.filename,
              error: error.message,
              stack: error.stack,
          });
          throw new Error(`Error processing file ${fileData.filename}: ${error.message}`);
      }
  }

  const mergedPdfBytes = await mergedPdf.save();

  const finalFilename = `merged-${Date.now()}.pdf`;
  const finalFilePath = path.join(__dirname, '../uploads', finalFilename);

  await fs.writeFile(finalFilePath, mergedPdfBytes);

  return { finalFilename, finalFilePath, pageCount: totalPageCount };
};

module.exports = {
    convertToBlackAndWhite,
    rotatePDFToLandscape,
    mergeProcessedPDFs,
    combinePagesPerSheet
};
