/**
 * Flight Recommendation Controller
 *
 * Handles flight-specific recommendation operations:
 * - Get flight recommendations with filters (cabin class, stops, airline)
 * - Select flight recommendation
 * - Re-run flight agent
 */

import { BaseRecommendationController } from './recommendationController.js';
import { Recommendation } from '../models/index.js';
import { formatSuccess } from '../middleware/validation.js';

class FlightRecommendationController extends BaseRecommendationController {
  constructor() {
    super('flight', 'Flight');
  }

  /**
   * Get flight recommendations with flight-specific filters
   */
  async getRecommendations(req, res) {
    try {
      const { tripId } = req.params;
      const {
        minRating,
        maxPrice,
        sortBy = 'price_asc',
        limit = 10,
        offset = 0,
        // Flight-specific filters
        maxStops,
        airline,
        cabinClass,
        maxDuration,
        departureTimeRange, // e.g., "morning", "afternoon", "evening"
        nonStopOnly
      } = req.query;

      const trip = await this.validateAndGetTrip(tripId, res);
      if (!trip) return;

      if (!this.isRecommendationReady(trip)) {
        const agentStatus = trip.agentExecution?.agents?.[this.agentType];
        return res.status(400).json({
          success: false,
          error: 'Recommendations not ready',
          message: 'Flight recommendations are still being generated',
          agentStatus: {
            status: agentStatus?.status || 'pending',
            startedAt: agentStatus?.startedAt,
            completedAt: agentStatus?.completedAt
          }
        });
      }

      const recommendationIds = trip.recommendations[this.agentType] || [];

      if (recommendationIds.length === 0) {
        return res.json(formatSuccess({
          recommendations: [],
          total: 0,
          agentType: this.agentType
        }, 'No flight recommendations found'));
      }

      // Build query with flight-specific filters
      const query = { _id: { $in: recommendationIds } };

      if (minRating) {
        query['rating.score'] = { $gte: parseFloat(minRating) };
      }
      if (maxPrice) {
        query['price.amount'] = { $lte: parseFloat(maxPrice) };
      }
      if (maxStops !== undefined) {
        query['agentMetadata.stops'] = { $lte: parseInt(maxStops) };
      }
      if (nonStopOnly === 'true') {
        query['agentMetadata.stops'] = 0;
      }
      if (airline) {
        query['agentMetadata.airline'] = new RegExp(airline, 'i');
      }
      if (cabinClass) {
        query['agentMetadata.cabin'] = cabinClass;
      }
      if (maxDuration) {
        query['agentMetadata.duration'] = { $lte: maxDuration };
      }

      // Build sort
      const sortOptions = {};
      switch (sortBy) {
        case 'price_asc':
          sortOptions['price.amount'] = 1;
          break;
        case 'price_desc':
          sortOptions['price.amount'] = -1;
          break;
        case 'duration':
          sortOptions['agentMetadata.duration'] = 1;
          break;
        case 'stops':
          sortOptions['agentMetadata.stops'] = 1;
          break;
        case 'departure_time':
          sortOptions['agentMetadata.departureTime'] = 1;
          break;
        default:
          sortOptions['price.amount'] = 1;
      }

      const recommendations = await Recommendation
        .find(query)
        .sort(sortOptions)
        .skip(parseInt(offset))
        .limit(parseInt(limit));

      const total = await Recommendation.countDocuments(query);

      // Add flight-specific metadata to response
      const flightsWithDetails = recommendations.map(rec => ({
        ...rec.toObject(),
        flightDetails: {
          airline: rec.agentMetadata?.airline,
          flightNumber: rec.agentMetadata?.flightNumber,
          departure: {
            airport: rec.agentMetadata?.departureAirport,
            time: rec.agentMetadata?.departureTime,
            date: rec.agentMetadata?.departureDate
          },
          arrival: {
            airport: rec.agentMetadata?.arrivalAirport,
            time: rec.agentMetadata?.arrivalTime,
            date: rec.agentMetadata?.arrivalDate
          },
          duration: rec.agentMetadata?.duration,
          stops: rec.agentMetadata?.stops,
          cabin: rec.agentMetadata?.cabin
        }
      }));

      res.json(formatSuccess({
        recommendations: flightsWithDetails,
        total,
        count: recommendations.length,
        agentType: this.agentType,
        filters: {
          minRating, maxPrice, maxStops, airline, cabinClass,
          maxDuration, nonStopOnly, sortBy
        },
        pagination: { limit: parseInt(limit), offset: parseInt(offset) }
      }, 'Flight recommendations retrieved successfully'));

    } catch (error) {
      console.error('Get flight recommendations error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Failed to retrieve flight recommendations'
      });
    }
  }
}

// Export instance methods as controller functions
const controller = new FlightRecommendationController();

export const getFlightRecommendations = (req, res) => controller.getRecommendations(req, res);
export const getFlightRecommendationById = (req, res) => controller.getRecommendationById(req, res);
export const selectFlightRecommendation = (req, res) => controller.selectRecommendation(req, res);
export const rerunFlightAgent = (req, res) => controller.rerunAgent(req, res);

export default controller;
