// workers/fileProcessingWorker.js
const { parentPort } = require('worker_threads');
const { handlePdfProcessing, handleImageProcessing, mergeProcessedPDFs } = require('../services/pdfService.js');

parentPort.on('message', async (task) => {
    try {
        let result;
        switch (task.type) {
            case 'pdf':
                result = await handlePdfProcessing(task.filePath, task.processedFilePath, task.settings);
                break;
            case 'image':
                result = await handleImageProcessing(task.filePath, task.processedFilePath, task.settings);
                break;
            case 'mergePDFs':
                result = await mergeProcessedPDFs(task.filesData, task.printSettings);
                break;
            default:
                throw new Error('Invalid task type');
        }
        parentPort.postMessage({ success: true, ...result }); // Include result properties
    } catch (error) {
        parentPort.postMessage({ success: false, error: error.message });
    }
});
