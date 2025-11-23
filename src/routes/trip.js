/**
 * Trip Management API Routes
 *
 * Trip creation, management, and agent coordination with real-time status updates.
 *
 * === CORE TRIP MANAGEMENT ===
 * POST   /api/trip/create                    - Create trip with orchestrator trigger
 * GET    /api/trip/:tripId                   - Get full trip with recommendations
 * PUT    /api/trip/:tripId/select            - Update ALL recommendation selections (legacy)
 * GET    /api/trip/:tripId/status            - Real-time execution status
 * POST   /api/trip/:tripId/rerun             - Re-run ALL agents (legacy)
 * POST   /api/trip/:tripId/agents/start      - Start specific agents after trip creation
 *
 * === MODULAR RECOMMENDATION ENDPOINTS (NEW) ===
 * GET    /api/trip/:tripId/recommendations/flights         - Get flight recommendations
 * PUT    /api/trip/:tripId/recommendations/flights/select  - Select flight
 * POST   /api/trip/:tripId/recommendations/flights/rerun   - Re-run flight agent
 *
 * GET    /api/trip/:tripId/recommendations/hotels          - Get hotel recommendations
 * PUT    /api/trip/:tripId/recommendations/hotels/select   - Select hotel
 * POST   /api/trip/:tripId/recommendations/hotels/rerun    - Re-run hotel agent
 *
 * GET    /api/trip/:tripId/recommendations/experiences     - Get activity recommendations
 * PUT    /api/trip/:tripId/recommendations/experiences/select - Select activity
 * POST   /api/trip/:tripId/recommendations/experiences/rerun - Re-run activity agent
 *
 * GET    /api/trip/:tripId/recommendations/restaurants     - Get restaurant recommendations
 * PUT    /api/trip/:tripId/recommendations/restaurants/select - Select restaurant
 * POST   /api/trip/:tripId/recommendations/restaurants/rerun - Re-run restaurant agent
 *
 * FEATURES:
 * - Type-specific filtering and sorting
 * - Granular agent control
 * - Backward compatible with legacy endpoints
 * - Consistent response formatting
 */

import express from 'express';
import {
  createTrip,
  getTripById,
  selectRecommendations,
  getTripStatus,
  rerunAgents,
  startAgents
} from '../controllers/tripController.js';

// Import modular recommendation controllers
import {
  getFlightRecommendations,
  selectFlightRecommendation,
  rerunFlightAgent
} from '../controllers/flightRecommendationController.js';

import {
  getHotelRecommendations,
  selectHotelRecommendation,
  rerunHotelAgent
} from '../controllers/hotelRecommendationController.js';

import {
  getActivityRecommendations,
  selectActivityRecommendation,
  rerunActivityAgent
} from '../controllers/activityRecommendationController.js';

import {
  getRestaurantRecommendations,
  selectRestaurantRecommendation,
  rerunRestaurantAgent
} from '../controllers/restaurantRecommendationController.js';

import {
  validateTripCreation,
  validateTripId,
  validateSelections,
  validateAgentRetrigger,
  formatError,
  asyncHandler
} from '../middleware/validation.js';
import normalizeCreateTrip from '../middleware/normalizeCreateTrip.js';

const router = express.Router();

// === CORE TRIP MANAGEMENT (MVP ENDPOINTS) ===

// POST /api/trip/create - Create trip with orchestrator trigger
router.post('/create', 
  normalizeCreateTrip,
  validateTripCreation,
  asyncHandler(createTrip)
);

// GET /api/trip/:tripId - Return full trip with all recommendations
router.get('/:tripId', 
  validateTripId,
  asyncHandler(getTripById)
);

// PUT /api/trip/:tripId/select - Handle user recommendation selections
router.put('/:tripId/select',
  validateTripId,
  validateSelections,
  asyncHandler(selectRecommendations)
);

// GET /api/trip/:tripId/status - Real-time orchestrator execution status
router.get('/:tripId/status',
  validateTripId,
  asyncHandler(getTripStatus)
);

// POST /api/trip/:tripId/rerun - Trigger selective or full agent re-runs (optional)
router.post('/:tripId/rerun',
  validateTripId,
  validateAgentRetrigger,
  asyncHandler(rerunAgents)
);

// POST /api/trip/:tripId/agents/start - Start specific agents for existing trip
router.post('/:tripId/agents/start',
  validateTripId,
  asyncHandler(startAgents)
);

// === INDIVIDUAL AGENT ENDPOINTS (SIMPLIFIED) ===

// Flight Agent
router.post('/:tripId/agent/flight',
  validateTripId,
  asyncHandler(rerunFlightAgent)
);
router.post('/:tripId/agent/flight/rerun',
  validateTripId,
  asyncHandler(rerunFlightAgent)
);

// Accommodation Agent
router.post('/:tripId/agent/accommodation',
  validateTripId,
  asyncHandler(rerunHotelAgent)
);
router.post('/:tripId/agent/accommodation/rerun',
  validateTripId,
  asyncHandler(rerunHotelAgent)
);

// Activity Agent
router.post('/:tripId/agent/activity',
  validateTripId,
  asyncHandler(rerunActivityAgent)
);
router.post('/:tripId/agent/activity/rerun',
  validateTripId,
  asyncHandler(rerunActivityAgent)
);

// Restaurant Agent
router.post('/:tripId/agent/restaurant',
  validateTripId,
  asyncHandler(rerunRestaurantAgent)
);
router.post('/:tripId/agent/restaurant/rerun',
  validateTripId,
  asyncHandler(rerunRestaurantAgent)
);

// === MODULAR RECOMMENDATION ENDPOINTS ===

// --- FLIGHT RECOMMENDATIONS ---

// GET /api/trip/:tripId/recommendations/flights - Get flight recommendations
router.get('/:tripId/recommendations/flights',
  validateTripId,
  asyncHandler(getFlightRecommendations)
);

// PUT /api/trip/:tripId/recommendations/flights/select - Select flight
// Note: recommendationId comes from request body
router.put('/:tripId/recommendations/flights/select',
  validateTripId,
  asyncHandler((req, res) => {
    // Extract recommendationId from body and add to params
    req.params.recommendationId = req.body.recommendationId;
    return selectFlightRecommendation(req, res);
  })
);

// POST /api/trip/:tripId/recommendations/flights/rerun - Re-run flight agent
router.post('/:tripId/recommendations/flights/rerun',
  validateTripId,
  asyncHandler(rerunFlightAgent)
);

// --- HOTEL RECOMMENDATIONS ---

// GET /api/trip/:tripId/recommendations/hotels - Get hotel recommendations
router.get('/:tripId/recommendations/hotels',
  validateTripId,
  asyncHandler(getHotelRecommendations)
);

// PUT /api/trip/:tripId/recommendations/hotels/select - Select hotel
router.put('/:tripId/recommendations/hotels/select',
  validateTripId,
  asyncHandler((req, res) => {
    req.params.recommendationId = req.body.recommendationId;
    return selectHotelRecommendation(req, res);
  })
);

// POST /api/trip/:tripId/recommendations/hotels/rerun - Re-run hotel agent
router.post('/:tripId/recommendations/hotels/rerun',
  validateTripId,
  asyncHandler(rerunHotelAgent)
);

// --- ACTIVITY/EXPERIENCE RECOMMENDATIONS ---

// GET /api/trip/:tripId/recommendations/experiences - Get activity recommendations
router.get('/:tripId/recommendations/experiences',
  validateTripId,
  asyncHandler(getActivityRecommendations)
);

// PUT /api/trip/:tripId/recommendations/experiences/select - Select activity
router.put('/:tripId/recommendations/experiences/select',
  validateTripId,
  asyncHandler((req, res) => {
    req.params.recommendationId = req.body.recommendationId;
    return selectActivityRecommendation(req, res);
  })
);

// POST /api/trip/:tripId/recommendations/experiences/rerun - Re-run activity agent
router.post('/:tripId/recommendations/experiences/rerun',
  validateTripId,
  asyncHandler(rerunActivityAgent)
);

// --- RESTAURANT RECOMMENDATIONS ---

// GET /api/trip/:tripId/recommendations/restaurants - Get restaurant recommendations
router.get('/:tripId/recommendations/restaurants',
  validateTripId,
  asyncHandler(getRestaurantRecommendations)
);

// PUT /api/trip/:tripId/recommendations/restaurants/select - Select restaurant
router.put('/:tripId/recommendations/restaurants/select',
  validateTripId,
  asyncHandler((req, res) => {
    req.params.recommendationId = req.body.recommendationId;
    return selectRestaurantRecommendation(req, res);
  })
);

// POST /api/trip/:tripId/recommendations/restaurants/rerun - Re-run restaurant agent
router.post('/:tripId/recommendations/restaurants/rerun',
  validateTripId,
  asyncHandler(rerunRestaurantAgent)
);

// === ERROR HANDLING ===

// Global error handler for trip routes
router.use(formatError);

export default router;
