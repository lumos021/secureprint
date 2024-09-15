const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, degrees } = require('pdf-lib');
const { exec } = require('child_process');
const os = require('os');
const util = require('util');
const logger = require('../utils/logger.js');


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

const mergeProcessedPDFs = async (filesData, printSettings) => {
    const mergedPdf = await PDFDocument.create();
  
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
  
    return { finalFilename, finalFilePath };
  };
  

module.exports = {
    convertToBlackAndWhite,
    rotatePDFToLandscape,
    mergeProcessedPDFs
};
