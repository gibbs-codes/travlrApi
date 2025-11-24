/**
 * Trip Service - Business Logic Layer
 *
 * Pure functions for trip management, separated from HTTP concerns
 */

import { Trip } from '../models/index.js';
import logger from '../utils/logger.js';
import { AGENT_TYPE_LIST } from '../constants/agentTypes.js';

const log = logger.child({ scope: 'TripService' });

// ===== VALIDATION =====

export function validateAgentList(agentsToRun) {
  const VALID_AGENTS = AGENT_TYPE_LIST;

  if (!agentsToRun) {
    return { valid: true, agents: VALID_AGENTS };
  }

  if (!Array.isArray(agentsToRun)) {
    return {
      valid: false,
      error: 'agentsToRun must be an array'
    };
  }

  const invalidAgents = agentsToRun.filter(agent => !VALID_AGENTS.includes(agent));
  if (invalidAgents.length > 0) {
    return {
      valid: false,
      error: `Invalid agent names: ${invalidAgents.join(', ')}. Valid agents are: ${VALID_AGENTS.join(', ')}`
    };
  }

  // Remove duplicates
  const uniqueAgents = [...new Set(agentsToRun)];
  return { valid: true, agents: uniqueAgents };
}

export function validateTripInput(tripData) {
  const errors = [];

  if (!tripData.destination) {
    errors.push('destination is required');
  }

  if (!tripData.origin) {
    errors.push('origin is required');
  }

  if (!tripData.departureDate) {
    errors.push('departureDate is required');
  }

  // Validate travelers
  if (tripData.travelers) {
    const count = typeof tripData.travelers === 'number'
      ? tripData.travelers
      : tripData.travelers.count || tripData.travelers.adults || 1;

    if (count < 1 || count > 20) {
      errors.push('travelers must be between 1 and 20');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ===== DATA PREPARATION =====

export function prepareTripData(input) {
  const {
    destination,
    origin,
    departureDate,
    returnDate,
    travelers = 1,
    preferences = {},
    interests = ['cultural', 'food'],
    createdBy = 'anonymous',
    collaboration,
  } = input;

  // Normalize travelers to object format
  const travelersData = typeof travelers === 'number'
    ? { count: travelers, adults: travelers }
    : travelers;

  // Handle collaboration data
  const collaborationData = collaboration || {};
  const tripCreatedBy = collaborationData.createdBy || createdBy;

  return {
    destination: typeof destination === 'string'
      ? { name: destination }
      : destination,
    origin: typeof origin === 'string'
      ? { name: origin }
      : origin,
    dates: {
      departureDate: new Date(departureDate),
      returnDate: returnDate ? new Date(returnDate) : null,
    },
    travelers: travelersData,
    preferences,
    interests: Array.isArray(interests) ? interests : [],
    collaboration: {
      createdBy: tripCreatedBy,
      ...collaborationData,
    },
  };
}

export function initializeAgentExecution(selectedAgents) {
  const agentStatuses = {};

  for (const agent of selectedAgents) {
    agentStatuses[agent] = {
      status: 'idle',
      recommendationCount: 0,
      errors: [],
    };
  }

  return {
    status: 'pending',
    agents: agentStatuses,
  };
}

// ===== DATABASE OPERATIONS =====

export async function saveTripToDatabase(tripData) {
  try {
    const trip = new Trip(tripData);
    await trip.save();
    log.info(`Trip created: ${trip.tripId}`);
    return { success: true, trip };
  } catch (error) {
    log.error(`Failed to save trip: ${error.message}`);
    return {
      success: false,
      error: error.message,
      mongoError: error
    };
  }
}

export async function findTripById(tripId) {
  try {
    const trip = await Trip.findOne({ tripId });
    return { success: true, trip };
  } catch (error) {
    log.error(`Failed to find trip ${tripId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ===== ORCHESTRATOR HELPER =====

export function shouldTriggerOrchestrator(orchestratorEnabled, triggerFlag) {
  return orchestratorEnabled && triggerFlag === true;
}

export function buildOrchestratorRequest(trip, selectedAgents) {
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
      cuisines: trip.preferences.dining?.cuisinePreferences,
    },
    interests: trip.preferences.interests,
    agentsToRun: selectedAgents,
  };
}
