/**
 * Activity Recommendation Controller
 *
 * Handles activity-specific recommendation operations:
 * - Get activity recommendations with filters (category, duration, indoor/outdoor)
 * - Select activity recommendation
 * - Re-run activity agent
 */

import { BaseRecommendationController } from './recommendationController.js';
import { Recommendation } from '../models/index.js';
import { formatSuccess } from '../middleware/validation.js';

class ActivityRecommendationController extends BaseRecommendationController {
  constructor() {
    super('activity', 'Activity');
  }

  /**
   * Get activity recommendations with activity-specific filters
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
        // Activity-specific filters
        category, // 'cultural', 'adventure', 'food', 'nature', 'art', etc.
        maxDuration, // in hours
        minDuration,
        indoor, // 'true' or 'false'
        skillLevel, // 'beginner', 'intermediate', 'advanced'
        ageAppropriate, // minimum age
        accessibility // 'wheelchair', 'stroller', etc.
      } = req.query;

      const trip = await this.validateAndGetTrip(tripId, res);
      if (!trip) return;

      if (!this.isRecommendationReady(trip)) {
        const agentStatus = trip.agentExecution?.agents?.[this.agentType];
        return res.status(400).json({
          success: false,
          error: 'Recommendations not ready',
          message: 'Activity recommendations are still being generated',
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
        }, 'No activity recommendations found'));
      }

      // Build query with activity-specific filters
      const query = { _id: { $in: recommendationIds } };

      if (minRating) {
        query['rating.score'] = { $gte: parseFloat(minRating) };
      }
      if (maxPrice) {
        query['price.amount'] = { $lte: parseFloat(maxPrice) };
      }
      if (category) {
        query['agentMetadata.category'] = new RegExp(category, 'i');
      }
      if (maxDuration) {
        query['agentMetadata.duration'] = { $lte: parseFloat(maxDuration) };
      }
      if (minDuration) {
        query['agentMetadata.duration'] = {
          ...query['agentMetadata.duration'],
          $gte: parseFloat(minDuration)
        };
      }
      if (indoor !== undefined) {
        query['agentMetadata.indoor'] = indoor === 'true';
      }
      if (skillLevel) {
        query['agentMetadata.skillLevel'] = skillLevel;
      }
      if (ageAppropriate) {
        query['agentMetadata.minimumAge'] = { $lte: parseInt(ageAppropriate) };
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
        case 'duration_asc':
          sortOptions['agentMetadata.duration'] = 1;
          break;
        case 'duration_desc':
          sortOptions['agentMetadata.duration'] = -1;
          break;
        case 'popularity':
          sortOptions['rating.reviewCount'] = -1;
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

      // Add activity-specific metadata to response
      const activitiesWithDetails = recommendations.map(rec => ({
        ...rec.toObject(),
        activityDetails: {
          category: rec.agentMetadata?.category,
          duration: rec.agentMetadata?.duration,
          indoor: rec.agentMetadata?.indoor,
          outdoor: rec.agentMetadata?.outdoor,
          skillLevel: rec.agentMetadata?.skillLevel,
          minimumAge: rec.agentMetadata?.minimumAge,
          groupSize: rec.agentMetadata?.groupSize,
          accessibility: rec.agentMetadata?.accessibility,
          includesTransport: rec.agentMetadata?.includesTransport,
          includesMeals: rec.agentMetadata?.includesMeals,
          cancellationPolicy: rec.agentMetadata?.cancellationPolicy
        }
      }));

      res.json(formatSuccess({
        recommendations: activitiesWithDetails,
        total,
        count: recommendations.length,
        agentType: this.agentType,
        filters: {
          minRating, maxPrice, category, maxDuration, minDuration,
          indoor, skillLevel, ageAppropriate, sortBy
        },
        pagination: { limit: parseInt(limit), offset: parseInt(offset) }
      }, 'Activity recommendations retrieved successfully'));

    } catch (error) {
      this.log.error('Get activity recommendations error', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Failed to retrieve activity recommendations'
      });
    }
  }
}

// Export instance methods as controller functions
const controller = new ActivityRecommendationController();

export const getActivityRecommendations = (req, res) => controller.getRecommendations(req, res);
export const getActivityRecommendationById = (req, res) => controller.getRecommendationById(req, res);
export const selectActivityRecommendation = (req, res) => controller.selectRecommendation(req, res);
export const rerunActivityAgent = (req, res) => controller.rerunAgent(req, res);

export default controller;
