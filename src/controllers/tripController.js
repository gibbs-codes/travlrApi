import { TripOrchestrator } from '../agents/tripOrchestrator.js';

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

    // Validate required fields
    if (!destination || !origin || !departureDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: destination, origin, and departureDate are required'
      });
    }

    // Initialize orchestrator with AI config
    const aiConfig = {
      provider: process.env.AI_PROVIDER || 'openai',
      model: process.env.AI_MODEL || 'gpt-3.5-turbo'
    };

    const orchestrator = new TripOrchestrator(aiConfig);

    // Execute trip planning
    const tripRequest = {
      destination,
      origin,
      departureDate,
      returnDate: returnDate || departureDate, // Same day trip if no return date
      travelers,
      budget,
      preferences,
      interests
    };

    const result = await orchestrator.execute(tripRequest);

    if (result.success) {
      res.json({
        success: true,
        message: 'Trip planned successfully',
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to plan trip'
      });
    }

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