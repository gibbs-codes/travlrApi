import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import travelRoutes from './routes/travel.js';
import tripRoutes from './routes/trip.js';
import databaseService from './services/database.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database connection
await databaseService.connect();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/travel', travelRoutes);
app.use('/api/trip', tripRoutes);

app.get('/health', (_req, res) => {
  const dbStatus = databaseService.getConnectionStatus();
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running',
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