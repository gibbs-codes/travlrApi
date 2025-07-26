import express from 'express';
import { getDestinations } from '../controllers/travelController.js';

const router = express.Router();

router.get('/destinations', getDestinations);

export default router;