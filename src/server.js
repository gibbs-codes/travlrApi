import env from './config/env.js';
import app from './app.js';
import databaseService from './services/database.js';
import logger from './utils/logger.js';

let server;

const startServer = async () => {
  try {
    await databaseService.connect();

    server = app.listen(env.port, () => {
      logger.info(`Server running on port ${env.port}`);
    });

    server.on('close', () => {
      logger.info('HTTP server closed');
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await databaseService.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.stack || error.message });
  process.exit(1);
});

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

startServer();
