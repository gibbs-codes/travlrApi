import { TripOrchestrator } from '../agents/tripOrchestrator.js';
import { Trip, Recommendation } from '../models/index.js';
import databaseService from '../services/database.js';
import { formatSuccess } from '../middleware/validation.js';


export const getTripById = async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const trip = await Trip.findOne({ tripId })
      .populate('recommendations.flight')
      .populate('recommendations.accommodation')
      .populate('recommendations.activity')
      .populate('recommendations.restaurant')
      .populate('recommendations.transportation')
      .populate('selectedRecommendations.flight.recommendation')
      .populate('selectedRecommendations.accommodation.recommendation')
      .populate('selectedRecommendations.activity.recommendation')
      .populate('selectedRecommendations.restaurant.recommendation')
      .populate('selectedRecommendations.transportation.recommendation');

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found',
        message: `Trip with ID ${tripId} does not exist`
      });
    }

    res.json({
      success: true,
      data: trip,
      message: 'Trip retrieved successfully'
    });

  } catch (error) {
    console.error('Get trip error:', error);
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
    console.error('Get trip status error:', error);
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
      budget = {},
      preferences = {},
      interests = ['cultural', 'food'],
      createdBy = 'anonymous',
      triggerOrchestrator = true
    } = req.body;

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
        budget: {
          total: budget.total,
          currency: budget.currency || 'USD',
          breakdown: budget
        },
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
          cuisinePreferences: preferences.cuisines || [],
          priceRange: preferences.diningBudget || 'mixed'
        },
        accessibility: preferences.accessibility || {}
      },
      collaboration: {
        createdBy,
        collaborators: [],
        isPublic: preferences.isPublic || false
      },
      status: triggerOrchestrator ? 'planning' : 'draft',
      agentExecution: {
        status: triggerOrchestrator ? 'pending' : 'not_started',
        agents: {
          flight: { status: 'pending' },
          accommodation: { status: 'pending' },
          activity: { status: 'pending' },
          restaurant: { status: 'pending' },
          transportation: { status: 'pending' }
        }
      }
    };

    const trip = await Trip.create(tripData);
    console.log(`Created trip ${trip.tripId} for ${destination}`);

    // Response with trip info
    const responseData = {
      tripId: trip.tripId,
      status: trip.status,
      title: trip.title,
      destination: trip.destination.name,
      origin: trip.origin.name,
      dates: trip.dates,
      travelers: trip.travelers,
      agentExecution: {
        status: trip.agentExecution.status,
        agents: trip.agentExecution.agents
      }
    };

    res.status(201).json(formatSuccess(
      responseData,
      triggerOrchestrator 
        ? 'Trip created successfully, planning in progress'
        : 'Trip draft created successfully'
    ));

    // Execute orchestrator asynchronously if requested
    if (triggerOrchestrator) {
      executeOrchestratorAsync(trip._id, {
        destination, origin, departureDate, returnDate,
        travelers: travelerInfo.count, budget, preferences, interests
      });
    }

  } catch (error) {
    console.error('Trip creation error:', error);
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
    console.error('Selection update error:', error);
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
      ['flight', 'accommodation', 'activity', 'restaurant', 'transportation'];
    
    const invalidAgents = agentsToRerun.filter(agent => 
      !['flight', 'accommodation', 'activity', 'restaurant', 'transportation'].includes(agent)
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
      budget: trip.preferences.budget?.breakdown || {},
      preferences: {
        accommodationType: trip.preferences.accommodation?.type,
        minHotelRating: trip.preferences.accommodation?.minRating,
        flightClass: trip.preferences.transportation?.flightClass,
        nonStopFlights: trip.preferences.transportation?.preferNonStop,
        cuisines: trip.preferences.dining?.cuisinePreferences,
        diningBudget: trip.preferences.dining?.priceRange
      },
      interests: trip.preferences.interests
    };

    executeOrchestratorAsync(trip._id, tripRequest);

  } catch (error) {
    console.error('Agent rerun error:', error);
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
  const agentNames = ['flight', 'accommodation', 'activity', 'restaurant', 'transportation'];
  
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

