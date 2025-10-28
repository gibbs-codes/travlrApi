import env from '../config/env.js';
import logger from '../utils/logger.js';

export const notFoundHandler = (req, res, next) => {
  if (res.headersSent) {
    return next();
  }

  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `No route found for ${req.method} ${req.originalUrl}`
  });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  logger.error(`API Error [${req.method} ${req.originalUrl}]: ${message}`, {
    status,
    stack: err.stack
  });

  if (res.headersSent) {
    return;
  }

  res.status(status).json({
    success: false,
    error: message,
    ...(env.nodeEnv === 'development' && err.stack ? { stack: err.stack } : {})
  });
};
