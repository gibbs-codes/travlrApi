import { TripOrchestrator } from '../agents/tripOrchestrator.js';
import { Trip, Recommendation } from '../models/index.js';
import databaseService from '../services/database.js';
import { formatSuccess } from '../middleware/validation.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'TripController' });

// Helper function to execute orchestrator asynchronously
async function executeOrchestratorAsync(tripId, tripRequest) {
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
    res.json({
      success: true,
      data: trip,
      message: 'Trip metadata retrieved successfully'
    });

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

    res.json({
      success: true,
      data: {
        tripId: trip.tripId,
        status: trip.status,
        execution: trip.agentExecution,
        recommendationCounts,
        lastUpdated: trip.updatedAt
      },
      message: 'Trip status retrieved successfully'
    });

  } catch (error) {
    log.error('Get trip status error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error retrieving trip status'
    });
  }
};



// New enhanced trip creation endpoint
export const createTrip = async (req, res) => {
  try {
    const {
      title,
      destination,
      origin,
      departureDate,
      returnDate,
      travelers = 1,
      preferences = {},
      interests = ['cultural', 'food'],
      createdBy = 'anonymous',
      collaboration,
      triggerOrchestrator = true,
      agentsToRun
    } = req.body;

    // Validate and set agentsToRun
    const VALID_AGENTS = ['flight', 'accommodation', 'activity', 'restaurant'];
    let selectedAgents = agentsToRun;

    if (selectedAgents) {
      // Validate that it's an array
      if (!Array.isArray(selectedAgents)) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'agentsToRun must be an array'
        });
      }

      // Validate that all requested agents are valid
      const invalidAgents = selectedAgents.filter(agent => !VALID_AGENTS.includes(agent));
      if (invalidAgents.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Invalid agent names: ${invalidAgents.join(', ')}. Valid agents are: ${VALID_AGENTS.join(', ')}`
        });
      }

      // Remove duplicates
      selectedAgents = [...new Set(selectedAgents)];
    } else {
      // Default to all agents if not specified
      selectedAgents = VALID_AGENTS;
    }

    // Handle collaboration data - support both direct createdBy and collaboration object
    const collaborationData = collaboration || {};
    const tripCreatedBy = collaborationData.createdBy || createdBy;

    // Ensure database connection
    await databaseService.connect();

    // Parse traveler information
    const travelerInfo = typeof travelers === 'number' 
      ? { count: travelers, adults: travelers, children: 0, infants: 0 }
      : travelers;

    // Create Trip document
    const tripData = {
      title: title || `Trip to ${destination}`,
      destination: {
        name: destination,
        country: preferences.destinationCountry,
        coordinates: preferences.destinationCoordinates,
        placeId: preferences.destinationPlaceId
      },
      origin: {
        name: origin,
        country: preferences.originCountry,
        coordinates: preferences.originCoordinates,
        airportCode: preferences.originAirportCode
      },
      dates: {
        departureDate: new Date(departureDate),
        returnDate: returnDate ? new Date(returnDate) : null
      },
      travelers: travelerInfo,
      preferences: {
        interests,
        accommodation: {
          type: preferences.accommodationType || 'any',
          minRating: preferences.minHotelRating || 3,
          requiredAmenities: preferences.requiredAmenities || []
        },
        transportation: {
          flightClass: preferences.flightClass || 'economy',
          preferNonStop: preferences.preferNonStop || false,
          localTransport: preferences.localTransport || 'mixed'
        },
        dining: {
          dietaryRestrictions: preferences.dietaryRestrictions || [],
          cuisinePreferences: preferences.cuisines || []
        },
        accessibility: preferences.accessibility || {}
      },
      collaboration: {
        createdBy: tripCreatedBy,
        collaborators: collaborationData.collaborators || [],
        isPublic: preferences.isPublic || false
      },
      status: triggerOrchestrator ? 'planning' : 'draft',
      agentExecution: {
        status: 'pending',
        agents: VALID_AGENTS.reduce((acc, agent) => {
          // Initialize ALL 4 agents (flight, accommodation, activity, restaurant)
          // If triggerOrchestrator is true:
          //   - Selected agents get 'pending' status
          //   - Unselected agents get 'skipped' status
          // If triggerOrchestrator is false (draft mode):
          //   - All agents get 'pending' status for future execution
          const isSelected = selectedAgents.includes(agent);
          acc[agent] = {
            status: triggerOrchestrator
              ? (isSelected ? 'pending' : 'skipped')
              : 'pending',
            recommendationCount: 0,
            errors: []
          };
          return acc;
        }, {})
      }
    };

    const trip = await Trip.create(tripData);
    log.info(`✅ Created trip ${trip.tripId} for ${destination}`);
    log.info(`🎯 Agents to run: ${selectedAgents.join(', ')}`);
    if (selectedAgents.length < VALID_AGENTS.length) {
      const skippedAgents = VALID_AGENTS.filter(a => !selectedAgents.includes(a));
      log.info(`⏭️  Skipped agents: ${skippedAgents.join(', ')}`);
    }

    // Calculate estimated completion time (assuming 30-60 seconds per agent, 5 agents)
    const estimatedSeconds = triggerOrchestrator ? 180 : 0; // 3 minutes for all agents
    const estimatedCompletion = triggerOrchestrator
      ? new Date(Date.now() + estimatedSeconds * 1000).toISOString()
      : null;

    // Build simplified response - no recommendations included
    const responseData = {
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
        duration: trip.dates.duration || null
      },
      travelers: {
        count: trip.travelers.count,
        adults: trip.travelers.adults,
        children: trip.travelers.children,
        infants: trip.travelers.infants
      },
      agentExecution: {
        status: trip.agentExecution.status,
        estimatedCompletion
      }
    };

    res.status(201).json(formatSuccess(
      responseData,
      triggerOrchestrator
        ? 'Trip created successfully. Generating recommendations...'
        : 'Trip draft created successfully'
    ));

    // Execute orchestrator asynchronously if requested (don't await to avoid blocking response)
    if (triggerOrchestrator) {
      executeOrchestratorAsync(trip._id, {
        destination, origin, departureDate, returnDate,
        travelers: travelerInfo.count, preferences, interests,
        agentsToRun: selectedAgents
      }).catch(error => {
        log.error(`Background orchestrator execution failed for trip ${trip._id}: ${error.message}`, { stack: error.stack });
      });
    }

  } catch (error) {
    log.error('Trip creation error', { error: error.message, stack: error.stack });
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
    if (trip.status === 'draft' || trip.agentExecution.status === 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Trip not ready for selections',
        message: 'Please wait for recommendations to be generated before making selections'
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

// Enhanced agent rerun endpoint
export const rerunAgents = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { agents = [], reason = 'User requested rerun', resetSelections = false } = req.body;
    
    const trip = await Trip.findOne({ tripId });
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found',
        message: `Trip with ID ${tripId} does not exist`
      });
    }

    if (trip.agentExecution.status === 'in_progress') {
      return res.status(409).json({
        success: false,
        error: 'Execution in progress',
        message: 'Cannot rerun agents while execution is currently in progress'
      });
    }

    // Determine agents to rerun
    const agentsToRerun = agents.length > 0 ? agents :
      ['flight', 'accommodation', 'activity', 'restaurant'];

    const invalidAgents = agentsToRerun.filter(agent =>
      !['flight', 'accommodation', 'activity', 'restaurant'].includes(agent)
    );
    
    if (invalidAgents.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agents specified',
        details: invalidAgents,
        message: 'Some specified agents are not valid'
      });
    }

    // Reset agent statuses
    const updateData = {
      'agentExecution.status': 'pending',
      'agentExecution.startedAt': null,
      'agentExecution.completedAt': null,
      status: 'planning'
    };

    for (const agentName of agentsToRerun) {
      updateData[`agentExecution.agents.${agentName}.status`] = 'pending';
      updateData[`agentExecution.agents.${agentName}.startedAt`] = null;
      updateData[`agentExecution.agents.${agentName}.completedAt`] = null;
      updateData[`agentExecution.agents.${agentName}.errors`] = [];
    }

    await Trip.findByIdAndUpdate(trip._id, updateData);

    // Remove existing recommendations for retriggered agents
    const removedRecommendations = {};
    for (const agentName of agentsToRerun) {
      if (trip.recommendations[agentName]?.length > 0) {
        await Recommendation.deleteMany({ _id: { $in: trip.recommendations[agentName] } });
        removedRecommendations[`recommendations.${agentName}`] = [];
        
        if (resetSelections) {
          removedRecommendations[`selectedRecommendations.${agentName}`] = [];
        }
      }
    }
    
    if (Object.keys(removedRecommendations).length > 0) {
      await Trip.findByIdAndUpdate(trip._id, removedRecommendations);
    }

    log.info(`🔄 Re-running agents: ${agentsToRerun.join(', ')}`);

    res.json(formatSuccess(
      {
        tripId: trip.tripId,
        retriggeredAgents: agentsToRerun,
        status: 'planning',
        reason,
        resetSelections,
        estimatedDuration: `${agentsToRerun.length * 30}-${agentsToRerun.length * 60} seconds`
      },
      'Agents rerun initiated successfully'
    ));

    // Execute orchestrator for retriggered agents asynchronously
    const tripRequest = {
      destination: trip.destination.name,
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
      interests: trip.preferences.interests,
      agentsToRun: agentsToRerun
    };

    executeOrchestratorAsync(trip._id, tripRequest).catch(error => {
      log.error(`Background orchestrator rerun failed for trip ${trip._id}: ${error.message}`, { stack: error.stack });
    });

  } catch (error) {
    log.error('Agent rerun error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to rerun agents'
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

/**
 * Start specific agents for an existing trip
 * POST /api/trip/:tripId/agents/start
 */
export const startAgents = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { agents, reason } = req.body;

    // Validate request body
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'agents field is required and must be a non-empty array'
      });
    }

    // Validate agent names
    const VALID_AGENTS = ['flight', 'accommodation', 'activity', 'restaurant'];
    const invalidAgents = agents.filter(agent => !VALID_AGENTS.includes(agent));
    if (invalidAgents.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: `Invalid agent names: ${invalidAgents.join(', ')}. Valid agents are: ${VALID_AGENTS.join(', ')}`
      });
    }

    // Ensure database connection
    await databaseService.connect();

    // Find the trip
    const trip = await Trip.findOne({ tripId });
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: `Trip with ID ${tripId} does not exist`
      });
    }

    // Check if agents are currently executing
    const executionStatus = trip.agentExecution?.status;
    if (executionStatus === 'in_progress') {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Trip agents are already executing. Please wait for current execution to complete.'
      });
    }

    // Check each requested agent's status
    const agentStatuses = {};
    const completedAgents = [];
    const skippedAgents = [];
    const pendingAgents = [];

    for (const agentName of agents) {
      const agentStatus = trip.agentExecution?.agents?.[agentName]?.status;
      agentStatuses[agentName] = agentStatus;

      if (agentStatus === 'completed') {
        completedAgents.push(agentName);
      } else if (agentStatus === 'skipped' || !agentStatus) {
        skippedAgents.push(agentName);
      } else if (agentStatus === 'pending' || agentStatus === 'running') {
        pendingAgents.push(agentName);
      }
    }

    // Reject if any requested agents are already completed
    if (completedAgents.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: `The following agents have already completed: ${completedAgents.join(', ')}. Cannot restart completed agents.`
      });
    }

    // Update agent statuses from skipped/undefined to pending
    const updateFields = {};
    for (const agentName of agents) {
      updateFields[`agentExecution.agents.${agentName}.status`] = 'pending';
      updateFields[`agentExecution.agents.${agentName}.updatedAt`] = new Date();
      if (reason) {
        updateFields[`agentExecution.agents.${agentName}.restartReason`] = reason;
      }
    }

    // Update trip status and agent statuses
    updateFields['status'] = 'planning';
    updateFields['agentExecution.status'] = 'pending';

    await Trip.findOneAndUpdate(
      { tripId },
      { $set: updateFields },
      { new: true }
    );

    log.info(`🎯 Starting agents [${agents.join(', ')}] for trip ${tripId}`);
    if (reason) {
      log.info(`   Reason: ${reason}`);
    }

    // Build trip request object for orchestrator
    const tripRequest = {
      destination: trip.destination.name,
      origin: trip.origin.name,
      departureDate: trip.dates.departureDate,
      returnDate: trip.dates.returnDate,
      travelers: trip.travelers.count,
      preferences: trip.preferences || {},
      interests: trip.preferences?.interests || [],
      agentsToRun: agents
    };

    // Execute orchestrator asynchronously (don't await)
    executeOrchestratorAsync(trip._id, tripRequest).catch(error => {
      log.error(`Background orchestrator execution failed for trip ${trip._id}: ${error.message}`, { stack: error.stack });
    });

    // Return success response immediately
    res.status(200).json({
      success: true,
      data: {
        tripId: trip.tripId,
        startedAgents: agents,
        status: 'planning',
        message: 'Agents started successfully'
      }
    });

  } catch (error) {
    log.error('Start agents error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error starting agents'
    });
  }
};
