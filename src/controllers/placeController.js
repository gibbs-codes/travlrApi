import { Place } from '../models/index.js';
import databaseService from '../services/database.js';
import googlePlacesService from '../services/googlePlacesService.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'PlaceController' });

const inferLevel = (types = []) => {
  if (types.includes('locality')) return 'locality';
  if (types.includes('administrative_area_level_1')) return 'admin_area';
  if (types.includes('country')) return 'country';
  return 'poi';
};

export const resolvePlace = async (req, res) => {
  try {
    const { google_place_id, provider } = req.body;
    if (!google_place_id || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'google_place_id and provider are required'
      });
    }

    await databaseService.connect();

    let place = await Place.findOne({ googlePlaceId: google_place_id });
    if (!place) {
      const details = await googlePlacesService.getPlaceDetails(google_place_id);
      const countryComponent = (details.address_components || []).find((c) => c.types?.includes('country'));
      place = await Place.create({
        googlePlaceId: google_place_id,
        displayName: details.name || details.formatted_address || google_place_id,
        lat: details.geometry?.location?.lat,
        lng: details.geometry?.location?.lng,
        countryCode: countryComponent?.short_name,
        level: inferLevel(details.types || []),
        types: details.types || []
      });
    }

    // For now, use google_place_id as provider location id with full confidence
    place.providerIds = place.providerIds || new Map();
    place.confidence = place.confidence || new Map();
    place.providerIds.set(provider, google_place_id);
    place.confidence.set(provider, 1);
    await place.save();

    res.json({
      success: true,
      data: {
        provider,
        locationId: google_place_id,
        confidence: 1
      }
    });
  } catch (error) {
    log.error('resolvePlace error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to resolve place'
    });
  }
};

export const getPlaceByGoogleId = async (req, res) => {
  try {
    const { google_place_id } = req.params;
    const place = await Place.findOne({ googlePlaceId: google_place_id });
    if (!place) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Place not found'
      });
    }
    res.json({ success: true, data: place });
  } catch (error) {
    log.error('getPlaceByGoogleId error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch place'
    });
  }
};
