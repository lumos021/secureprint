const logger = require('../utils/logger');
const { AppError } = require('../utils/appError');

const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    logger.error('Error', {
        message: err.message,
        stack: err.stack,
        requestId: req.requestId
    });

    if (process.env.NODE_ENV === 'development') {
        res.status(err.statusCode).json({
            status: err.status,
            error: err,
            message: err.message,
            stack: err.stack
        });
    } else {
        if (err instanceof AppError) {
            res.status(err.statusCode).json({
                status: err.status,
                message: err.message
            });
        } else {
            res.status(500).json({
                status: 'error',
                message: 'Something went wrong'
            });
        }
    }
};

module.exports = errorHandler;