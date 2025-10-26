import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import travelRoutes from './routes/travel.js';
import tripRoutes from './routes/trip.js';
import sharingRoutes from './routes/sharing.js';
import recommendationRoutes from './routes/recommendations.js';
import databaseService from './services/database.js';

const app = express();
const PORT = process.env.PORT || 3006;
const allowedOrigins = process.env.CORS_ORIGIN;

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || !allowedOrigins || allowedOrigins === '*') {
      return callback(null, true);
    }

    const origins = allowedOrigins.split(',').map((value) => value.trim());
    if (origins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
};

// Initialize database connection
await databaseService.connect();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/travel', travelRoutes);
app.use('/api/trip', tripRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api', sharingRoutes);

app.get('/health', (_req, res) => {
  const dbStatus = databaseService.getConnectionStatus();
  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
