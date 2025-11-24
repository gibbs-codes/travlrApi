/**
 * Recommendation Routes
 *
 * ⚠️ DEPRECATED: These routes are deprecated as of 2025-01-24
 * Use /api/trip/:tripId/recommendations/:type endpoints instead
 *
 * This file will be removed in a future release (target: 2025-03-01)
 *
 * DEPRECATED Routes:
 * GET    /api/recommendations/:tripId/flights           - Use /api/trip/:tripId/recommendations/flights
 * GET    /api/recommendations/:tripId/flights/:id       - Not recommended, fetch full list instead
 * PUT    /api/recommendations/:tripId/flights/:id/select - Use /api/trip/:tripId/select/:id
 * POST   /api/recommendations/:tripId/flights/rerun     - Use /api/trip/:tripId/agent/flight/rerun
 *
 * CANONICAL ENDPOINTS (use these):
 * - GET    /api/trip/:tripId/recommendations/:type
 * - POST   /api/trip/:tripId/select/:recommendationId
 * - POST   /api/trip/:tripId/agent/:type/rerun
 *
 * @deprecated Use /api/trip/:tripId/recommendations routes instead
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

// Deprecation warning middleware
const deprecationWarning = (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', '2025-03-01');
  res.setHeader('Link', '</api/trip>; rel="alternate"');
  console.warn(`⚠️  DEPRECATED ENDPOINT: ${req.method} ${req.originalUrl} - Use /api/trip/:tripId/recommendations instead`);
  next();
};

// Apply deprecation warning to all routes
router.use(deprecationWarning);

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
