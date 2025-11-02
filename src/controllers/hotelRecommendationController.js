/**
 * Hotel Recommendation Controller
 *
 * Handles accommodation-specific recommendation operations:
 * - Get hotel recommendations with filters (amenities, star rating, hotel type)
 * - Select hotel recommendation
 * - Re-run accommodation agent
 */

import { BaseRecommendationController } from './recommendationController.js';
import { Recommendation } from '../models/index.js';
import { formatSuccess } from '../middleware/validation.js';

class HotelRecommendationController extends BaseRecommendationController {
  constructor() {
    super('accommodation', 'Hotel');
  }

  /**
   * Get hotel recommendations with accommodation-specific filters
   */
  async getRecommendations(req, res) {
    try {
      const { tripId } = req.params;
      const {
        minRating,
        maxPrice,
        sortBy = 'rating',
        limit = 10,
        offset = 0,
        // Hotel-specific filters
        hotelType, // 'hotel', 'resort', 'apartment', 'hostel', 'guesthouse', 'villa'
        minStarRating,
        amenities, // comma-separated list: 'wifi,pool,gym'
        roomType,
        distanceFromCenter // in km
      } = req.query;

      const trip = await this.validateAndGetTrip(tripId, res);
      if (!trip) return;

      if (!this.isRecommendationReady(trip)) {
        const agentStatus = trip.agentExecution?.agents?.[this.agentType];
        return res.status(400).json({
          success: false,
          error: 'Recommendations not ready',
          message: 'Hotel recommendations are still being generated',
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
        }, 'No hotel recommendations found'));
      }

      // Build query with hotel-specific filters
      const query = { _id: { $in: recommendationIds } };

      if (minRating) {
        query['rating.score'] = { $gte: parseFloat(minRating) };
      }
      if (maxPrice) {
        query['price.amount'] = { $lte: parseFloat(maxPrice) };
      }
      if (minStarRating) {
        query['rating.score'] = { ...query['rating.score'], $gte: parseFloat(minStarRating) };
      }
      if (hotelType) {
        query['agentMetadata.hotelType'] = hotelType;
      }
      if (roomType) {
        query['agentMetadata.roomType'] = roomType;
      }
      if (amenities) {
        const amenityList = amenities.split(',').map(a => a.trim());
        query['agentMetadata.amenities'] = { $all: amenityList };
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
        case 'name':
          sortOptions['name'] = 1;
          break;
        default:
          sortOptions['rating.score'] = -1;
      }

      const recommendations = await Recommendation
        .find(query)
        .sort(sortOptions)
        .skip(parseInt(offset))
        .limit(parseInt(limit));

      const total = await Recommendation.countDocuments(query);

      // Add hotel-specific metadata to response
      const hotelsWithDetails = recommendations.map(rec => ({
        ...rec.toObject(),
        hotelDetails: {
          type: rec.agentMetadata?.hotelType,
          amenities: rec.agentMetadata?.amenities || [],
          roomType: rec.agentMetadata?.roomType,
          checkIn: rec.agentMetadata?.checkIn,
          checkOut: rec.agentMetadata?.checkOut,
          nightlyRate: rec.price?.amount,
          totalNights: this.calculateNights(rec.agentMetadata?.checkIn, rec.agentMetadata?.checkOut),
          totalPrice: this.calculateTotalPrice(
            rec.price?.amount,
            rec.agentMetadata?.checkIn,
            rec.agentMetadata?.checkOut
          )
        }
      }));

      res.json(formatSuccess({
        recommendations: hotelsWithDetails,
        total,
        count: recommendations.length,
        agentType: this.agentType,
        filters: {
          minRating, maxPrice, hotelType, minStarRating,
          amenities, roomType, sortBy
        },
        pagination: { limit: parseInt(limit), offset: parseInt(offset) }
      }, 'Hotel recommendations retrieved successfully'));

    } catch (error) {
      this.log.error('Get hotel recommendations error', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Failed to retrieve hotel recommendations'
      });
    }
  }

  /**
   * Calculate number of nights between check-in and check-out
   */
  calculateNights(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 1;
    try {
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays || 1;
    } catch {
      return 1;
    }
  }

  /**
   * Calculate total price for stay
   */
  calculateTotalPrice(nightlyRate, checkIn, checkOut) {
    if (!nightlyRate) return 0;
    const nights = this.calculateNights(checkIn, checkOut);
    return nightlyRate * nights;
  }
}

// Export instance methods as controller functions
const controller = new HotelRecommendationController();

export const getHotelRecommendations = (req, res) => controller.getRecommendations(req, res);
export const getHotelRecommendationById = (req, res) => controller.getRecommendationById(req, res);
export const selectHotelRecommendation = (req, res) => controller.selectRecommendation(req, res);
export const rerunHotelAgent = (req, res) => controller.rerunAgent(req, res);

export default controller;
