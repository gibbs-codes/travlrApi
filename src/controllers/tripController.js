import { TripOrchestrator } from '../agents/tripOrchestrator.js';
import { FlightAgent } from '../agents/flightAgent.js';
import { Trip, Recommendation } from '../models/index.js';
import databaseService from '../services/database.js';

export const planTrip = async (req, res) => {
  try {
    const {
      destination,
      origin,
      departureDate,
      returnDate,
      travelers = 1,
      budget = {},
      preferences = {},
      interests = ['cultural', 'food'],
      title,
      createdBy = 'anonymous'
    } = req.body;

    // Check which mode we're in - maintain backward compatibility
    const testFlightOnly = req.query.flightOnly === 'true';
    const testAccommodationOnly = req.query.accommodationOnly === 'true';
    
    if (testFlightOnly) {
      // Maintain existing flight-only logic
      if (!destination || !origin || !departureDate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields for flight search: destination, origin, and departureDate are required'
        });
      }

      const flightAgent = new FlightAgent({
        provider: process.env.AI_PROVIDER || 'openai',
        apiKey: process.env.OPENAI_API_KEY
      });

      const criteria = {
        origin,
        destination,
        departureDate,
        returnDate,
        travelers,
        maxPrice: budget.flight,
        preferNonStop: preferences.nonStopFlights,
        preferredClass: preferences.flightClass
      };

      const result = await flightAgent.execute({ criteria });
      
      return res.json({
        success: result.success,
        data: result.data,
        message: result.success ? 'Flight search completed' : 'Flight search failed',
        debug: { agentUsed: 'FlightAgent', criteria }
      });
    }

    if (testAccommodationOnly) {
      // Maintain existing accommodation-only logic
      if (!destination || !departureDate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields for accommodation search: destination and departureDate (as checkInDate) are required'
        });
      }

      const { AccommodationAgent } = await import('../agents/accommodationAgent.js');
      const accommodationAgent = new AccommodationAgent({
        provider: process.env.AI_PROVIDER || 'openai',
        apiKey: process.env.OPENAI_API_KEY
      });

      const criteria = {
        destination,
        checkInDate: departureDate,
        checkOutDate: returnDate || departureDate,
        guests: travelers,
        maxPrice: budget.accommodation,
        minRating: preferences.minHotelRating,
        accommodationType: preferences.accommodationType,
        requiredAmenities: preferences.requiredAmenities
      };

      const result = await accommodationAgent.execute({ criteria });
      
      return res.json({
        success: result.success,
        data: result.data,
        message: result.success ? 'Accommodation search completed' : 'Accommodation search failed',
        debug: { agentUsed: 'AccommodationAgent', criteria }
      });
    }

    // Full trip planning with database storage
    if (!destination || !origin || !departureDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: destination, origin, and departureDate are required'
      });
    }

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
          preferNonStop: preferences.nonStopFlights || false,
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
        isPublic: false
      },
      status: 'planning',
      agentExecution: {
        status: 'pending',
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

    // Return trip info immediately
    res.json({
      success: true,
      data: {
        tripId: trip.tripId,
        status: trip.status,
        title: trip.title,
        destination: trip.destination.name,
        dates: trip.dates
      },
      message: 'Trip created successfully, planning in progress'
    });

    // Execute orchestrator asynchronously
    executeOrchestratorAsync(trip._id, {
      destination, origin, departureDate, returnDate,
      travelers: travelerInfo.count, budget, preferences, interests
    });

  } catch (error) {
    console.error('Trip planning error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error during trip planning'
    });
  }
};

// Async orchestrator execution function
async function executeOrchestratorAsync(tripId, tripRequest) {
  try {
    const trip = await Trip.findById(tripId);
    if (!trip) {
      console.error(`Trip ${tripId} not found for orchestrator execution`);
      return;
    }

    // Update trip status to in_progress
    await Trip.findByIdAndUpdate(tripId, {
      'agentExecution.status': 'in_progress',
      'agentExecution.startedAt': new Date(),
      status: 'planning'
    });

    const aiConfig = {
      provider: process.env.AI_PROVIDER || 'openai',
      apiKey: process.env.OPENAI_API_KEY
    };

    const orchestrator = new TripOrchestrator(aiConfig);
    const result = await orchestrator.execute(tripRequest);

    if (result.success) {
      // Store recommendations in database
      const recommendations = {};\n      const agentResults = result.data.metadata?.agentResults || [];\n      \n      for (const agentResult of agentResults) {\n        if (agentResult.success && agentResult.data?.content?.recommendations) {\n          const agentType = agentResult.name;\n          const recs = [];\n          \n          for (const rec of agentResult.data.content.recommendations) {\n            const recommendation = await Recommendation.create({\n              agentType,\n              name: rec.name || rec.title || 'Unknown',\n              description: rec.description || rec.summary || '',\n              price: {\n                amount: rec.price || rec.cost || 0,\n                currency: 'USD',\n                priceType: agentType === 'flight' ? 'per_person' : \n                          agentType === 'accommodation' ? 'per_night' : 'per_group'\n              },\n              rating: {\n                score: rec.rating || rec.score || 0,\n                reviewCount: rec.reviewCount || 0,\n                source: rec.source || agentType\n              },\n              location: {\n                address: rec.address || rec.location,\n                city: tripRequest.destination,\n                coordinates: rec.coordinates\n              },\n              confidence: {\n                score: rec.confidence || 0.8,\n                reasoning: rec.reasoning || 'Generated by AI agent'\n              },\n              agentMetadata: rec,\n              externalIds: {\n                providerId: rec.id || rec.providerId\n              },\n              images: rec.images || []\n            });\n            recs.push(recommendation._id);\n          }\n          \n          recommendations[agentType] = recs;\n        }\n      }\n\n      // Update trip with results\n      await Trip.findByIdAndUpdate(tripId, {\n        recommendations,\n        'agentExecution.status': 'completed',\n        'agentExecution.completedAt': new Date(),\n        'agentExecution.totalDuration': Date.now() - trip.agentExecution.startedAt?.getTime(),\n        'agentExecution.metadata': result.data.metadata,\n        status: 'recommendations_ready'\n      });\n\n      console.log(`Trip ${trip.tripId} planning completed successfully`);\n    } else {\n      // Handle failure\n      await Trip.findByIdAndUpdate(tripId, {\n        'agentExecution.status': 'failed',\n        'agentExecution.completedAt': new Date(),\n        'agentExecution.metadata.error': result.error,\n        status: 'draft'\n      });\n      \n      console.error(`Trip ${trip.tripId} planning failed:`, result.error);\n    }\n  } catch (error) {\n    console.error(`Error executing orchestrator for trip ${tripId}:`, error);\n    \n    // Update trip with error status\n    await Trip.findByIdAndUpdate(tripId, {\n      'agentExecution.status': 'failed',\n      'agentExecution.completedAt': new Date(),\n      'agentExecution.metadata.error': error.message,\n      status: 'draft'\n    });\n  }\n}\n\nexport const getTripById = async (req, res) => {\n  try {\n    const { tripId } = req.params;\n    \n    const trip = await Trip.findOne({ tripId })\n      .populate('recommendations.flight')\n      .populate('recommendations.accommodation')\n      .populate('recommendations.activity')\n      .populate('recommendations.restaurant')\n      .populate('recommendations.transportation')\n      .populate('selectedRecommendations.flight.recommendation')\n      .populate('selectedRecommendations.accommodation.recommendation')\n      .populate('selectedRecommendations.activity.recommendation')\n      .populate('selectedRecommendations.restaurant.recommendation')\n      .populate('selectedRecommendations.transportation.recommendation');\n\n    if (!trip) {\n      return res.status(404).json({\n        success: false,\n        error: 'Trip not found',\n        message: `Trip with ID ${tripId} does not exist`\n      });\n    }\n\n    res.json({\n      success: true,\n      data: trip,\n      message: 'Trip retrieved successfully'\n    });\n\n  } catch (error) {\n    console.error('Get trip error:', error);\n    res.status(500).json({\n      success: false,\n      error: error.message,\n      message: 'Error retrieving trip'\n    });\n  }\n};\n\nexport const updateTripSelections = async (req, res) => {\n  try {\n    const { tripId } = req.params;\n    const { selections, selectedBy = 'user' } = req.body;\n\n    const trip = await Trip.findOne({ tripId });\n    if (!trip) {\n      return res.status(404).json({\n        success: false,\n        error: 'Trip not found'\n      });\n    }\n\n    // Validate selections format\n    const validCategories = ['flight', 'accommodation', 'activity', 'restaurant', 'transportation'];\n    const updateData = {};\n    \n    for (const [category, recommendationIds] of Object.entries(selections)) {\n      if (!validCategories.includes(category)) {\n        return res.status(400).json({\n          success: false,\n          error: `Invalid category: ${category}`\n        });\n      }\n      \n      if (!Array.isArray(recommendationIds)) {\n        return res.status(400).json({\n          success: false,\n          error: `Selections for ${category} must be an array`\n        });\n      }\n\n      // Verify recommendations exist and belong to this trip\n      const validRecommendations = trip.recommendations[category] || [];\n      const selectedRecs = recommendationIds.map((recId, index) => ({\n        recommendation: recId,\n        selectedAt: new Date(),\n        selectedBy\n      }));\n      \n      updateData[`selectedRecommendations.${category}`] = selectedRecs;\n      \n      // Update recommendation selection status\n      await Recommendation.updateMany(\n        { _id: { $in: validRecommendations } },\n        { 'selection.isSelected': false }\n      );\n      \n      await Recommendation.updateMany(\n        { _id: { $in: recommendationIds } },\n        { \n          'selection.isSelected': true,\n          'selection.selectedAt': new Date(),\n          'selection.selectedBy': selectedBy\n        }\n      );\n    }\n\n    // Update trip status\n    updateData.status = 'user_selecting';\n    updateData.updatedAt = new Date();\n\n    const updatedTrip = await Trip.findOneAndUpdate(\n      { tripId },\n      updateData,\n      { new: true }\n    ).populate('selectedRecommendations.flight.recommendation')\n     .populate('selectedRecommendations.accommodation.recommendation')\n     .populate('selectedRecommendations.activity.recommendation')\n     .populate('selectedRecommendations.restaurant.recommendation')\n     .populate('selectedRecommendations.transportation.recommendation');\n\n    res.json({\n      success: true,\n      data: {\n        tripId: updatedTrip.tripId,\n        selectedRecommendations: updatedTrip.selectedRecommendations,\n        status: updatedTrip.status\n      },\n      message: 'Trip selections updated successfully'\n    });\n\n  } catch (error) {\n    console.error('Update selections error:', error);\n    res.status(500).json({\n      success: false,\n      error: error.message,\n      message: 'Error updating trip selections'\n    });\n  }\n};\n\nexport const getTripStatus = async (req, res) => {\n  try {\n    const { tripId } = req.params;\n    \n    const trip = await Trip.findOne({ tripId }, {\n      tripId: 1,\n      status: 1,\n      agentExecution: 1,\n      'recommendations.flight': 1,\n      'recommendations.accommodation': 1,\n      'recommendations.activity': 1,\n      'recommendations.restaurant': 1,\n      'recommendations.transportation': 1,\n      updatedAt: 1\n    });\n\n    if (!trip) {\n      return res.status(404).json({\n        success: false,\n        error: 'Trip not found'\n      });\n    }\n\n    const recommendationCounts = {\n      flight: trip.recommendations.flight?.length || 0,\n      accommodation: trip.recommendations.accommodation?.length || 0,\n      activity: trip.recommendations.activity?.length || 0,\n      restaurant: trip.recommendations.restaurant?.length || 0,\n      transportation: trip.recommendations.transportation?.length || 0\n    };\n\n    res.json({\n      success: true,\n      data: {\n        tripId: trip.tripId,\n        status: trip.status,\n        execution: trip.agentExecution,\n        recommendationCounts,\n        lastUpdated: trip.updatedAt\n      },\n      message: 'Trip status retrieved successfully'\n    });\n\n  } catch (error) {\n    console.error('Get trip status error:', error);\n    res.status(500).json({\n      success: false,\n      error: error.message,\n      message: 'Error retrieving trip status'\n    });\n  }\n};\n\nexport const retriggerAgents = async (req, res) => {\n  try {\n    const { tripId } = req.params;\n    const { agents = [], reason = 'User requested retrigger' } = req.body;\n    \n    const trip = await Trip.findOne({ tripId });\n    if (!trip) {\n      return res.status(404).json({\n        success: false,\n        error: 'Trip not found'\n      });\n    }\n\n    if (trip.agentExecution.status === 'in_progress') {\n      return res.status(400).json({\n        success: false,\n        error: 'Cannot retrigger agents while execution is in progress'\n      });\n    }\n\n    // Reset specific agents or all if none specified\n    const agentsToRetrigger = agents.length > 0 ? agents : ['flight', 'accommodation', 'activity', 'restaurant', 'transportation'];\n    const updateData = {\n      'agentExecution.status': 'pending',\n      status: 'planning'\n    };\n\n    for (const agentName of agentsToRetrigger) {\n      updateData[`agentExecution.agents.${agentName}.status`] = 'pending';\n      updateData[`agentExecution.agents.${agentName}.errors`] = [];\n    }\n\n    await Trip.findByIdAndUpdate(trip._id, updateData);\n\n    // Remove existing recommendations for retriggered agents\n    const removeRecommendations = {};\n    for (const agentName of agentsToRetrigger) {\n      if (trip.recommendations[agentName]?.length > 0) {\n        await Recommendation.deleteMany({ _id: { $in: trip.recommendations[agentName] } });\n        removeRecommendations[`recommendations.${agentName}`] = [];\n        removeRecommendations[`selectedRecommendations.${agentName}`] = [];\n      }\n    }\n    \n    await Trip.findByIdAndUpdate(trip._id, removeRecommendations);\n\n    res.json({\n      success: true,\n      data: {\n        tripId: trip.tripId,\n        retriggeredAgents: agentsToRetrigger,\n        status: 'planning'\n      },\n      message: 'Agents retriggered successfully, execution starting'\n    });\n\n    // Execute orchestrator for retriggered agents asynchronously\n    const tripRequest = {\n      destination: trip.destination.name,\n      origin: trip.origin.name,\n      departureDate: trip.dates.departureDate.toISOString().split('T')[0],\n      returnDate: trip.dates.returnDate?.toISOString().split('T')[0],\n      travelers: trip.travelers.count,\n      budget: trip.preferences.budget?.breakdown || {},\n      preferences: {\n        accommodationType: trip.preferences.accommodation?.type,\n        minHotelRating: trip.preferences.accommodation?.minRating,\n        flightClass: trip.preferences.transportation?.flightClass,\n        nonStopFlights: trip.preferences.transportation?.preferNonStop,\n        cuisines: trip.preferences.dining?.cuisinePreferences,\n        diningBudget: trip.preferences.dining?.priceRange\n      },\n      interests: trip.preferences.interests\n    };\n\n    executeOrchestratorAsync(trip._id, tripRequest);\n\n  } catch (error) {\n    console.error('Retrigger agents error:', error);\n    res.status(500).json({\n      success: false,\n      error: error.message,\n      message: 'Error retriggering agents'\n    });\n  }\n};\n\nexport const getUserTrips = async (req, res) => {
  try {
    const { userId = 'anonymous' } = req.query;
    const { status, limit = 10, offset = 0 } = req.query;

    const filter = {
      $or: [
        { 'collaboration.createdBy': userId },
        { 'collaboration.collaborators.userId': userId }
      ]
    };

    if (status) {
      filter.status = status;
    }

    const trips = await Trip.find(filter, {
      tripId: 1,
      title: 1,
      'destination.name': 1,
      'origin.name': 1,
      dates: 1,
      status: 1,
      'travelers.count': 1,
      'collaboration.createdBy': 1,
      createdAt: 1,
      updatedAt: 1
    })
    .sort({ updatedAt: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset));

    const total = await Trip.countDocuments(filter);

    res.json({
      success: true,
      data: {
        trips,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + trips.length) < total
        }
      },
      message: 'User trips retrieved successfully'
    });

  } catch (error) {
    console.error('Get user trips error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error retrieving user trips'
    });
  }
};

export const getAgentStatus = async (_req, res) => {
  try {
    const orchestrator = new TripOrchestrator();
    const agentStatus = orchestrator.getAgentStatus();
    
    res.json({
      success: true,
      data: {
        orchestrator: orchestrator.getStatus(),
        agents: agentStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};