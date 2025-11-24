import express from 'express';
import { resolvePlace, getPlaceByGoogleId } from '../controllers/placeController.js';
import { asyncHandler } from '../middleware/validation.js';

const router = express.Router();

router.post('/resolve', asyncHandler(resolvePlace));
router.get('/:google_place_id', asyncHandler(getPlaceByGoogleId));

export default router;
