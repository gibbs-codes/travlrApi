import mongoose from 'mongoose';
import { getMongoConfig } from '../config/database.js';
import { Trip, Recommendation } from '../models/index.js';

class DatabaseService {
  constructor() {
    this.isConnected = false;
    this.connection = null;
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('Already connected to MongoDB');
        return this.connection;
      }

      const config = getMongoConfig();
      
      console.log('Connecting to MongoDB...');
      this.connection = await mongoose.connect(config.uri, config.options);
      
      this.isConnected = true;
      console.log('✅ Connected to MongoDB successfully');
      
      // Set up connection event listeners
      this.setupEventListeners();
      
      return this.connection;
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    try {
      if (!this.isConnected) {
        console.log('Not connected to MongoDB');
        return;
      }

      await mongoose.disconnect();
      this.isConnected = false;
      this.connection = null;
      console.log('✅ Disconnected from MongoDB');
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  setupEventListeners() {
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    // Handle app termination
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
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
      console.log('Ensuring database indexes...');
      
      await Trip.createIndexes();
      await Recommendation.createIndexes();
      
      console.log('✅ Database indexes created successfully');
    } catch (error) {
      console.error('❌ Error creating database indexes:', error);
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