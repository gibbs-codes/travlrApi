/**
 * Recommendation Service
 *
 * Handles business logic for recommendation processing and persistence
 */

import { Recommendation } from '../models/index.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'RecommendationService' });

// ===== RESULT EXTRACTION =====

export function extractRawResults(searchResult) {
  if (Array.isArray(searchResult)) {
    return searchResult;
  }

  // Check various nesting locations
  if (searchResult?.recommendations) {
    return searchResult.recommendations;
  }

  if (searchResult?.results) {
    return searchResult.results;
  }

  if (searchResult?.content?.recommendations) {
    return searchResult.content.recommendations;
  }

  return [];
}

export async function rankResults(agent, rawResults) {
  if (!agent.rank || !rawResults.length) {
    return rawResults;
  }

  try {
    return await agent.rank(rawResults);
  } catch (error) {
    log.warn('Agent ranking failed, using raw results', { error: error.message });
    return rawResults;
  }
}

export async function generateRecommendations(agent, rankedResults, context) {
  if (!agent.generateRecommendations || !rankedResults.length) {
    return { recommendations: rankedResults, metadata: null };
  }

  try {
    const generated = await agent.generateRecommendations(rankedResults, context);

    if (generated?.content?.recommendations && Array.isArray(generated.content.recommendations)) {
      return {
        recommendations: generated.content.recommendations,
        metadata: generated
      };
    }

    return { recommendations: rankedResults, metadata: null };
  } catch (error) {
    log.warn('Agent generateRecommendations failed, using ranked results', { error: error.message });
    return { recommendations: rankedResults, metadata: null };
  }
}

export function selectBestResults(generated, ranked, raw) {
  if (Array.isArray(generated) && generated.length > 0) {
    return generated;
  }

  if (Array.isArray(ranked) && ranked.length > 0) {
    return ranked;
  }

  if (Array.isArray(raw) && raw.length > 0) {
    return raw;
  }

  return [];
}

// ===== DATA NORMALIZATION =====

export function normalizePrice(rec) {
  const amount = rec?.totalPrice ?? rec?.price?.amount ?? rec?.price ?? 0;
  const currency = rec?.price?.currency || rec?.currency || 'USD';
  return { amount, currency };
}

export function normalizeRating(rec) {
  const score = rec?.rating?.score ?? rec?.rating;
  if (!score) return undefined;

  return {
    score,
    reviewCount: rec.reviewCount || 0,
    source: rec.source || 'agent'
  };
}

export function normalizeConfidence(rec, metadata) {
  const confidenceScore =
    typeof rec?.confidence === 'number'
      ? rec.confidence
      : typeof rec?.confidence?.score === 'number'
        ? rec.confidence.score
        : typeof metadata?.content?.confidence === 'number'
          ? metadata.content.confidence
          : 0.5;

  // Normalize to 0-1 range (many agents use 0-100)
  if (typeof confidenceScore !== 'number' || Number.isNaN(confidenceScore)) {
    return 0.5;
  }

  if (confidenceScore > 1) {
    return Math.min(1, confidenceScore / 100);
  }

  if (confidenceScore < 0) {
    return 0;
  }

  return confidenceScore;
}

export function normalizeImages(rec) {
  if (!rec?.images) return [];

  if (Array.isArray(rec.images)) {
    return rec.images
      .map((img, idx) => {
        if (!img) return null;
        if (typeof img === 'string') {
          return { url: img, alt: rec.name || `image-${idx + 1}` };
        }
        if (typeof img === 'object' && img.url) {
          return { url: img.url, alt: img.alt || rec.name };
        }
        return null;
      })
      .filter(Boolean);
  }

  if (typeof rec.images === 'string') {
    return [{ url: rec.images, alt: rec.name }];
  }

  return [];
}

// ===== PERSISTENCE =====

export async function saveRecommendation(rec, agentType, metadata) {
  try {
    const price = normalizePrice(rec);
    const rating = normalizeRating(rec);
    const confidence = normalizeConfidence(rec, metadata);
    const images = normalizeImages(rec);
    const reasoning = rec?.reasoning || metadata?.content?.reasoning;

    const recommendation = new Recommendation({
      agentType,
      name: rec.title || rec.name || rec.airline || rec.hotelName || 'Unnamed Recommendation',
      description: rec.details || rec.description || rec.summary || JSON.stringify(rec).substring(0, 500),
      price,
      rating,
      location: rec.location,
      availability: rec.availability,
      images,
      confidence: {
        score: confidence,
        reasoning
      },
      agentMetadata: rec
    });

    const saved = await recommendation.save();
    log.info(`✓ Saved recommendation: ${saved.name}`);
    return { success: true, recommendation: saved };
  } catch (error) {
    log.error(`Failed to save recommendation: ${error.message}`, { rec });
    return { success: false, error: error.message };
  }
}

export async function saveRecommendationBatch(recommendations, agentType, metadata) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    log.warn(`No recommendations to save for ${agentType}`);
    return [];
  }

  const savedIds = [];

  for (const rec of recommendations) {
    const result = await saveRecommendation(rec, agentType, metadata);
    if (result.success) {
      savedIds.push(result.recommendation._id);
    }
  }

  return savedIds;
}

// ===== TRIP CONTEXT =====

export function buildAgentCriteria(trip) {
  return {
    destination: trip.destination.name,
    destinationCountry: trip.destination.country,
    destinationPlaceId: trip.destination.placeId,
    destinationCoordinates: trip.destination.coordinates,
    origin: trip.origin.name,
    departureDate: trip.dates.departureDate.toISOString().split('T')[0],
    returnDate: trip.dates.returnDate?.toISOString().split('T')[0],
    checkInDate: trip.dates.departureDate.toISOString().split('T')[0],
    checkOutDate: trip.dates.returnDate?.toISOString().split('T')[0],
    travelers: trip.travelers.count,
    preferences: trip.preferences
  };
}

export function buildOrchestratorRequest(trip) {
  return {
    destination: trip.destination.name,
    destinationCountry: trip.destination.country,
    destinationPlaceId: trip.destination.placeId,
    origin: trip.origin.name,
    departureDate: trip.dates.departureDate.toISOString().split('T')[0],
    returnDate: trip.dates.returnDate?.toISOString().split('T')[0],
    travelers: trip.travelers.count,
    preferences: {
      accommodationType: trip.preferences.accommodation?.type,
      minHotelRating: trip.preferences.accommodation?.minRating,
      flightClass: trip.preferences.transportation?.flightClass,
      nonStopFlights: trip.preferences.transportation?.preferNonStop,
      cuisines: trip.preferences.dining?.cuisinePreferences
    },
    interests: trip.preferences.interests
  };
}
