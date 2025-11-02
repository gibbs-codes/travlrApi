/**
 * Recommendation Routes
 *
 * Unified routes for all recommendation types with type-specific controllers.
 *
 * Routes:
 * GET    /api/recommendations/:tripId/flights           - Get flight recommendations
 * GET    /api/recommendations/:tripId/flights/:id       - Get single flight
 * PUT    /api/recommendations/:tripId/flights/:id/select - Select flight
 * POST   /api/recommendations/:tripId/flights/rerun     - Rerun flight agent
 *
 * Same pattern for: /hotels, /activities, /restaurants
 */

import express from 'express';
import { validateTripId, asyncHandler } from '../middleware/validation.js';

// Import all recommendation controllers
import {
  getFlightRecommendations,
  getFlightRecommendationById,
  selectFlightRecommendation,
  rerunFlightAgent
} from '../controllers/flightRecommendationController.js';

import {
  getHotelRecommendations,
  getHotelRecommendationById,
  selectHotelRecommendation,
  rerunHotelAgent
} from '../controllers/hotelRecommendationController.js';

import {
  getActivityRecommendations,
  getActivityRecommendationById,
  selectActivityRecommendation,
  rerunActivityAgent
} from '../controllers/activityRecommendationController.js';

import {
  getRestaurantRecommendations,
  getRestaurantRecommendationById,
  selectRestaurantRecommendation,
  rerunRestaurantAgent
} from '../controllers/restaurantRecommendationController.js';

const router = express.Router();

// === FLIGHT RECOMMENDATIONS ===

// GET /api/recommendations/:tripId/flights - Get all flight recommendations with filters
router.get('/:tripId/flights',
  validateTripId,
  asyncHandler(getFlightRecommendations)
);

// GET /api/recommendations/:tripId/flights/:recommendationId - Get single flight recommendation
router.get('/:tripId/flights/:recommendationId',
  validateTripId,
  asyncHandler(getFlightRecommendationById)
);

// PUT /api/recommendations/:tripId/flights/:recommendationId/select - Select flight
router.put('/:tripId/flights/:recommendationId/select',
  validateTripId,
  asyncHandler(selectFlightRecommendation)
);

// POST /api/recommendations/:tripId/flights/rerun - Re-run flight agent
router.post('/:tripId/flights/rerun',
  validateTripId,
  asyncHandler(rerunFlightAgent)
);

// === HOTEL RECOMMENDATIONS ===

// GET /api/recommendations/:tripId/hotels - Get all hotel recommendations with filters
router.get('/:tripId/hotels',
  validateTripId,
  asyncHandler(getHotelRecommendations)
);

// GET /api/recommendations/:tripId/hotels/:recommendationId - Get single hotel recommendation
router.get('/:tripId/hotels/:recommendationId',
  validateTripId,
  asyncHandler(getHotelRecommendationById)
);

// PUT /api/recommendations/:tripId/hotels/:recommendationId/select - Select hotel
router.put('/:tripId/hotels/:recommendationId/select',
  validateTripId,
  asyncHandler(selectHotelRecommendation)
);

// POST /api/recommendations/:tripId/hotels/rerun - Re-run hotel agent
router.post('/:tripId/hotels/rerun',
  validateTripId,
  asyncHandler(rerunHotelAgent)
);

// === ACTIVITY RECOMMENDATIONS ===

// GET /api/recommendations/:tripId/activities - Get all activity recommendations with filters
router.get('/:tripId/activities',
  validateTripId,
  asyncHandler(getActivityRecommendations)
);

// GET /api/recommendations/:tripId/activities/:recommendationId - Get single activity recommendation
router.get('/:tripId/activities/:recommendationId',
  validateTripId,
  asyncHandler(getActivityRecommendationById)
);

// PUT /api/recommendations/:tripId/activities/:recommendationId/select - Select activity
router.put('/:tripId/activities/:recommendationId/select',
  validateTripId,
  asyncHandler(selectActivityRecommendation)
);

// POST /api/recommendations/:tripId/activities/rerun - Re-run activity agent
router.post('/:tripId/activities/rerun',
  validateTripId,
  asyncHandler(rerunActivityAgent)
);

// === RESTAURANT RECOMMENDATIONS ===

// GET /api/recommendations/:tripId/restaurants - Get all restaurant recommendations with filters
router.get('/:tripId/restaurants',
  validateTripId,
  asyncHandler(getRestaurantRecommendations)
);

// GET /api/recommendations/:tripId/restaurants/:recommendationId - Get single restaurant recommendation
router.get('/:tripId/restaurants/:recommendationId',
  validateTripId,
  asyncHandler(getRestaurantRecommendationById)
);

// PUT /api/recommendations/:tripId/restaurants/:recommendationId/select - Select restaurant
router.put('/:tripId/restaurants/:recommendationId/select',
  validateTripId,
  asyncHandler(selectRestaurantRecommendation)
);

// POST /api/recommendations/:tripId/restaurants/rerun - Re-run restaurant agent
router.post('/:tripId/restaurants/rerun',
  validateTripId,
  asyncHandler(rerunRestaurantAgent)
);

export default router;
