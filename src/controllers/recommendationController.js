/**
 * Base Recommendation Controller
 *
 * Shared logic and validation for all recommendation type controllers.
 * Provides common methods for:
 * - Fetching recommendations by type
 * - Validating selections
 * - Re-running specific agents
 * - Error handling
 */

import { Trip, Recommendation } from '../models/index.js';
import { TripOrchestrator } from '../agents/tripOrchestrator.js';
import { formatSuccess } from '../middleware/validation.js';
import logger from '../utils/logger.js';

/**
 * Base class for recommendation controllers
 * Subclasses should define: this.agentType, this.displayName
 */
export class BaseRecommendationController {
  constructor(agentType, displayName) {
    this.agentType = agentType; // 'flight', 'accommodation', 'activity', 'restaurant', 'transportation'
    this.displayName = displayName; // 'Flight', 'Hotel', etc.
    this.log = logger.child({ scope: `${displayName}RecommendationController` });
  }

  /**
   * Validate that trip exists and return it
   */
  async validateAndGetTrip(tripId, res) {
    const trip = await Trip.findOne({ tripId });

    if (!trip) {
      res.status(404).json({
        success: false,
        error: 'Trip not found',
        message: `Trip with ID ${tripId} does not exist`
      });
      return null;
    }

    return trip;
  }

  /**
   * Check if trip has recommendations ready
   */
  isRecommendationReady(trip) {
    return trip.status !== 'draft' &&
           trip.agentExecution?.status !== 'pending' &&
           trip.agentExecution?.agents?.[this.agentType]?.status === 'completed';
  }

  /**
   * Get recommendations for this agent type
   */
  async getRecommendations(req, res) {
    try {
      const { tripId } = req.params;
      const {
        minRating,
        maxPrice,
        sortBy = 'rating',
        limit = 10,
        offset = 0
      } = req.query;

      const trip = await this.validateAndGetTrip(tripId, res);
      if (!trip) return;

      // Check if recommendations are ready
      const agentStatus = trip.agentExecution?.agents?.[this.agentType];
      if (!this.isRecommendationReady(trip)) {
        return res.status(400).json({
          success: false,
          error: 'Recommendations not ready',
          message: `${this.displayName} recommendations are still being generated`,
          agentStatus: {
            status: agentStatus?.status || 'pending',
            startedAt: agentStatus?.startedAt,
            completedAt: agentStatus?.completedAt
          }
        });
      }

      // Build query
      const recommendationIds = trip.recommendations[this.agentType] || [];

      if (recommendationIds.length === 0) {
        return res.json(formatSuccess({
          recommendations: [],
          total: 0,
          agentType: this.agentType
        }, `No ${this.displayName.toLowerCase()} recommendations found`));
      }

      const query = { _id: { $in: recommendationIds } };

      // Apply filters
      if (minRating) {
        query['rating.score'] = { $gte: parseFloat(minRating) };
      }
      if (maxPrice) {
        query['price.amount'] = { $lte: parseFloat(maxPrice) };
      }

      // Build sort
      const sortOptions = {};
      switch (sortBy) {
        case 'rating':
          sortOptions['rating.score'] = -1;
          break;
        case 'price_asc':
          sortOptions['price.amount'] = 1;
          break;
        case 'price_desc':
          sortOptions['price.amount'] = -1;
          break;
        case 'confidence':
          sortOptions['confidence.score'] = -1;
          break;
        default:
          sortOptions['rating.score'] = -1;
      }

      // Execute query
      const recommendations = await Recommendation
        .find(query)
        .sort(sortOptions)
        .skip(parseInt(offset))
        .limit(parseInt(limit));

      const total = await Recommendation.countDocuments(query);

      res.json(formatSuccess({
        recommendations,
        total,
        count: recommendations.length,
        agentType: this.agentType,
        filters: { minRating, maxPrice, sortBy },
        pagination: { limit: parseInt(limit), offset: parseInt(offset) }
      }, `${this.displayName} recommendations retrieved successfully`));

    } catch (error) {
      this.log.error(`Get ${this.agentType} recommendations error: ${error.message}`, { stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message,
        message: `Failed to retrieve ${this.displayName.toLowerCase()} recommendations`
      });
    }
  }

  /**
   * Select a specific recommendation
   */
  async selectRecommendation(req, res) {
    try {
      const { tripId, recommendationId } = req.params;
      const { selectedBy = 'user', rank = 1 } = req.body;

      const trip = await this.validateAndGetTrip(tripId, res);
      if (!trip) return;

      // Verify recommendation exists and belongs to this trip
      const validRecommendations = trip.recommendations[this.agentType] || [];
      const isValid = validRecommendations.some(
        recId => recId.toString() === recommendationId
      );

      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid recommendation',
          message: `${this.displayName} recommendation does not belong to this trip`
        });
      }

      // Clear previous selections for this agent type
      await Recommendation.updateMany(
        { _id: { $in: validRecommendations } },
        {
          'selection.isSelected': false,
          'selection.selectedAt': null,
          'selection.selectedBy': null,
          'selection.selectionRank': null
        }
      );

      // Update the selected recommendation
      await Recommendation.findByIdAndUpdate(recommendationId, {
        'selection.isSelected': true,
        'selection.selectedAt': new Date(),
        'selection.selectedBy': selectedBy,
        'selection.selectionRank': rank
      });

      // Update trip's selectedRecommendations
      const selectedRec = {
        recommendation: recommendationId,
        selectedAt: new Date(),
        selectedBy,
        selectionRank: rank
      };

      await Trip.findOneAndUpdate(
        { tripId },
        {
          [`selectedRecommendations.${this.agentType}`]: [selectedRec],
          status: 'user_selecting'
        }
      );

      const updatedRecommendation = await Recommendation.findById(recommendationId);

      res.json(formatSuccess({
        tripId,
        agentType: this.agentType,
        recommendation: updatedRecommendation,
        selectedAt: selectedRec.selectedAt,
        selectedBy
      }, `${this.displayName} recommendation selected successfully`));

    } catch (error) {
      this.log.error(`Select ${this.agentType} recommendation error: ${error.message}`, { stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message,
        message: `Failed to select ${this.displayName.toLowerCase()} recommendation`
      });
    }
  }

  /**
   * Re-run this specific agent
   */
  async rerunAgent(req, res) {
    try {
      const { tripId } = req.params;
      const { reason = `User requested ${this.displayName.toLowerCase()} rerun` } = req.body;

      const trip = await this.validateAndGetTrip(tripId, res);
      if (!trip) return;

      // Check if execution is already in progress
      if (trip.agentExecution.status === 'in_progress') {
        return res.status(409).json({
          success: false,
          error: 'Execution in progress',
          message: 'Cannot rerun agent while execution is currently in progress'
        });
      }

      // Reset agent status
      const updateData = {
        [`agentExecution.agents.${this.agentType}.status`]: 'pending',
        [`agentExecution.agents.${this.agentType}.startedAt`]: null,
        [`agentExecution.agents.${this.agentType}.completedAt`]: null,
        [`agentExecution.agents.${this.agentType}.errors`]: []
      };

      await Trip.findByIdAndUpdate(trip._id, updateData);

      // Remove existing recommendations for this agent
      if (trip.recommendations[this.agentType]?.length > 0) {
        await Recommendation.deleteMany({
          _id: { $in: trip.recommendations[this.agentType] }
        });

        await Trip.findByIdAndUpdate(trip._id, {
          [`recommendations.${this.agentType}`]: [],
          [`selectedRecommendations.${this.agentType}`]: []
        });
      }

      res.json(formatSuccess({
        tripId: trip.tripId,
        agentType: this.agentType,
        status: 'pending',
        reason,
        message: `${this.displayName} agent rerun initiated`
      }, `${this.displayName} recommendations will be regenerated`));

      // Execute orchestrator for this agent asynchronously
      this.executeAgentAsync(trip._id, trip).catch(error => {
        this.log.error(`Background ${this.agentType} agent execution failed: ${error.message}`, { stack: error.stack });
      });

    } catch (error) {
      this.log.error(`Rerun ${this.agentType} agent error: ${error.message}`, { stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message,
        message: `Failed to rerun ${this.displayName.toLowerCase()} agent`
      });
    }
  }

  /**
   * Execute agent asynchronously in background
   */
  async executeAgentAsync(tripId, trip) {
    try {
      this.log.info(`🚀 Starting ${this.agentType} agent execution for trip ${tripId}`);

      const orchestrator = new TripOrchestrator({}, tripId);

      // Build request from trip data
      const tripRequest = {
        destination: trip.destination.name,
        origin: trip.origin.name,
        departureDate: trip.dates.departureDate.toISOString().split('T')[0],
        returnDate: trip.dates.returnDate?.toISOString().split('T')[0],
        travelers: trip.travelers.count,
        preferences: {
          accommodationType: trip.preferences.accommodation?.type,
          minHotelRating: trip.preferences.accommodation?.minRating,
          flightClass: trip.preferences.transportation?.flightClass,
          nonStopFlights: trip.preferences.transportation?.preferNonStop,
          cuisines: trip.preferences.dining?.cuisinePreferences
        },
        interests: trip.preferences.interests
      };

      // Execute only this agent
      await orchestrator.execute(tripRequest, tripId);

      this.log.info(`✅ ${this.agentType} agent execution completed for trip ${tripId}`);

    } catch (error) {
      this.log.error(`❌ ${this.agentType} agent execution failed: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }

  /**
   * Get single recommendation by ID
   */
  async getRecommendationById(req, res) {
    try {
      const { tripId, recommendationId } = req.params;

      const trip = await this.validateAndGetTrip(tripId, res);
      if (!trip) return;

      // Verify recommendation belongs to this trip
      const validRecommendations = trip.recommendations[this.agentType] || [];
      const isValid = validRecommendations.some(
        recId => recId.toString() === recommendationId
      );

      if (!isValid) {
        return res.status(404).json({
          success: false,
          error: 'Recommendation not found',
          message: `${this.displayName} recommendation not found in this trip`
        });
      }

      const recommendation = await Recommendation.findById(recommendationId);

      if (!recommendation) {
        return res.status(404).json({
          success: false,
          error: 'Recommendation not found'
        });
      }

      res.json(formatSuccess({
        recommendation,
        agentType: this.agentType
      }, `${this.displayName} recommendation retrieved successfully`));

    } catch (error) {
      this.log.error(`Get ${this.agentType} recommendation by ID error: ${error.message}`, { stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message,
        message: `Failed to retrieve ${this.displayName.toLowerCase()} recommendation`
      });
    }
  }
}

export default BaseRecommendationController;
