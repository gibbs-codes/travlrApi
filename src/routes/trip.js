import express from 'express';
import { 
  planTrip, 
  getAgentStatus, 
  getTripById,
  updateTripSelections,
  getTripStatus,
  retriggerAgents,
  getUserTrips
} from '../controllers/tripController.js';

const router = express.Router();

// Trip planning
router.post('/plan', planTrip);

// Trip management
router.get('/user', getUserTrips);
router.get('/:tripId', getTripById);
router.get('/:tripId/status', getTripStatus);
router.patch('/:tripId/selections', updateTripSelections);
router.post('/:tripId/retrigger', retriggerAgents);

// Agent status (legacy)
router.get('/agents/status', getAgentStatus);

export default router;