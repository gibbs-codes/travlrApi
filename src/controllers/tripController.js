import { TripOrchestrator } from '../agents/tripOrchestrator.js';
import { FlightAgent } from '../agents/flightAgent.js';
import { AccommodationAgent } from '../agents/accommodationAgent.js';
import { ActivityAgent } from '../agents/activityAgent.js';
import { RestaurantAgent } from '../agents/restaurantAgent.js';
import { Trip, Recommendation, Place } from '../models/index.js';
import databaseService from '../services/database.js';
import googlePlacesService from '../services/googlePlacesService.js';
import { formatSuccess, formatErrorResponse } from '../middleware/validation.js';
import * as tripService from '../services/tripService.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'TripController' });
const ORCHESTRATOR_ENABLED = process.env.ENABLE_ORCHESTRATOR === 'true';

const inferLevel = (types = []) => {
  if (types.includes('locality')) return 'locality';
  if (types.includes('administrative_area_level_1')) return 'admin_area';
  if (types.includes('country')) return 'country';
  return 'poi';
};

// Single recommendation selection alias
export const selectSingleRecommendation = async (req, res) => {
  const { tripId, recommendationId } = req.params;
  const trip = await Trip.findOne({ tripId });
  if (!trip) {
    return res.status(404).json({
      success: false,
      error: 'Trip not found',
      message: `Trip with ID ${tripId} does not exist`
    });
  }

  const categories = Object.keys(trip.recommendations || {});
  const matchedCategory = categories.find((cat) =>
    (trip.recommendations[cat] || []).some((id) => id.toString() === recommendationId)
  );

  if (!matchedCategory) {
    return res.status(404).json({
      success: false,
      error: 'Recommendation not found',
      message: 'Recommendation does not belong to this trip'
    });
  }

  req.body.selections = { [matchedCategory]: [recommendationId] };
  return selectRecommendations(req, res);
};

async function findOrCreatePlace(googlePlaceId) {
  if (!googlePlaceId) return null;
  await databaseService.connect();
  const existing = await Place.findOne({ googlePlaceId });
  if (existing) return existing;

  try {
    const details = await googlePlacesService.getPlaceDetails(googlePlaceId);
    const countryComponent = (details.address_components || []).find((c) => c.types?.includes('country'));

    const place = await Place.create({
      googlePlaceId,
      displayName: details.name || details.formatted_address || googlePlaceId,
      lat: details.geometry?.location?.lat,
      lng: details.geometry?.location?.lng,
      countryCode: countryComponent?.short_name,
      level: inferLevel(details.types || []),
      types: details.types || []
    });

    return place;
  } catch (error) {
    // For MVP: If Google Places API fails, create a minimal place record
    log.warn(`Failed to fetch place details from Google, creating minimal record: ${error.message}`);
    const place = await Place.create({
      googlePlaceId,
      displayName: 'Unknown Place',
      lat: 0,
      lng: 0,
      countryCode: null,
      level: 'locality',
      types: []
    });
    return place;
  }
}

// Helper function to execute orchestrator asynchronously
async function executeOrchestratorAsync(tripId, tripRequest) {
  if (!ORCHESTRATOR_ENABLED) {
    log.info('⏸️ Orchestrator is disabled via ENABLE_ORCHESTRATOR. Skipping background execution.');
    return null;
  }

  try {
    log.info(`🚀 Starting orchestrator execution for trip ${tripId}`);

    // Log which agents will be executed
    const agentsToRun = tripRequest.agentsToRun || ['flight', 'accommodation', 'activity', 'restaurant'];
    log.info(`🎯 Executing agents: ${agentsToRun.join(', ')}`);

    // Create orchestrator instance
    const orchestrator = new TripOrchestrator({}, tripId);

    // Execute the orchestrator (tripRequest contains agentsToRun)
    const result = await orchestrator.execute(tripRequest, tripId);

    log.info(`✅ Orchestrator execution completed for trip ${tripId}`);
    return result;

  } catch (error) {
    log.error(`❌ Orchestrator execution failed for trip ${tripId}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}


/**
 * GET /api/trip/:tripId
 *
 * Returns trip metadata and status WITHOUT populating recommendations.
 * This endpoint provides a lean response (~80-90% smaller payload) containing:
 * - Trip metadata (destination, dates, travelers, preferences)
 * - Agent execution status and counts
 * - Recommendation IDs (not full objects)
 * - Selected recommendation IDs (not full objects)
 *
 * To fetch actual recommendations, use the modular endpoints:
 * - GET /api/trip/:tripId/recommendations/flights
 * - GET /api/trip/:tripId/recommendations/hotels
 * - GET /api/trip/:tripId/recommendations/experiences
 * - GET /api/trip/:tripId/recommendations/restaurants
 *
 * This architecture allows:
 * - Fast initial trip overview load
 * - Independent recommendation fetching per agent
 * - Per-agent loading states in UI
 * - Reduced initial bandwidth usage
 */
export const getTripById = async (req, res) => {
  try {
    const { tripId } = req.params;

    // Fetch trip WITHOUT populating recommendations (lean response)
    const trip = await Trip.findOne({ tripId });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found',
        message: `Trip with ID ${tripId} does not exist`
      });
    }

    // Response includes:
    // - All trip metadata
    // - agentExecution with status and counts
    // - Recommendation array lengths (IDs only, not populated)
    // - Selected recommendations (IDs only, not populated)
    res.json(formatSuccess(trip, 'Trip metadata retrieved successfully'));

  } catch (error) {
    log.error('Get trip error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error retrieving trip'
    });
  }
};


export const getTripStatus = async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const trip = await Trip.findOne({ tripId }, {
      tripId: 1,
      status: 1,
      agentExecution: 1,
      'recommendations.flight': 1,
      'recommendations.accommodation': 1,
      'recommendations.activity': 1,
      'recommendations.restaurant': 1,
      'recommendations.transportation': 1,
      updatedAt: 1
    });

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    const recommendationCounts = {
      flight: trip.recommendations.flight?.length || 0,
      accommodation: trip.recommendations.accommodation?.length || 0,
      activity: trip.recommendations.activity?.length || 0,
      restaurant: trip.recommendations.restaurant?.length || 0,
      transportation: trip.recommendations.transportation?.length || 0
    };

    res.json(formatSuccess(
      {
        tripId: trip.tripId,
        status: trip.status,
        execution: trip.agentExecution,
        recommendationCounts,
        lastUpdated: trip.updatedAt
      },
      'Trip status retrieved successfully'
    ));

  } catch (error) {
    log.error('Get trip status error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error retrieving trip status'
    });
  }
};



// New enhanced trip creation endpoint - REFACTORED
export const createTrip = async (req, res) => {
  try {
    const { triggerOrchestrator = false, agentsToRun, title } = req.body;

    // Step 1: Validate agents
    const agentValidation = tripService.validateAgentList(agentsToRun);
    if (!agentValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: agentValidation.error,
        timestamp: new Date().toISOString(),
      });
    }

    // Step 2: Validate trip input
    const inputValidation = tripService.validateTripInput(req.body);
    if (!inputValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: inputValidation.errors,
        message: 'Please check your input',
        timestamp: new Date().toISOString(),
      });
    }

    // Step 3: Determine orchestrator execution
    const shouldRunOrchestrator = tripService.shouldTriggerOrchestrator(
      ORCHESTRATOR_ENABLED,
      triggerOrchestrator
    );

    // Step 4: Prepare trip data
    const tripData = tripService.prepareTripData(req.body);
    tripData.title = title || `Trip to ${tripData.destination.name}`;
    tripData.agentExecution = tripService.initializeAgentExecution(agentValidation.agents);
    tripData.status = shouldRunOrchestrator ? 'planning' : 'draft';

    // Ensure database connection
    await databaseService.connect();

    // Step 5: Save to database
    const saveResult = await tripService.saveTripToDatabase(tripData);
    if (!saveResult.success) {
      return res.status(500).json({
        success: false,
        error: saveResult.error,
        message: 'Failed to create trip',
        timestamp: new Date().toISOString(),
      });
    }

    const trip = saveResult.trip;
    log.info(`✅ Created trip ${trip.tripId} for ${trip.destination.name}`);
    log.info(`🎯 Agents configured: ${agentValidation.agents.join(', ')}`);

    // Step 6: Trigger orchestrator if requested
    if (shouldRunOrchestrator) {
      const orchestratorRequest = tripService.buildOrchestratorRequest(
        trip,
        agentValidation.agents
      );

      executeOrchestratorAsync(trip._id, orchestratorRequest).catch(error => {
        log.error(`Orchestrator failed: ${error.message}`, { stack: error.stack });
      });

      log.info(`Orchestrator triggered for trip ${trip.tripId}`);
    }

    // Step 7: Return success response
    const estimatedCompletion = shouldRunOrchestrator
      ? new Date(Date.now() + 180000).toISOString() // 3 minutes estimate
      : null;

    return res.status(201).json(formatSuccess(
      {
        tripId: trip.tripId,
        title: trip.title,
        status: trip.status,
        destination: {
          name: trip.destination.name,
          country: trip.destination.country || null
        },
        origin: {
          name: trip.origin.name,
          country: trip.origin.country || null
        },
        dates: {
          departureDate: trip.dates.departureDate.toISOString().split('T')[0],
          returnDate: trip.dates.returnDate ? trip.dates.returnDate.toISOString().split('T')[0] : null,
        },
        travelers: trip.travelers,
        agentExecution: {
          status: trip.agentExecution.status,
          estimatedCompletion
        },
        orchestratorTriggered: shouldRunOrchestrator,
        agents: agentValidation.agents,
      },
      shouldRunOrchestrator
        ? 'Trip created successfully. Generating recommendations...'
        : 'Trip draft created successfully'
    ));

  } catch (error) {
    log.error('Trip creation error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to create trip'
    });
  }
};

// Spec-aligned trip creation with Google Place IDs and no auto-orchestration
export const createTripV2 = async (req, res) => {
  try {
    const {
      name,
      origin_google_place_id,
      origin_name,
      origin_lat,
      origin_lng,
      dest_google_place_id,
      dest_name,
      dest_lat,
      dest_lng,
      start_date,
      end_date
    } = req.body;

    if (!origin_google_place_id || !dest_google_place_id || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'name, origin_google_place_id, dest_google_place_id, start_date, and end_date are required'
      });
    }

    // If place data provided from frontend, use it directly (skip Google API call)
    const originPlace = origin_name ? {
      googlePlaceId: origin_google_place_id,
      displayName: origin_name,
      lat: origin_lat || 0,
      lng: origin_lng || 0,
      countryCode: null
    } : await findOrCreatePlace(origin_google_place_id);

    const destPlace = dest_name ? {
      googlePlaceId: dest_google_place_id,
      displayName: dest_name,
      lat: dest_lat || 0,
      lng: dest_lng || 0,
      countryCode: null
    } : await findOrCreatePlace(dest_google_place_id);

    await databaseService.connect();

    const trip = await Trip.create({
      title: name || `Trip to ${dest_name || 'Unknown'}`,
      destination: {
        name: dest_name || destPlace?.displayName || 'Unknown Destination',
        country: destPlace?.countryCode,
        coordinates: { lat: dest_lat || destPlace?.lat || 0, lng: dest_lng || destPlace?.lng || 0 },
        placeId: destPlace?.googlePlaceId || dest_google_place_id
      },
      origin: {
        name: origin_name || originPlace?.displayName || 'Unknown Origin',
        country: originPlace?.countryCode,
        coordinates: { lat: origin_lat || originPlace?.lat || 0, lng: origin_lng || originPlace?.lng || 0 },
        placeId: originPlace?.googlePlaceId || origin_google_place_id
      },
      dates: {
        departureDate: new Date(start_date),
        returnDate: new Date(end_date)
      },
      preferences: {
        interests: ['cultural', 'food'],
        accommodation: { type: 'any', minRating: 3, requiredAmenities: [] },
        transportation: { flightClass: 'economy', preferNonStop: false, localTransport: 'mixed' },
        dining: { dietaryRestrictions: [], cuisinePreferences: [] },
        accessibility: {}
      },
      status: 'draft',
      agentExecution: {
        status: 'pending',
        agents: {
          flight: { status: 'idle', recommendationCount: 0, errors: [] },
          accommodation: { status: 'idle', recommendationCount: 0, errors: [] },
          activity: { status: 'idle', recommendationCount: 0, errors: [] },
          restaurant: { status: 'idle', recommendationCount: 0, errors: [] }
        }
      },
      collaboration: {
        createdBy: 'anonymous'
      }
    });

    return res.status(201).json(formatSuccess(
      trip,
      'Trip created successfully (no agents started)'
    ));
  } catch (error) {
    log.error('Trip creation v2 error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to create trip'
    });
  }
};

// Enhanced trip selection endpoint with validation
export const selectRecommendations = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { selections, selectedBy = 'user' } = req.body;

    const trip = await Trip.findOne({ tripId });
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found',
        message: `Trip with ID ${tripId} does not exist`
      });
    }

    // Check if trip has recommendations to select from
    const allowedStatuses = ['recommendations_ready', 'user_selecting', 'finalized'];
    if (!allowedStatuses.includes(trip.status)) {
      return res.status(400).json({
        success: false,
        error: 'Trip not ready for selections',
        message: `Trip status is '${trip.status}'. Please wait for recommendations to be generated before making selections.`
      });
    }

    const updateData = {};
    const selectionSummary = {};
    
    for (const [category, recommendationIds] of Object.entries(selections)) {
      // Verify recommendations exist and belong to this trip
      const validRecommendations = trip.recommendations[category] || [];
      const invalidIds = recommendationIds.filter(id => 
        !validRecommendations.some(recId => recId.toString() === id)
      );
      
      if (invalidIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid recommendation IDs for ${category}`,
          details: invalidIds,
          message: 'Some selected recommendations do not belong to this trip'
        });
      }

      const selectedRecs = recommendationIds.map((recId, index) => ({
        recommendation: recId,
        selectedAt: new Date(),
        selectedBy,
        selectionRank: index + 1
      }));
      
      updateData[`selectedRecommendations.${category}`] = selectedRecs;
      selectionSummary[category] = recommendationIds.length;
      
      // Update recommendation selection status
      await Recommendation.updateMany(
        { _id: { $in: validRecommendations } },
        { 'selection.isSelected': false, 'selection.selectedAt': null }
      );
      
      await Recommendation.updateMany(
        { _id: { $in: recommendationIds } },
        { 
          'selection.isSelected': true,
          'selection.selectedAt': new Date(),
          'selection.selectedBy': selectedBy
        }
      );
    }

    // Update trip status
    updateData.status = 'user_selecting';
    updateData.updatedAt = new Date();

    const updatedTrip = await Trip.findOneAndUpdate(
      { tripId },
      updateData,
      { new: true }
    ).populate('selectedRecommendations.flight.recommendation')
     .populate('selectedRecommendations.accommodation.recommendation')
     .populate('selectedRecommendations.activity.recommendation')
     .populate('selectedRecommendations.restaurant.recommendation')
     .populate('selectedRecommendations.transportation.recommendation');

    res.json(formatSuccess(
      {
        tripId: updatedTrip.tripId,
        status: updatedTrip.status,
        selectionSummary,
        selectedRecommendations: updatedTrip.selectedRecommendations,
        totalSelected: Object.values(selectionSummary).reduce((sum, count) => sum + count, 0)
      },
      'Trip selections updated successfully'
    ));

  } catch (error) {
    log.error('Selection update error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to update trip selections'
    });
  }
};

// Detailed agent execution status

// Helper method to generate execution timeline
export const generateExecutionTimeline = (execution) => {
  const timeline = [];
  const agentNames = ['flight', 'accommodation', 'activity', 'restaurant'];
  
  if (execution.startedAt) {
    timeline.push({
      event: 'execution_started',
      timestamp: execution.startedAt,
      message: 'Trip planning execution started'
    });
  }
  
  for (const agentName of agentNames) {
    const agent = execution.agents[agentName];
    
    if (agent.startedAt) {
      timeline.push({
        event: 'agent_started',
        agent: agentName,
        timestamp: agent.startedAt,
        message: `${agentName} agent started`
      });
    }
    
    if (agent.completedAt) {
      timeline.push({
        event: agent.status === 'completed' ? 'agent_completed' : 'agent_failed',
        agent: agentName,
        timestamp: agent.completedAt,
        message: `${agentName} agent ${agent.status}`,
        details: {
          duration: agent.duration,
          recommendationCount: agent.recommendationCount,
          confidence: agent.confidence
        }
      });
    }
  }
  
  if (execution.completedAt) {
    timeline.push({
      event: 'execution_completed',
      timestamp: execution.completedAt,
      message: 'Trip planning execution completed'
    });
  }
  
  return timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

// Helper function to execute individual agents independently
async function executeAgentIndependently(tripId, agentName, trip) {
  const agentMap = {
    flight: FlightAgent,
    accommodation: AccommodationAgent,
    activity: ActivityAgent,
    restaurant: RestaurantAgent
  };

  const AgentClass = agentMap[agentName];
  if (!AgentClass) {
    log.error(`No agent class found for: ${agentName}`);
    return;
  }

  try {
    log.info(`Starting independent execution of ${agentName} agent for trip ${tripId}`);

    // Update agent status to running
    await Trip.findByIdAndUpdate(tripId, {
      [`agentExecution.agents.${agentName}.status`]: 'running',
      [`agentExecution.agents.${agentName}.startedAt`]: new Date(),
      [`agentExecution.agents.${agentName}.errors`]: []
    });

    // Build criteria from trip data
    const criteria = {
      destination: trip.destination.name,
      destinationCountry: trip.destination.country,
      destinationPlaceId: trip.destination.placeId,
      origin: trip.origin.name,
      departureDate: trip.dates.departureDate.toISOString().split('T')[0],
      returnDate: trip.dates.returnDate ? trip.dates.returnDate.toISOString().split('T')[0] : null,
      travelers: trip.travelers.count,
      preferences: {
        interests: trip.preferences.interests || [],
        accommodation: trip.preferences.accommodation || {},
        transportation: trip.preferences.transportation || {},
        dining: trip.preferences.dining || {}
      }
    };

    // Create and execute agent
    const agent = new AgentClass();
    const result = await agent.search(criteria);

    log.info(`${agentName} agent completed with ${result.recommendations?.length || 0} recommendations`);

    // Store recommendations in database
    const savedRecommendations = [];
    if (result.recommendations && Array.isArray(result.recommendations)) {
      for (const rec of result.recommendations) {
        const recommendation = new Recommendation({
          tripId: tripId,
          type: agentName,
          ...rec
        });
        const saved = await recommendation.save();
        savedRecommendations.push(saved._id);
      }
    }

    // Update trip with recommendations
    await Trip.findByIdAndUpdate(tripId, {
      [`recommendations.${agentName}`]: savedRecommendations,
      [`agentExecution.agents.${agentName}.status`]: 'completed',
      [`agentExecution.agents.${agentName}.completedAt`]: new Date(),
      [`agentExecution.agents.${agentName}.recommendationCount`]: savedRecommendations.length,
      [`agentExecution.agents.${agentName}.confidence`]: result.confidence || 0
    });

    log.info(`✅ ${agentName} agent completed successfully`);

  } catch (error) {
    log.error(`${agentName} agent failed: ${error.message}`, { stack: error.stack });

    // Mark agent as failed
    await Trip.findByIdAndUpdate(tripId, {
      [`agentExecution.agents.${agentName}.status`]: 'failed',
      [`agentExecution.agents.${agentName}.completedAt`]: new Date(),
      [`agentExecution.agents.${agentName}.errors`]: [{
        message: error.message,
        timestamp: new Date()
      }]
    });
  }
}
