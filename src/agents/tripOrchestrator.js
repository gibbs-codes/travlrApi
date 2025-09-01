import { BaseAgent } from './baseAgent.js';
import { FlightAgent } from './flightAgent.js';
import { AccommodationAgent } from './accommodationAgent.js';
import { ActivityAgent } from './activityAgent.js';
import { RestaurantAgent } from './restaurantAgent.js';
import { TransportationAgent } from './transportationAgent.js';

export class TripOrchestrator extends BaseAgent {
  constructor(aiConfig = {}) {
    super(
      'TripOrchestrator',
      ['trip_planning', 'agent_coordination', 'result_synthesis'],
      aiConfig
    );

    // Initialize specialized agents
    this.agents = {
      flight: new FlightAgent(aiConfig),
      accommodation: new AccommodationAgent(aiConfig),
      activity: new ActivityAgent(aiConfig),
      restaurant: new RestaurantAgent(aiConfig),
      transportation: new TransportationAgent(aiConfig)
    };

    this.tripSchema = {
      tripSummary: {
        destination: '',
        dates: { departure: '', return: '' },
        budget: { total: 0, breakdown: {} },
        confidence: 0
      },
      recommendations: {
        flights: [],
        accommodation: [],
        activities: [],
        restaurants: [],
        transportation: []
      },
      itinerary: [],
      alternatives: [],
      metadata: {
        searchCriteria: {},
        executionTime: '',
        agentResults: {}
      }
    };
  }

  async execute(tripRequest) {
    const startTime = Date.now();
    
    try {
      this.activate();
      console.log(`Starting trip planning for: ${tripRequest.destination}`);

      // Extract and validate trip criteria
      const criteria = this.extractCriteria(tripRequest);
      
      // Execute all agents in parallel
      const agentTasks = await this.executeAgentsInParallel(criteria);
      
      console.log('Agent task results:', JSON.stringify(agentTasks, null, 2));
      
      // Synthesize results into comprehensive trip plan
      const tripPlan = await this.synthesizeTripPlan(agentTasks, criteria);
      
      // Generate final recommendations with AI analysis
      const finalPlan = await this.generateFinalRecommendations(tripPlan, criteria);

      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        data: {
          ...finalPlan,
          metadata: {
            ...finalPlan.metadata,
            executionTime: `${executionTime}ms`,
            agentResults: agentTasks
          }
        },
        executedAt: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        executedAt: new Date().toISOString()
      };
    } finally {
      this.deactivate();
    }
  }

  extractCriteria(tripRequest) {
    return {
      // Flight criteria
      origin: tripRequest.origin,
      destination: tripRequest.destination,
      departureDate: tripRequest.departureDate,
      returnDate: tripRequest.returnDate,
      maxPrice: tripRequest.budget?.flight,
      preferNonStop: tripRequest.preferences?.nonStopFlights,
      preferredClass: tripRequest.preferences?.flightClass,

      // Accommodation criteria
      checkInDate: tripRequest.departureDate,
      checkOutDate: tripRequest.returnDate,
      accommodationType: tripRequest.preferences?.accommodationType,
      minRating: tripRequest.preferences?.minRating || 4.0,
      requiredAmenities: tripRequest.preferences?.amenities,

      // Activity criteria
      categories: tripRequest.interests || ['cultural', 'food'],
      difficulty: tripRequest.preferences?.activityLevel || 'easy',
      duration: tripRequest.preferences?.activityDuration,

      // Restaurant criteria
      cuisines: tripRequest.preferences?.cuisines,
      priceRange: tripRequest.preferences?.diningBudget || '$$',
      features: tripRequest.preferences?.restaurantFeatures,

      // Transportation criteria
      transportTypes: tripRequest.preferences?.transportModes || ['rideshare', 'public'],
      maxCost: tripRequest.budget?.transportation,
      minCapacity: tripRequest.travelers || 1
    };
  }

  async executeAgentsInParallel(criteria) {
    const agentPromises = Object.entries(this.agents).map(async ([name, agent]) => {
      try {
        const result = await agent.execute({ criteria });
        return { name, ...result };
      } catch (error) {
        return {
          name,
          success: false,
          error: error.message,
          executedAt: new Date().toISOString()
        };
      }
    });

    return await Promise.all(agentPromises);
  }

  async synthesizeTripPlan(agentResults, criteria) {
    const plan = { ...this.tripSchema };
    
    // Populate recommendations from each agent
    agentResults.forEach(result => {
      if (result.success && result.data) {
        plan.recommendations[result.name] = result.data.content?.recommendations || [];
      }
    });

    // Calculate budget breakdown
    plan.tripSummary.budget = this.calculateBudgetBreakdown(plan.recommendations);
    plan.tripSummary.destination = criteria.destination;
    plan.tripSummary.dates = {
      departure: criteria.departureDate,
      return: criteria.returnDate
    };

    // Generate basic itinerary
    plan.itinerary = this.generateBasicItinerary(plan.recommendations, criteria);

    return plan;
  }

  async generateFinalRecommendations(tripPlan, criteria) {
    const prompt = `
Analyze this comprehensive trip plan and provide final recommendations with insights:

Trip Details:
- Destination: ${criteria.destination}
- Dates: ${criteria.departureDate} to ${criteria.returnDate}
- Budget Considerations: ${JSON.stringify(criteria.budget || {})}

Agent Recommendations:
${JSON.stringify(tripPlan.recommendations, null, 2)}

Please provide:
1. Top 3 recommendations for each category
2. Overall trip confidence score (0-100)
3. Budget optimization suggestions
4. Alternative options for different preferences
5. Daily itinerary suggestions

Focus on creating a cohesive, practical trip plan.
    `;

    try {
      const aiResponse = await this.generateStructuredResponse(prompt, this.tripSchema);
      
      return {
        ...tripPlan,
        ...aiResponse.content,
        tripSummary: {
          ...tripPlan.tripSummary,
          confidence: aiResponse.content.tripSummary?.confidence || 85
        }
      };
    } catch (error) {
      console.error('AI synthesis failed, returning basic plan:', error.message);
      return tripPlan;
    }
  }

  calculateBudgetBreakdown(recommendations) {
    const breakdown = {};
    let total = 0;

    // Calculate estimated costs from recommendations
    if (recommendations.flight?.length > 0) {
      breakdown.flight = recommendations.flight[0].price || 0;
      total += breakdown.flight;
    }

    if (recommendations.accommodation?.length > 0) {
      const nights = 3; // Default assumption
      breakdown.accommodation = (recommendations.accommodation[0].price || 0) * nights;
      total += breakdown.accommodation;
    }

    if (recommendations.activities?.length > 0) {
      breakdown.activities = recommendations.activities.slice(0, 3)
        .reduce((sum, activity) => sum + (activity.price || 0), 0);
      total += breakdown.activities;
    }

    if (recommendations.restaurants?.length > 0) {
      breakdown.dining = recommendations.restaurants.slice(0, 3)
        .reduce((sum, restaurant) => sum + (restaurant.averageMeal || 0), 0);
      total += breakdown.dining;
    }

    if (recommendations.transportation?.length > 0) {
      breakdown.transportation = (recommendations.transportation[0].estimatedCost || 0) * 2;
      total += breakdown.transportation;
    }

    return { total, breakdown };
  }

  generateBasicItinerary(recommendations, criteria) {
    // Simple itinerary generation - can be enhanced with AI
    const itinerary = [];
    const startDate = new Date(criteria.departureDate);
    const endDate = new Date(criteria.returnDate);
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      itinerary.push({
        date: date.toISOString().split('T')[0],
        day: i + 1,
        activities: recommendations.activities?.slice(i * 2, (i + 1) * 2) || [],
        restaurants: recommendations.restaurants?.slice(i, i + 1) || [],
        notes: i === 0 ? 'Arrival day' : i === days - 1 ? 'Departure day' : ''
      });
    }

    return itinerary;
  }

  getAgentStatus() {
    return Object.entries(this.agents).map(([name, agent]) => ({
      name,
      status: agent.getStatus()
    }));
  }
}