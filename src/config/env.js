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

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
};

// Define required environment variables
const requiredEnvVars = {
  production: ['MONGODB_URI', 'OPENAI_API_KEY'],
  development: [] // No strict requirements in dev
};

/**
 * Validate required environment variables
 * @throws {Error} If required variables are missing
 */
export function validateEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const required = requiredEnvVars[nodeEnv] || [];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${nodeEnv}: ${missing.join(', ')}\n` +
      'Please check your .env file or environment configuration.'
    );
  }

  // Warn about optional but recommended variables
  const recommended = ['AMADEUS_API_KEY', 'AMADEUS_API_SECRET', 'GOOGLE_MAPS_API_KEY'];
  const missingRecommended = recommended.filter(key => !process.env[key]);

  if (missingRecommended.length > 0 && nodeEnv !== 'test') {
    console.warn(
      `⚠️  Missing recommended environment variables: ${missingRecommended.join(', ')}\n` +
      'Some features may not work correctly.'
    );
  }

  return true;
}

const environment = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3006),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  aiProvider: process.env.AI_PROVIDER || 'mock',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/travlrapi',
  enableOrchestrator: toBoolean(process.env.ENABLE_ORCHESTRATOR),
  openaiApiKey: process.env.OPENAI_API_KEY,
  amadeusApiKey: process.env.AMADEUS_API_KEY,
  amadeusApiSecret: process.env.AMADEUS_API_SECRET,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
};

export default environment;
