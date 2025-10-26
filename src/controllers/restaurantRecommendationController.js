/**
 * Restaurant Recommendation Controller
 *
 * Handles restaurant-specific recommendation operations:
 * - Get restaurant recommendations with filters (cuisine, price range, dietary)
 * - Select restaurant recommendation
 * - Re-run restaurant agent
 */

import { BaseRecommendationController } from './recommendationController.js';
import { Recommendation } from '../models/index.js';
import { formatSuccess } from '../middleware/validation.js';

class RestaurantRecommendationController extends BaseRecommendationController {
  constructor() {
    super('restaurant', 'Restaurant');
  }

  /**
   * Get restaurant recommendations with restaurant-specific filters
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
        // Restaurant-specific filters
        cuisine, // 'Italian', 'Japanese', 'Mexican', etc.
        priceRange, // '$', '$$', '$$$', '$$$$'
        dietaryRestrictions, // 'vegetarian', 'vegan', 'gluten_free', etc.
        features, // 'outdoor_seating', 'romantic', 'family_friendly'
        mealType, // 'breakfast', 'lunch', 'dinner'
        reservationsRequired, // 'true' or 'false'
        openNow // 'true' or 'false'
      } = req.query;

      const trip = await this.validateAndGetTrip(tripId, res);
      if (!trip) return;

      if (!this.isRecommendationReady(trip)) {
        const agentStatus = trip.agentExecution?.agents?.[this.agentType];
        return res.status(400).json({
          success: false,
          error: 'Recommendations not ready',
          message: 'Restaurant recommendations are still being generated',
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
        }, 'No restaurant recommendations found'));
      }

      // Build query with restaurant-specific filters
      const query = { _id: { $in: recommendationIds } };

      if (minRating) {
        query['rating.score'] = { $gte: parseFloat(minRating) };
      }
      if (maxPrice) {
        query['price.amount'] = { $lte: parseFloat(maxPrice) };
      }
      if (cuisine) {
        query['agentMetadata.cuisine'] = new RegExp(cuisine, 'i');
      }
      if (priceRange) {
        query['agentMetadata.priceRange'] = priceRange;
      }
      if (dietaryRestrictions) {
        const restrictions = dietaryRestrictions.split(',').map(r => r.trim());
        query['agentMetadata.dietaryOptions'] = { $all: restrictions };
      }
      if (features) {
        const featureList = features.split(',').map(f => f.trim());
        query['agentMetadata.features'] = { $all: featureList };
      }
      if (reservationsRequired !== undefined) {
        query['agentMetadata.reservations'] = reservationsRequired === 'true';
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
        case 'reviews':
          sortOptions['rating.reviewCount'] = -1;
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

      // Add restaurant-specific metadata to response
      const restaurantsWithDetails = recommendations.map(rec => ({
        ...rec.toObject(),
        restaurantDetails: {
          cuisine: rec.agentMetadata?.cuisine,
          priceRange: rec.agentMetadata?.priceRange,
          averageMealCost: rec.price?.amount,
          features: rec.agentMetadata?.features || [],
          dietaryOptions: rec.agentMetadata?.dietaryOptions || [],
          hours: rec.agentMetadata?.hours,
          reservations: rec.agentMetadata?.reservations,
          dressCode: rec.agentMetadata?.dressCode,
          parking: rec.agentMetadata?.parking,
          seatingOptions: rec.agentMetadata?.seatingOptions,
          placeId: rec.agentMetadata?.placeId || rec.externalIds?.googlePlaceId
        }
      }));

      res.json(formatSuccess({
        recommendations: restaurantsWithDetails,
        total,
        count: recommendations.length,
        agentType: this.agentType,
        filters: {
          minRating, maxPrice, cuisine, priceRange,
          dietaryRestrictions, features, reservationsRequired, sortBy
        },
        pagination: { limit: parseInt(limit), offset: parseInt(offset) }
      }, 'Restaurant recommendations retrieved successfully'));

    } catch (error) {
      console.error('Get restaurant recommendations error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Failed to retrieve restaurant recommendations'
      });
    }
  }
}

// Export instance methods as controller functions
const controller = new RestaurantRecommendationController();

export const getRestaurantRecommendations = (req, res) => controller.getRecommendations(req, res);
export const getRestaurantRecommendationById = (req, res) => controller.getRecommendationById(req, res);
export const selectRestaurantRecommendation = (req, res) => controller.selectRecommendation(req, res);
export const rerunRestaurantAgent = (req, res) => controller.rerunAgent(req, res);

export default controller;
