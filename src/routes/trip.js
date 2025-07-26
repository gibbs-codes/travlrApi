import express from 'express';
import { planTrip, getAgentStatus } from '../controllers/tripController.js';

const router = express.Router();

router.post('/plan', planTrip);
router.get('/agents/status', getAgentStatus);

export default router;