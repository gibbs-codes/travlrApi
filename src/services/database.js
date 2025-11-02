import mongoose from 'mongoose';
import { getMongoConfig } from '../config/database.js';
import { Trip, Recommendation } from '../models/index.js';
import logger from '../utils/logger.js';

class DatabaseService {
  constructor() {
    this.isConnected = false;
    this.connection = null;
  }

  async connect() {
    try {
      if (this.isConnected) {
        logger.debug('MongoDB connection already established');
        return this.connection;
      }

      const config = getMongoConfig();
      logger.info('Connecting to MongoDB...', { uri: config.uri });

      this.connection = await mongoose.connect(config.uri, config.options);
      this.isConnected = true;
      logger.info('✅ Connected to MongoDB successfully');

      // Set up connection event listeners
      this.setupEventListeners();

      return this.connection;
    } catch (error) {
      this.isConnected = false;
      logger.error('❌ MongoDB connection error', { error: error.message });
      throw error;
    }
  }

  async disconnect() {
    try {
      if (!this.isConnected) {
        logger.debug('MongoDB disconnect skipped - no active connection');
        return;
      }

      await mongoose.disconnect();
      this.isConnected = false;
      this.connection = null;
      logger.info('✅ Disconnected from MongoDB');
    } catch (error) {
      logger.error('❌ Error disconnecting from MongoDB', { error: error.message });
      throw error;
    }
  }

  setupEventListeners() {
    mongoose.connection.on('connected', () => {
      logger.debug('Mongoose connection event: connected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('Mongoose connection error', { error: err.message });
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose connection event: disconnected');
      this.isConnected = false;
    });
  }

  getConnectionStatus() {
    const connection = mongoose.connection;
    return {
      isConnected: this.isConnected,
      readyState: connection?.readyState ?? 0,
      host: connection?.host ?? null,
      port: connection?.port ?? null,
      name: connection?.name ?? null
    };
  }

  getModels() {
    return {
      Trip,
      Recommendation
    };
  }

  async ensureIndexes() {
    try {
      logger.info('Ensuring database indexes...');

      await Trip.createIndexes();
      await Recommendation.createIndexes();

      logger.info('✅ Database indexes created successfully');
    } catch (error) {
      logger.error('❌ Error creating database indexes', { error: error.message });
      throw error;
    }
  }

  async healthCheck() {
    try {
      await mongoose.connection.db.admin().ping();
      return {
        status: 'healthy',
        connected: this.isConnected,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

const databaseService = new DatabaseService();
export default databaseService;
