const { parentPort } = require('worker_threads');
const { handlePdfProcessing, handleImageProcessing, mergeProcessedPDFs, mergeAndCombineFiles } = require('../services/pdfService.js');
const logger = require('../utils/logger.js');

parentPort.on('message', async (task) => {
    try {
        logger.info(`Starting task: ${task.type}`, { taskDetails: JSON.stringify(task) });
        let result;
        switch (task.type) {
            case 'pdf':
                result = await handlePdfProcessing(task.filePath, task.processedFilePath, task.settings);
                break;
            case 'image':
                result = await handleImageProcessing(task.filePath, task.processedFilePath, task.settings);
                break;
            case 'mergeAndCombine':
                result = await mergeAndCombineFiles(task.filesData, task.settings);
                break;
            case 'mergePDFs':
                result = await mergeProcessedPDFs(task.filesData, task.printSettings);
                break;
            default:
                throw new Error('Invalid task type');
        }
        logger.info(`Task completed successfully: ${task.type}`, { result: JSON.stringify(result) });
        parentPort.postMessage({ success: true, ...result });
    } catch (error) {
        logger.error(`Error in task: ${task.type}`, { 
            error: error.message, 
            stack: error.stack,
            taskType: task.type, 
            taskFile: task.filePath || JSON.stringify(task.filesData)
        });
        parentPort.postMessage({ 
            success: false, 
            error: error.message, 
            taskType: task.type, 
            taskFile: task.filePath || JSON.stringify(task.filesData)
        });
    }
});