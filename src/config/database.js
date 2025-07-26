export const mongoConfig = {
  development: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/travlr_dev',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },
  production: {
    uri: process.env.MONGO_URI,
    options: {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority'
    }
  }
};

export const getMongoConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  return mongoConfig[env];
};