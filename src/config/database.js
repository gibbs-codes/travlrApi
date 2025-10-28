import env from './env.js';

export const getMongoConfig = () => {
  const commonOptions = {
    maxPoolSize: env.nodeEnv === 'production' ? 20 : 10,
    serverSelectionTimeoutMS: env.nodeEnv === 'production' ? 10000 : 5000,
    socketTimeoutMS: 45000
  };

  const productionOptions = env.nodeEnv === 'production'
    ? { retryWrites: true, w: 'majority' }
    : {};

  return {
    uri: env.mongoUri,
    options: {
      ...commonOptions,
      ...productionOptions
    }
  };
};
