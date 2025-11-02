import dotenv from 'dotenv';

const envResult = dotenv.config();

// Log dotenv errors only in non-production environments
if (envResult.error && process.env.NODE_ENV !== 'production') {
  console.warn('⚠️  Unable to load .env file:', envResult.error.message);
}

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const environment = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3006),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  aiProvider: process.env.AI_PROVIDER || 'mock',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/travlrapi'
};

export default environment;
