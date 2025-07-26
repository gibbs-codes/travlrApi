import { TripPlanningAgent } from './baseAgent.js';

export class FlightAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'FlightAgent',
      ['flight_search', 'price_comparison', 'schedule_optimization'],
      aiConfig,
      {
        maxResults: 10,
        providers: ['amadeus', 'skyscanner', 'google_flights']
      }
    );
  }

  async search(criteria) {
    // Mock flight search - replace with actual API calls
    const mockFlights = [
      {
        id: 'FL001',
        airline: 'United Airlines',
        departure: { airport: criteria.origin, time: '08:00', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: '14:30', date: criteria.departureDate },
        price: 450,
        duration: '6h 30m',
        stops: 0,
        class: 'Economy'
      },
      {
        id: 'FL002',
        airline: 'Delta Airlines',
        departure: { airport: criteria.origin, time: '10:15', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: '17:45', date: criteria.departureDate },
        price: 520,
        duration: '7h 30m',
        stops: 1,
        class: 'Economy'
      },
      {
        id: 'FL003',
        airline: 'American Airlines',
        departure: { airport: criteria.origin, time: '16:20', date: criteria.departureDate },
        arrival: { airport: criteria.destination, time: '22:10', date: criteria.departureDate },
        price: 380,
        duration: '5h 50m',
        stops: 0,
        class: 'Economy'
      }
    ];

    // Filter based on criteria
    return mockFlights.filter(flight => {
      if (criteria.maxPrice && flight.price > criteria.maxPrice) return false;
      if (criteria.preferNonStop && flight.stops > 0) return false;
      if (criteria.preferredClass && flight.class !== criteria.preferredClass) return false;
      return true;
    });
  }

  async rank(results) {
    // Rank flights based on multiple factors
    return results.map(flight => ({
      ...flight,
      score: this.calculateFlightScore(flight)
    })).sort((a, b) => b.score - a.score);
  }

  calculateFlightScore(flight) {
    let score = 100;
    
    // Price factor (lower price = higher score)
    score -= (flight.price / 10);
    
    // Non-stop preference
    if (flight.stops === 0) score += 20;
    
    // Duration factor
    const durationHours = parseFloat(flight.duration.split('h')[0]);
    score -= durationHours;
    
    // Time preference (morning and afternoon flights preferred)
    const departureHour = parseInt(flight.departure.time.split(':')[0]);
    if (departureHour >= 8 && departureHour <= 16) score += 10;
    
    return Math.max(0, score);
  }
}