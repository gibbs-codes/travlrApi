/**
 * Simplified Trip Management API Routes
 * 
 * Minimal viable product (MVP) API for trip creation, management, and agent coordination
 * for the TravlrAPI with real-time status updates and structured validation.
 * 
 * FINAL MVP ENDPOINTS (6 total):
 * 
 * === CORE TRIP MANAGEMENT ===
 * POST   /api/trip/create           - Create trip with orchestrator trigger
 * GET    /api/trip/:tripId          - Get full trip with recommendations  
 * PUT    /api/trip/:tripId/select   - Update user recommendation selections
 * GET    /api/trip/:tripId/status   - Real-time execution status
 * POST   /api/trip/:tripId/rerun    - Selective agent re-execution (optional)
 * GET    /health                    - Health check endpoint
 * 
 * FEATURES:
 * - Structured input validation with detailed error messages
 * - Async orchestrator execution with real-time status tracking
 * - Comprehensive error handling and response formatting
 * - Selection validation and persistence
 * - Agent failure recovery and selective re-runs
 * - Database persistence with MongoDB models
 * 
 * REQUEST/RESPONSE FORMATS:
 * - All endpoints return consistent { success, data, message } format
 * - Validation errors include detailed field-level feedback
 * - Status endpoints provide real-time execution progress
 */

import express from 'express';
import { 
  createTrip,
  getTripById,
  selectRecommendations,
  getTripStatus,
  rerunAgents
} from '../controllers/tripController.js';

import {
  validateTripCreation,
  validateTripId,
  validateSelections,
  validateAgentRetrigger,
  formatError,
  asyncHandler
} from '../middleware/validation.js';

const router = express.Router();

// === CORE TRIP MANAGEMENT (MVP ENDPOINTS) ===

// POST /api/trip/create - Create trip with orchestrator trigger
router.post('/create', 
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

// === ERROR HANDLING ===

// Global error handler for trip routes
router.use(formatError);

export default router;