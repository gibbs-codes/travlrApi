/**
 * Trip Sharing API Routes
 * 
 * Light MVP collaboration features for trip sharing without full authentication.
 * 
 * ENDPOINTS:
 * 
 * === SHARING MANAGEMENT ===
 * GET    /api/trip/:tripId/share       - Get sharing status for trip
 * POST   /api/trip/:tripId/share       - Generate/get shareable link
 * DELETE /api/trip/:tripId/share       - Disable sharing for trip
 * 
 * === SHARED ACCESS ===
 * GET    /api/share/:shareToken        - Access trip via share link (read-only)
 * 
 * === COLLABORATION (Future) ===
 * POST   /api/trip/:tripId/collaborators - Add collaborator to trip
 * 
 * FEATURES:
 * - Secure random token generation for shareable links
 * - Configurable link expiration (default 30 days)
 * - Access tracking and analytics
 * - Read-only shared trip access
 * - Basic ownership validation
 * - Future-ready collaborator system
 * 
 * AUTHENTICATION APPROACH:
 * - MVP: Simple user identification via email/userId in request body
 * - No registration required - anonymous trips supported
 * - Basic ownership checks for sharing actions
 * - Prepared for future user account system integration
 */

import express from 'express';
import { 
  generateShareLink,
  getSharedTrip,
  disableSharing,
  getSharingStatus,
  addCollaborator
} from '../controllers/sharingController.js';

import {
  validateTripId,
  validateShareToken,
  validateCollaborator,
  formatError,
  asyncHandler
} from '../middleware/validation.js';

const router = express.Router();

// === SHARING MANAGEMENT ===

// GET /api/trip/:tripId/share - Get sharing status
router.get('/trip/:tripId/share', 
  validateTripId,
  asyncHandler(getSharingStatus)
);

// POST /api/trip/:tripId/share - Generate shareable link
router.post('/trip/:tripId/share',
  validateTripId,
  asyncHandler(generateShareLink)
);

// DELETE /api/trip/:tripId/share - Disable sharing
router.delete('/trip/:tripId/share',
  validateTripId,
  asyncHandler(disableSharing)
);

// === SHARED ACCESS ===

// GET /api/share/:shareToken - Access shared trip (read-only)
router.get('/share/:shareToken',
  validateShareToken,
  asyncHandler(getSharedTrip)
);

// === COLLABORATION (Future Feature) ===

// POST /api/trip/:tripId/collaborators - Add collaborator
router.post('/trip/:tripId/collaborators',
  validateTripId,
  validateCollaborator,
  asyncHandler(addCollaborator)
);

// === ERROR HANDLING ===

// Global error handler for sharing routes
router.use(formatError);

export default router;