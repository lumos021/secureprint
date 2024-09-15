const { AppError } = require('../utils/appError');

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch((err) => {
        if (!(err instanceof AppError)) {
            console.error(err);
            err = new AppError('An unexpected error occurred', 500);
        }
        next(err);
    });

module.exports = { asyncHandler };