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
import { FlightAgent } from '../agents/flightAgent.js';
import { AccommodationAgent } from '../agents/accommodationAgent.js';
import { ActivityAgent } from '../agents/activityAgent.js';
import { RestaurantAgent } from '../agents/restaurantAgent.js';
import { formatSuccess } from '../middleware/validation.js';
import logger from '../utils/logger.js';

const ORCHESTRATOR_ENABLED = process.env.ENABLE_ORCHESTRATOR === 'true';

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
    // Allow access as soon as this agent reports completed, even if the trip is still "draft"
    const agentStatus = trip.agentExecution?.agents?.[this.agentType]?.status;
    return agentStatus === 'completed';
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

      const agentMap = {
        flight: FlightAgent,
        accommodation: AccommodationAgent,
        activity: ActivityAgent,
        restaurant: RestaurantAgent
      };

      // Fallback path when orchestrator is disabled: run the agent directly
      if (!ORCHESTRATOR_ENABLED) {
        const AgentClass = agentMap[this.agentType];
        if (!AgentClass) {
          this.log.error(`No agent class found for ${this.agentType}`);
          return;
        }

        this.log.info(`⏩ Running ${this.agentType} agent directly (orchestrator disabled)`);

        await Trip.findByIdAndUpdate(tripId, {
          [`agentExecution.agents.${this.agentType}.status`]: 'running',
          [`agentExecution.agents.${this.agentType}.startedAt`]: new Date(),
          'agentExecution.status': 'in_progress',
          'agentExecution.startedAt': new Date()
        });

        const criteria = {
          destination: trip.destination.name,
          destinationCountry: trip.destination.country,
          destinationPlaceId: trip.destination.placeId,
          destinationCoordinates: trip.destination.coordinates,
          origin: trip.origin.name,
          departureDate: trip.dates.departureDate.toISOString().split('T')[0],
          returnDate: trip.dates.returnDate?.toISOString().split('T')[0],
          checkInDate: trip.dates.departureDate.toISOString().split('T')[0],
          checkOutDate: trip.dates.returnDate?.toISOString().split('T')[0],
          travelers: trip.travelers.count,
          preferences: trip.preferences
        };

        const agent = new AgentClass();
        const searchResult = await agent.search(criteria);

        // Normalize agent output: agents may return raw arrays or { recommendations } structures
        const extractedResults = Array.isArray(searchResult)
          ? searchResult
          : searchResult?.recommendations
            || searchResult?.results
            || searchResult?.content?.recommendations
            || [];

        // Let agents rank their own results when possible
        const rankedResults = agent.rank ? await agent.rank(extractedResults) : extractedResults;

        // Try to run agent-specific transformation if available; otherwise persist ranked results
        let generatedRecommendations = rankedResults;
        let generationMeta = null;
        if (agent.generateRecommendations) {
          try {
            const generated = await agent.generateRecommendations(rankedResults, { criteria });
            if (generated?.content?.recommendations && Array.isArray(generated.content.recommendations)) {
              generatedRecommendations = generated.content.recommendations;
              generationMeta = generated;
            }
          } catch (genError) {
            this.log.warn(`⚠️ ${this.agentType} generateRecommendations failed, using raw results`, { error: genError.message });
          }
        }

        // Fallback: if no recommendations surfaced, fall back to ranked or raw results
        if (!Array.isArray(generatedRecommendations) || generatedRecommendations.length === 0) {
          this.log.warn(`⚠️ ${this.agentType} agent produced no recommendations to save; falling back to ranked/raw results`);
          if (Array.isArray(rankedResults) && rankedResults.length > 0) {
            generatedRecommendations = rankedResults;
          } else if (Array.isArray(extractedResults) && extractedResults.length > 0) {
            generatedRecommendations = extractedResults;
          } else {
            generatedRecommendations = [];
          }
        }

        const savedRecommendations = [];
        if (!Array.isArray(generatedRecommendations) || generatedRecommendations.length === 0) {
          this.log.warn(`⚠️ ${this.agentType} agent produced no recommendations to save`);
        }
        if (Array.isArray(generatedRecommendations)) {
          for (const rec of generatedRecommendations) {
            try {
              const priceAmount = rec?.totalPrice ?? rec?.price?.amount ?? rec?.price ?? 0;
              const priceCurrency = rec?.price?.currency || rec?.currency || 'USD';
              const ratingScore = rec?.rating?.score ?? rec?.rating;
              const confidenceScore =
                typeof rec?.confidence === 'number'
                  ? rec.confidence
                  : typeof rec?.confidence?.score === 'number'
                    ? rec.confidence.score
                    : typeof generationMeta?.content?.confidence === 'number'
                      ? generationMeta.content.confidence
                      : 0.5;
              const reasoning = rec?.reasoning || generationMeta?.content?.reasoning;

              // Normalize confidence to 0-1 range; many agents use 0-100
              const safeConfidence = (() => {
                if (typeof confidenceScore !== 'number' || Number.isNaN(confidenceScore)) return 0.5;
                if (confidenceScore > 1) return Math.min(1, confidenceScore / 100);
                if (confidenceScore < 0) return 0;
                return confidenceScore;
              })();

              // Normalize images to schema (array of objects)
              const imagesNormalized = (() => {
                if (!rec?.images) return [];
                if (Array.isArray(rec.images)) {
                  return rec.images
                    .map((img, idx) => {
                      if (!img) return null;
                      if (typeof img === 'string') return { url: img, alt: rec.name || `image-${idx + 1}` };
                      if (typeof img === 'object' && img.url) return { url: img.url, alt: img.alt || rec.name };
                      return null;
                    })
                    .filter(Boolean);
                }
                if (typeof rec.images === 'string') return [{ url: rec.images, alt: rec.name }];
                return [];
              })();

              const recommendation = new Recommendation({
                agentType: this.agentType,
                name: rec.title || rec.name || rec.airline || rec.hotelName || 'Unnamed Recommendation',
                description: rec.details || rec.description || rec.summary || JSON.stringify(rec).substring(0, 500),
                price: {
                  amount: priceAmount,
                  currency: priceCurrency
                },
                rating: ratingScore ? {
                  score: ratingScore,
                  reviewCount: rec.reviewCount || 0,
                  source: rec.source || 'agent'
                } : undefined,
                location: rec.location,
                availability: rec.availability,
                images: imagesNormalized,
                confidence: {
                  score: safeConfidence,
                  reasoning
                },
                agentMetadata: rec
              });
              const saved = await recommendation.save();
              savedRecommendations.push(saved._id);
              this.log.info(`✓ Saved recommendation: ${saved.name}`);
            } catch (saveError) {
              this.log.error(`Failed to save recommendation: ${saveError.message}`, { rec });
            }
          }
        }

        await Trip.findByIdAndUpdate(tripId, {
          [`recommendations.${this.agentType}`]: savedRecommendations,
          [`agentExecution.agents.${this.agentType}.status`]: 'completed',
          [`agentExecution.agents.${this.agentType}.completedAt`]: new Date(),
          [`agentExecution.agents.${this.agentType}.recommendationCount`]: savedRecommendations.length,
          'agentExecution.status': 'completed',
          'agentExecution.completedAt': new Date()
        });

        this.log.info(`✅ ${this.agentType} agent completed directly with ${savedRecommendations.length} recommendations`);
        return;
      }

      const orchestrator = new TripOrchestrator({}, tripId);

      // Build request from trip data
      const tripRequest = {
        destination: trip.destination.name,
        destinationCountry: trip.destination.country,
        destinationPlaceId: trip.destination.placeId,
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
