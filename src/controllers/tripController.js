// src/controllers/tripController.js (fixed validation)
import { TripOrchestrator } from '../agents/tripOrchestrator.js';
import { FlightAgent } from '../agents/flightAgent.js';

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
      interests = ['cultural', 'food']
    } = req.body;

    // Check which mode we're in
    const testFlightOnly = req.query.flightOnly === 'true';
    const testAccommodationOnly = req.query.accommodationOnly === 'true';
    
    if (testFlightOnly) {
      // Validate flight-specific fields
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
      // Validate accommodation-specific fields
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
        checkOutDate: returnDate || departureDate, // Use departureDate as fallback if no returnDate
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

    // Full trip planning - validate all required fields
    if (!destination || !origin || !departureDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields for full trip planning: destination, origin, and departureDate are required'
      });
    }

    // Full trip planning (existing orchestrator logic)
    const aiConfig = {
      provider: process.env.AI_PROVIDER || 'openai',
      apiKey: process.env.OPENAI_API_KEY
    };

    const orchestrator = new TripOrchestrator(aiConfig);
    const tripRequest = {
      destination, origin, departureDate, returnDate,
      travelers, budget, preferences, interests
    };

    const result = await orchestrator.execute(tripRequest);

    res.json({
      success: result.success,
      data: result.data,
      message: result.success ? 'Trip planned successfully' : 'Trip planning failed'
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