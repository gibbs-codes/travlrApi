// src/agents/flightAgent.js (updated)
import { TripPlanningAgent } from './baseAgent.js';
import amadeusService from '../services/amadeusService.js';

export class FlightAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'FlightAgent',
      ['flight_search', 'price_comparison', 'schedule_optimization'],
      aiConfig,
      {
        maxResults: 10,
        providers: ['amadeus']
      }
    );
  }

  async search(criteria) {
    try {
      console.log('FlightAgent searching with criteria:', criteria);
      
      // Validate required criteria
      if (!criteria.origin || !criteria.destination || !criteria.departureDate) {
        throw new Error('Missing required flight search criteria: origin, destination, departureDate');
      }

      // Call Amadeus API
      const searchParams = {
        origin: criteria.origin,
        destination: criteria.destination,
        departureDate: criteria.departureDate,
        returnDate: criteria.returnDate,
        adults: criteria.travelers || 1,
        maxResults: this.searchConfig.maxResults
      };

      const flights = await amadeusService.searchFlights(searchParams);
      console.log(`Found ${flights.length} flights from Amadeus`);

      // Handle empty results
      if (flights.length === 0) {
        console.log('ℹ️ No flights returned from Amadeus. Possible reasons:');
        console.log('  - Dates may be too far in the future (Amadeus typically supports up to 11 months)');
        console.log('  - No availability for the specified route and dates');
        console.log('  - Route may not be served by any airlines in Amadeus database');

        // Fallback to mock data in development
        if (process.env.NODE_ENV === 'development') {
          console.warn(`⚠️ No flights found from Amadeus for ${criteria.origin} to ${criteria.destination} on ${criteria.departureDate}. Using mock data.`);
          return this.getMockFlights(criteria);
        }

        return flights; // Return empty array in production
      }

      // Apply client-side filtering based on criteria
      return this.applyFilters(flights, criteria);
      
    } catch (error) {
      console.error('FlightAgent search error:', error);
      
      // Fallback to mock data if API fails (for development)
      if (process.env.NODE_ENV === 'development') {
        console.log('Falling back to mock data for development');
        return this.getMockFlights(criteria);
      }
      
      throw error;
    }
  }

  applyFilters(flights, criteria) {
    return flights.filter(flight => {
      // Price filter
      if (criteria.maxPrice && flight.price > criteria.maxPrice) {
        return false;
      }
      
      // Non-stop preference
      if (criteria.preferNonStop && flight.stops > 0) {
        return false;
      }
      
      // Class preference
      if (criteria.preferredClass && flight.class.toLowerCase() !== criteria.preferredClass.toLowerCase()) {
        return false;
      }
      
      return true;
    });
  }

  async rank(results) {
    // Enhanced ranking with real flight data
    return results.map(flight => ({
      ...flight,
      score: this.calculateFlightScore(flight)
    })).sort((a, b) => b.score - a.score);
  }

  calculateFlightScore(flight) {
    let score = 100;
    
    // Price factor (normalize to reasonable range)
    const priceScore = Math.max(0, 50 - (flight.price / 20));
    score += priceScore;
    
    // Non-stop preference (big bonus)
    if (flight.stops === 0) {
      score += 30;
    } else {
      score -= (flight.stops * 10);
    }
    
    // Duration factor (convert PT8H30M to hours)
    const durationHours = this.parseDuration(flight.duration);
    score -= (durationHours * 2);
    
    // Time preference (morning/afternoon flights preferred)
    const departureHour = parseInt(flight.departure.time.split(':')[0]);
    if (departureHour >= 8 && departureHour <= 16) {
      score += 15;
    }
    
    // Class bonus (business/first class gets small bonus)
    if (flight.class === 'BUSINESS') score += 10;
    if (flight.class === 'FIRST') score += 15;
    
    return Math.max(0, score);
  }

  parseDuration(duration) {
    // Parse PT8H30M format to hours
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    return hours + (minutes / 60);
  }

  // Keep mock data as fallback for development
  getMockFlights(criteria) {
    return [
      {
        id: 'MOCK001',
        airline: 'AA',
        departure: { airport: criteria.origin, time: '08:00', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: '14:30', date: criteria.departureDate },
        price: 450,
        currency: 'USD',
        duration: 'PT6H30M',
        stops: 0,
        class: 'ECONOMY'
      }
    ];
  }

  async generateRecommendations(results, task) {
    if (!results || results.length === 0) {
      return {
        recommendations: [],
        confidence: 0,
        reasoning: 'No flights found matching your criteria.',
        metadata: { searchCriteria: task.criteria }
      };
    }

    const prompt = `
You are a travel expert analyzing flight options. Here are the search criteria and results:

Search Criteria:
- Origin: ${task.criteria.origin}
- Destination: ${task.criteria.destination} 
- Departure: ${task.criteria.departureDate}
- Budget: ${task.criteria.maxPrice ? `$${task.criteria.maxPrice} max` : 'No limit'}
- Preferences: ${JSON.stringify(task.criteria)}

Flight Options Found:
${JSON.stringify(results.slice(0, 5), null, 2)}

Please provide:
1. Your top 3 flight recommendations with clear reasoning
2. Key factors you considered (price, duration, stops, timing)
3. Any notable trade-offs or alternatives
4. Confidence score (0-100) based on options available

Be conversational and helpful, like a knowledgeable travel agent.
    `;

    try {
      const aiResponse = await this.generateStructuredResponse(prompt, this.resultSchema);
      
      const topFlights = results.slice(0, 3).map((flight, index) => 
        this.transformFlightRecommendation(flight, index)
      );

      return {
        content: {
          recommendations: topFlights,
          confidence: aiResponse.content.confidence || 85,
          reasoning: aiResponse.content.reasoning || 'Based on price, convenience, and travel time.'
        },
        metadata: {
          totalFound: results.length,
          searchCriteria: task.criteria,
          aiAnalysis: aiResponse.content
        }
      };
    } catch (error) {
      console.error('AI recommendation generation failed:', error);
      
      // Fallback to rule-based recommendations
      const topFlights = results.slice(0, 3).map((flight, index) => 
        this.transformFlightRecommendation(flight, index)
      );

      return {
        content: {
          recommendations: topFlights,
          confidence: 70,
          reasoning: `Found ${results.length} flights. Top options selected based on price, duration, and stops.`
        },
        metadata: { searchCriteria: task.criteria, aiError: error.message }
      };
    }
  }

  transformFlightRecommendation(flight, position = 0) {
    const amount = Number(
      flight?.price?.amount ??
      flight?.price ??
      flight?.cost ??
      0
    );

    const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
    const currency = (flight?.price?.currency || flight?.currency || 'USD').toString().toUpperCase();

    const ratingScore = flight?.rating?.score ?? flight?.rating ?? flight?.score ?? 0;
    const safeRating = Number.isFinite(Number(ratingScore)) ? Number(ratingScore) : 0;

    const departureAirport = flight?.departure?.airport || flight?.origin;
    const arrivalAirport = flight?.arrival?.airport || flight?.destination;

    const name = flight?.name ||
      `${flight?.airline || 'Flight'} ${flight?.flightNumber || flight?.id || position + 1}`.trim();

    const description = flight?.description ||
      `Flight from ${departureAirport || 'origin'} to ${arrivalAirport || 'destination'} on ${flight?.departure?.date || 'selected date'}.`;

    return {
      ...flight,
      name,
      description,
      price: {
        amount: safeAmount,
        currency,
        priceType: 'total'
      },
      rating: {
        score: Math.max(0, Math.min(5, safeRating)),
        reviewCount: flight?.rating?.reviewCount ?? flight?.reviewCount ?? 0,
        source: flight?.rating?.source || flight?.airline || 'flight_agent'
      },
      location: flight?.location || {
        city: arrivalAirport,
        country: flight?.arrival?.country
      },
      agentMetadata: {
        airline: flight?.airline,
        flightNumber: flight?.flightNumber || flight?.id,
        departureAirport,
        departureTime: flight?.departure?.time,
        departureDate: flight?.departure?.date,
        arrivalAirport,
        arrivalTime: flight?.arrival?.time,
        arrivalDate: flight?.arrival?.date,
        duration: flight?.duration,
        stops: flight?.stops ?? 0,
        cabin: flight?.class || flight?.cabin
      }
    };
  }
}
