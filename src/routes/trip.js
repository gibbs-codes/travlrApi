/**\n * Enhanced Trip Management API Routes\n * \n * Provides comprehensive trip creation, management, and agent coordination\n * for the TravlrAPI with real-time status updates and structured validation.\n * \n * ENDPOINTS:\n * \n * === TRIP CREATION & MANAGEMENT ===\n * POST   /api/trip/create           - Create trip with orchestrator trigger\n * GET    /api/trip/:tripId          - Get full trip with recommendations  \n * PUT    /api/trip/:tripId/select   - Update user recommendation selections\n * GET    /api/trip/:tripId/status   - Real-time execution status\n * \n * === AGENT MANAGEMENT ===\n * POST   /api/trip/:tripId/rerun    - Selective agent re-execution\n * GET    /api/trip/:tripId/agents   - Detailed agent execution metrics\n * \n * === USER MANAGEMENT ===\n * GET    /api/trip/user             - User's trips with pagination\n * \n * === LEGACY ENDPOINTS ===\n * POST   /api/trip/plan             - Legacy trip planning\n * PATCH  /api/trip/:tripId/selections - Legacy selection update\n * POST   /api/trip/:tripId/retrigger  - Legacy agent retrigger\n * GET    /api/trip/agents/status    - Global agent status\n * \n * FEATURES:\n * - Structured input validation with detailed error messages\n * - Async orchestrator execution with real-time status tracking\n * - Comprehensive error handling and response formatting\n * - Selection validation and persistence\n * - Agent failure recovery and selective re-runs\n * - Geographic service integration for location intelligence\n * - Database persistence with MongoDB models\n * \n * REQUEST/RESPONSE FORMATS:\n * - All endpoints return consistent { success, data, message } format\n * - Validation errors include detailed field-level feedback\n * - Status endpoints provide real-time execution progress\n * - Agent endpoints include confidence scoring and timing metrics\n */\n\nimport express from 'express';
import { 
  // Legacy endpoints
  planTrip, 
  getAgentStatus,
  getUserTrips,
  getTripById,
  updateTripSelections,
  getTripStatus,
  retriggerAgents,
  // New enhanced endpoints
  createTrip,
  selectRecommendations,
  rerunAgents,
  getAgentDetails
} from '../controllers/tripController.js';

import {
  validateTripCreation,
  validateTripId,
  validateSelections,
  validateAgentRetrigger,
  validatePagination,
  formatError,
  asyncHandler
} from '../middleware/validation.js';

const router = express.Router();

// === TRIP CREATION & MANAGEMENT ===

// POST /api/trip/create - Enhanced form-based trip creation with orchestrator trigger
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

// === AGENT MANAGEMENT ===

// POST /api/trip/:tripId/rerun - Trigger selective or full agent re-runs
router.post('/:tripId/rerun',
  validateTripId,
  validateAgentRetrigger,
  asyncHandler(rerunAgents)
);

// GET /api/trip/:tripId/agents - Agent-by-agent execution details
router.get('/:tripId/agents',
  validateTripId,
  asyncHandler(getAgentDetails)
);

// === USER TRIP MANAGEMENT ===

// GET /api/trip/user - Get user's trips with pagination
router.get('/user', 
  validatePagination,
  asyncHandler(getUserTrips)
);

// === LEGACY ENDPOINTS (maintained for backward compatibility) ===

// POST /api/trip/plan - Legacy trip planning endpoint
router.post('/plan', 
  asyncHandler(planTrip)
);

// PATCH /api/trip/:tripId/selections - Legacy selection update
router.patch('/:tripId/selections',
  validateTripId,
  validateSelections,
  asyncHandler(updateTripSelections)
);

// POST /api/trip/:tripId/retrigger - Legacy agent retrigger
router.post('/:tripId/retrigger',
  validateTripId,
  validateAgentRetrigger,
  asyncHandler(retriggerAgents)
);

// GET /api/trip/agents/status - Legacy global agent status
router.get('/agents/status', 
  asyncHandler(getAgentStatus)
);

// === ERROR HANDLING ===

// Global error handler for trip routes
router.use(formatError);

export default router;