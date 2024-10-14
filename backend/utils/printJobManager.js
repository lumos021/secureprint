const PrintJob = require('../models/printJobModel');
const logger = require('./logger');

exports.updatePrintJobStatus = async (jobId, status, clientId, progressPercentage, errorMessage) => {
    try {
        const updateData = {
            status,
            clientId,
            lastUpdate: new Date()
        };

        if (progressPercentage !== undefined) {
            updateData.progressPercentage = progressPercentage;
        }

        if (errorMessage) {
            updateData.errorMessage = errorMessage;
        }

        const updatedJob = await PrintJob.findOneAndUpdate(
            { jobId: jobId },
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedJob) {
            logger.warn(`Print job ${jobId} not found`, { clientId });
            return null;
        }

        logger.info(`Updated print job ${jobId} status to ${status}`, { clientId });
        return updatedJob;
    } catch (error) {
        logger.error(`Error updating print job status: ${error}`, { clientId });
        throw error;
    }
};

exports.getPrintJobStatus = async (jobId) => {
    try {
        const job = await PrintJob.findOne({ jobId: jobId });
        return job;
    } catch (error) {
        logger.error(`Error fetching print job status: ${error}`);
        throw error;
    }
};

exports.createPrintJob = async (jobData) => {
    try {
        const newJob = new PrintJob(jobData);
        await newJob.save();
        logger.info(`Created new print job ${newJob.jobId}`, { userId: jobData.userId });
        return newJob;
    } catch (error) {
        logger.error(`Error creating print job: ${error}`);
        throw error;
    }
};