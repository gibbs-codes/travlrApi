import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import travelRoutes from './routes/travel.js';
import tripRoutes from './routes/trip.js';
import recommendationRoutes from './routes/recommendations.js';
import databaseService from './services/database.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

const app = express();

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || env.corsOrigin === '*') {
      return callback(null, true);
    }

    const allowed = env.corsOrigin.split(',').map(value => value.trim());
    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`Blocked request from origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  }
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/travel', travelRoutes);
app.use('/api/trip', tripRoutes);
app.use('/api/recommendations', recommendationRoutes);

app.get('/health', (_req, res) => {
  const dbStatus = databaseService.getConnectionStatus();
  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
